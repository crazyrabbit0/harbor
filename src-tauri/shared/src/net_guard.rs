//! Outbound request guards: blocked and non-public addresses, DNS pinning and the pinned-client cache.
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::{Mutex as StdMutex, OnceLock};
use std::time::{Duration, Instant};

pub fn is_blocked_ip(ip: IpAddr) -> bool {
    let ip = match ip {
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => IpAddr::V4(v4),
            None => IpAddr::V6(v6),
        },
        other => other,
    };
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback() || v4.is_link_local() || v4.is_unspecified() || v4.is_broadcast()
        }
        IpAddr::V6(v6) => {
            v6.is_loopback() || v6.is_unspecified() || (v6.segments()[0] & 0xffc0) == 0xfe80
        }
    }
}

pub fn is_public_network_ip(ip: IpAddr) -> bool {
    let ip = match ip {
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => IpAddr::V4(v4),
            None => IpAddr::V6(v6),
        },
        other => other,
    };
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, c, _] = v4.octets();
            !(a == 0
                || a == 10
                || a == 127
                || a >= 224
                || (a == 100 && (64..=127).contains(&b))
                || (a == 169 && b == 254)
                || (a == 172 && (16..=31).contains(&b))
                || (a == 192 && b == 168)
                || (a == 192 && b == 0)
                || (a == 192 && b == 88 && c == 99)
                || (a == 198 && (b == 18 || b == 19))
                || (a == 198 && b == 51 && c == 100)
                || (a == 203 && b == 0 && c == 113))
        }
        IpAddr::V6(v6) => {
            let segments = v6.segments();
            (segments[0] & 0xe000) == 0x2000
                && segments[0] != 0x2002
                && !(segments[0] == 0x2001 && segments[1] == 0x0db8)
                && !(segments[0] == 0x2001 && segments[1] < 0x0200)
        }
    }
}

pub async fn resolve_public_target(url: &reqwest::Url) -> Result<Vec<SocketAddr>, String> {
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(format!("public target bad scheme: {}", url.scheme()));
    }
    let addresses = validate_target(url, false).await?;
    if addresses
        .iter()
        .any(|address| !is_public_network_ip(address.ip()))
    {
        let host = url.host_str().unwrap_or_default();
        return Err(format!("blocked non-public target: {host}"));
    }
    Ok(addresses)
}

const DNS_TIMEOUT: Duration = Duration::from_secs(10);

pub async fn lookup_host(host: &str, port: u16) -> Result<Vec<SocketAddr>, String> {
    let lookup = (host.to_string(), port);
    let task = tokio::task::spawn_blocking(move || {
        use std::net::ToSocketAddrs;
        lookup
            .to_socket_addrs()
            .map(|items| items.collect::<Vec<_>>())
    });
    let mut addresses = match tokio::time::timeout(DNS_TIMEOUT, task).await {
        Ok(Ok(Ok(addresses))) => addresses,
        _ => return Err(format!("target DNS failed: {host}")),
    };
    if addresses.is_empty() {
        return Err(format!("target DNS failed: {host}"));
    }
    addresses.sort_unstable();
    addresses.dedup();
    Ok(addresses)
}

pub fn host_is_blocked_literal(url: &reqwest::Url) -> bool {
    match url.host_str() {
        Some(h) => match h
            .trim_start_matches('[')
            .trim_end_matches(']')
            .parse::<IpAddr>()
        {
            Ok(ip) => is_blocked_ip(ip),
            Err(_) => false,
        },
        None => false,
    }
}

// `allow_local` opts the target out of the SSRF guard for loopback, link-local,
// and private network addresses. It is only set by callers that have explicitly
// received a URL from the user (e.g. wiring up their own self-hosted Suwayomi
// server), never for implicitly-discovered URLs.
// Returns the addresses the request must connect to; callers pin them so the send cannot re-resolve.
pub async fn validate_target(
    url: &reqwest::Url,
    allow_local: bool,
) -> Result<Vec<SocketAddr>, String> {
    let host = url
        .host_str()
        .map(|h| h.trim_start_matches('[').trim_end_matches(']').to_string())
        .filter(|h| !h.is_empty())
        .ok_or_else(|| "target has no host".to_string())?;
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "target has no port".to_string())?;
    if let Ok(ip) = host.parse::<IpAddr>() {
        if host_is_blocked_literal(url) && !allow_local {
            return Err(format!("blocked internal target: {}", host));
        }
        return Ok(vec![SocketAddr::new(ip, port)]);
    }
    let addresses = lookup_host(&host, port).await?;
    if !allow_local && addresses.iter().any(|a| is_blocked_ip(a.ip())) {
        return Err(format!("blocked internal target: {}", host));
    }
    Ok(addresses)
}

