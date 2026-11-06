//! The local IPv4 addresses the OS routes through; connecting a UDP socket sends no packet.
use std::net::{IpAddr, Ipv4Addr, UdpSocket};

pub fn local_ipv4_interfaces() -> Vec<Ipv4Addr> {
    let mut out: Vec<Ipv4Addr> = Vec::new();
    let probe_targets = ["1.1.1.1:80", "8.8.8.8:80", "192.168.1.1:80"];
    for target in probe_targets {
        if let Ok(s) = UdpSocket::bind("0.0.0.0:0") {
            if s.connect(target).is_ok() {
                if let Ok(addr) = s.local_addr() {
                    if let IpAddr::V4(v4) = addr.ip() {
                        if !v4.is_loopback() && !v4.is_unspecified() && !out.contains(&v4) {
                            out.push(v4);
                        }
                    }
                }
            }
        }
    }
    // A full-tunnel VPN takes every probe route above, so the LAN address only shows up here.
    for iface in if_addrs::get_if_addrs().unwrap_or_default() {
        if let IpAddr::V4(v4) = iface.ip() {
            if !v4.is_loopback() && !v4.is_unspecified() && !out.contains(&v4) {
                out.push(v4);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    #[test]
    fn every_interface_address_is_listed_even_off_the_default_route() {
        let listed = super::local_ipv4_interfaces();
        for iface in if_addrs::get_if_addrs().unwrap() {
            if let std::net::IpAddr::V4(v4) = iface.ip() {
                if !v4.is_loopback() {
                    assert!(listed.contains(&v4), "{v4} missing from {listed:?}");
                }
            }
        }
    }
}

#[tauri::command]
pub fn lan_ip() -> Option<String> {
    local_ipv4_interfaces()
        .into_iter()
        .next()
        .map(|ip| ip.to_string())
}