pub fn pinned_client(
    builder: reqwest::ClientBuilder,
    url: &reqwest::Url,
    addresses: &[SocketAddr],
) -> Result<reqwest::Client, String> {
    let builder = match url.host_str() {
        Some(host) if url.domain().is_some() => builder.resolve_to_addrs(host, addresses),
        _ => builder,
    };
    builder.build().map_err(|error| format!("client: {error}"))
}

const CLIENT_CACHE_TTL: Duration = Duration::from_secs(60);
const CLIENT_CACHE_MAX_ENTRIES: usize = 64;

// A client is reused only for the exact origin and validated address set it was pinned to.
#[derive(Clone, PartialEq, Eq, Hash)]
struct ClientKey {
    scheme: String,
    host: String,
    port: u16,
    addresses: Vec<SocketAddr>,
}

impl ClientKey {
    fn new(url: &reqwest::Url, addresses: &[SocketAddr]) -> Self {
        let mut addresses = addresses.to_vec();
        addresses.sort_unstable();
        addresses.dedup();
        Self {
            scheme: url.scheme().to_string(),
            host: url.host_str().unwrap_or_default().to_ascii_lowercase(),
            port: url.port_or_known_default().unwrap_or(0),
            addresses,
        }
    }
}

struct CachedClient<T> {
    client: T,
    created: Instant,
    last_used: Instant,
}

struct ClientCache<T> {
    entries: HashMap<ClientKey, CachedClient<T>>,
}

impl<T: Clone> ClientCache<T> {
    fn new() -> Self {
        Self { entries: HashMap::new() }
    }

    fn get(&mut self, key: &ClientKey, now: Instant) -> Option<T> {
        self.entries
            .retain(|_, entry| now.duration_since(entry.created) < CLIENT_CACHE_TTL);
        let entry = self.entries.get_mut(key)?;
        entry.last_used = now;
        Some(entry.client.clone())
    }

    // Keeps a fresh entry another caller inserted meanwhile, so concurrent misses share one client.
    fn insert(&mut self, key: ClientKey, client: T, now: Instant) -> T {
        if let Some(existing) = self.get(&key, now) {
            return existing;
        }
        while self.entries.len() >= CLIENT_CACHE_MAX_ENTRIES {
            let oldest = self
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.last_used)
                .map(|(key, _)| key.clone());
            match oldest {
                Some(oldest) => self.entries.remove(&oldest),
                None => break,
            };
        }
        let entry = CachedClient { client: client.clone(), created: now, last_used: now };
        self.entries.insert(key, entry);
        client
    }
}

fn client_cache() -> &'static StdMutex<ClientCache<reqwest::Client>> {
    static CACHE: OnceLock<StdMutex<ClientCache<reqwest::Client>>> = OnceLock::new();
    CACHE.get_or_init(|| StdMutex::new(ClientCache::new()))
}

fn cached_pinned_client(
    url: &reqwest::Url,
    addresses: &[SocketAddr],
) -> Result<reqwest::Client, String> {
    let key = ClientKey::new(url, addresses);
    let lock = || client_cache().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(client) = lock().get(&key, Instant::now()) {
        return Ok(client);
    }
    let client = pinned_client(http_client_builder(), url, addresses)?;
    Ok(lock().insert(key, client, Instant::now()))
}

// Validates every hop; only the client pinned to an identical validated address set is reused.
pub async fn hop_client(
    url: &reqwest::Url,
    allow_local: bool,
    public_network_only: bool,
) -> Result<reqwest::Client, String> {
    let addresses = if public_network_only {
        resolve_public_target(url).await?
    } else {
        validate_target(url, allow_local).await?
    };
    cached_pinned_client(url, &addresses)
}

pub fn http_client_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .pool_idle_timeout(Duration::from_secs(30))
        .pool_max_idle_per_host(8)
}

pub async fn public_http_client(url: &reqwest::Url) -> Result<reqwest::Client, String> {
    hop_client(url, false, true).await
}

#[cfg(test)]
mod tests {
    use super::{
        hop_client, host_is_blocked_literal, is_public_network_ip, validate_target, ClientCache,
        ClientKey, CLIENT_CACHE_MAX_ENTRIES, CLIENT_CACHE_TTL,
    };
    use std::net::SocketAddr;
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    fn key(url: &str, addresses: &[&str]) -> ClientKey {
        let url: reqwest::Url = url.parse().unwrap();
        let addresses: Vec<SocketAddr> = addresses.iter().map(|a| a.parse().unwrap()).collect();
        ClientKey::new(&url, &addresses)
    }

    #[test]
    fn client_cache_reuses_client_for_same_host_and_addresses() {
        let mut cache = ClientCache::new();
        let now = Instant::now();
        let first = cache.insert(key("https://a.test/x", &["1.1.1.1:443", "1.0.0.1:443"]), Arc::new(1), now);
        let reordered = key("https://a.test/y", &["1.0.0.1:443", "1.1.1.1:443"]);
        let hit = cache.get(&reordered, now).expect("same address set hits");
        assert!(Arc::ptr_eq(&first, &hit));
        let raced = cache.insert(reordered, Arc::new(2), now);
        assert!(Arc::ptr_eq(&first, &raced));
    }

    #[test]
    fn client_cache_misses_when_addresses_or_origin_differ() {
        let mut cache = ClientCache::new();
        let now = Instant::now();
        cache.insert(key("https://a.test/", &["1.1.1.1:443"]), Arc::new(1), now);
        assert!(cache.get(&key("https://a.test/", &["8.8.8.8:443"]), now).is_none());
        assert!(cache.get(&key("https://a.test/", &["1.1.1.1:443", "8.8.8.8:443"]), now).is_none());
        assert!(cache.get(&key("http://a.test:443/", &["1.1.1.1:443"]), now).is_none());
        assert!(cache.get(&key("https://b.test/", &["1.1.1.1:443"]), now).is_none());
    }

    #[test]
    fn client_cache_expires_entries_after_ttl() {
        let mut cache = ClientCache::new();
        let now = Instant::now();
        let k = key("https://a.test/", &["1.1.1.1:443"]);
        cache.insert(k.clone(), Arc::new(1), now);
        assert!(cache.get(&k, now + CLIENT_CACHE_TTL - Duration::from_secs(1)).is_some());
        assert!(cache.get(&k, now + CLIENT_CACHE_TTL).is_none());
        assert!(cache.entries.is_empty());
    }

    #[test]
    fn client_cache_evicts_least_recently_used_beyond_bound() {
        let mut cache = ClientCache::new();
        let now = Instant::now();
        let first = key("https://h0.test/", &["1.1.1.1:443"]);
        cache.insert(first.clone(), Arc::new(0), now);
        for i in 1..CLIENT_CACHE_MAX_ENTRIES {
            let at = now + Duration::from_millis(i as u64);
            cache.insert(key(&format!("https://h{i}.test/"), &["1.1.1.1:443"]), Arc::new(i), at);
        }
        let touched = now + Duration::from_millis(500);
        assert!(cache.get(&first, touched).is_some());
        let extra = key("https://extra.test/", &["1.1.1.1:443"]);
        cache.insert(extra.clone(), Arc::new(99), touched + Duration::from_millis(1));
        assert_eq!(cache.entries.len(), CLIENT_CACHE_MAX_ENTRIES);
        assert!(cache.entries.contains_key(&first));
        assert!(cache.entries.contains_key(&extra));
        assert!(!cache.entries.contains_key(&key("https://h1.test/", &["1.1.1.1:443"])));
    }

    #[tokio::test]
    async fn hop_client_reuses_pinned_client_after_revalidation() {
        let url: reqwest::Url = "http://127.0.0.1:4568/".parse().unwrap();
        let first = hop_client(&url, true, false).await.unwrap();
        let second = hop_client(&url, true, false).await.unwrap();
        let addresses = validate_target(&url, true).await.unwrap();
        let cached = super::client_cache().lock().unwrap().get(&ClientKey::new(&url, &addresses), Instant::now());
        assert!(cached.is_some());
        drop((first, second));
        assert!(hop_client(&url, false, false).await.is_err(), "validation still runs on a cached host");
    }

    #[test]
    fn provider_public_network_policy_rejects_local_and_reserved_ranges() {
        for value in [
            "127.0.0.1",
            "10.0.0.1",
            "172.16.0.1",
            "192.168.1.1",
            "100.64.0.1",
            "169.254.1.1",
            "198.18.0.1",
            "203.0.113.1",
            "::1",
            "fe80::1",
            "fc00::1",
            "fec0::1",
            "2001:db8::1",
            "2002:0a00:0001::1",
            "::ffff:127.0.0.1",
        ] {
            let ip: std::net::IpAddr = value.parse().unwrap();
            assert!(!is_public_network_ip(ip), "{value}");
        }
        for value in ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"] {
            let ip: std::net::IpAddr = value.parse().unwrap();
            assert!(is_public_network_ip(ip), "{value}");
        }
    }

    #[test]
    fn guarded_fetch_blocks_loopback_literals() {
        for value in [
            "http://127.0.0.1:4567/api",
            "http://[::1]:4567/api",
            "http://[::ffff:127.0.0.1]:4567/api",
            "http://0.0.0.0:4567/api",
            "http://169.254.169.254/latest/meta-data/",
        ] {
            let url: reqwest::Url = value.parse().unwrap();
            assert!(host_is_blocked_literal(&url), "{value}");
        }
        for value in [
            "http://sonicbit.example.com:4567/api",
            "http://192.168.1.10:4567/api",
            "http://8.8.8.8:4567/api",
        ] {
            let url: reqwest::Url = value.parse().unwrap();
            assert!(!host_is_blocked_literal(&url), "{value}");
        }
    }

    #[tokio::test]
    async fn validate_target_respects_allow_local() {
        for value in [
            "http://127.0.0.1:4567/api",
            "http://[::1]:4567/api",
            "http://[::ffff:127.0.0.1]:4567/api",
            "http://0.0.0.0:4567/api",
            "http://169.254.169.254/latest/meta-data/",
        ] {
            let url: reqwest::Url = value.parse().unwrap();
            assert!(
                validate_target(&url, false).await.is_err(),
                "{value} blocked"
            );
            assert!(
                validate_target(&url, true).await.is_ok(),
                "{value} allowed with allow_local"
            );
        }
        for value in ["http://192.168.1.10:4567/api", "http://8.8.8.8:4567/api"] {
            let url: reqwest::Url = value.parse().unwrap();
            assert!(
                validate_target(&url, false).await.is_ok(),
                "{value} public ok"
            );
        }
    }

    #[tokio::test]
    async fn validate_target_fails_closed_when_dns_lookup_fails() {
        let url: reqwest::Url = "http://nonexistent-host.invalid/".parse().unwrap();
        assert!(validate_target(&url, false).await.is_err());
        assert!(validate_target(&url, true).await.is_err());
    }

    #[tokio::test]
    async fn validate_target_returns_only_allowed_pinned_addresses() {
        for value in ["http://localhost:4567/api", "http://127.0.0.1:4567/api"] {
            let url: reqwest::Url = value.parse().unwrap();
            assert!(validate_target(&url, false).await.is_err(), "{value} blocked");
            let addresses = validate_target(&url, true).await.unwrap();
            assert!(!addresses.is_empty(), "{value} resolves");
            assert!(
                addresses.iter().all(|a| a.ip().is_loopback() && a.port() == 4567),
                "{value} pinned to loopback:4567"
            );
        }
        let url: reqwest::Url = "http://192.168.1.10/api".parse().unwrap();
        let addresses = validate_target(&url, false).await.unwrap();
        assert_eq!(addresses, vec!["192.168.1.10:80".parse().unwrap()]);
    }

    #[tokio::test]
    async fn every_hop_client_goes_through_target_validation() {
        for value in ["http://127.0.0.1/", "http://localhost/", "http://nonexistent-host.invalid/"] {
            let url: reqwest::Url = value.parse().unwrap();
            assert!(hop_client(&url, false, false).await.is_err(), "{value} blocked");
            assert!(hop_client(&url, false, true).await.is_err(), "{value} public-only blocked");
        }
        let url: reqwest::Url = "http://127.0.0.1:4567/".parse().unwrap();
        assert!(hop_client(&url, true, false).await.is_ok());
        let url: reqwest::Url = "http://nonexistent-host.invalid/".parse().unwrap();
        assert!(hop_client(&url, true, false).await.is_err());
    }
}
