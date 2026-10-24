# Running Harbor after the official project shut down

The official Harbor project ended in October 2026. `harbor.site` now serves only a "Harbor is Sunsetting" page (citing legal and personal reasons) and the `harborstremio` GitHub organization, its repository, releases and pull requests return 404. This fork (`crazyrabbit0/harbor`) is maintained on its own from here: `main` holds the current code (upstream's final `beta-branch` plus this fork's work), and `beta-branch` stays at upstream's last beta commit.

## What still works

The app talks to Stremio, addons and most metadata services directly, so the core experience is unaffected:

- Stremio sign-in, library and Continue Watching; Cinemeta and installed addons; streams, debrid, torrents and the mpv player.
- TMDB, OMDB, Fanart.tv and RPDB with your own keys.
- Subtitles, and skip intro/outro from SkipDB, TheIntroDB, introdb.app, AniSkip and chapter markers.
- Anime metadata from Kitsu and AniZip, stream ranking, local files, Plex, Jellyfin and Emby.
- TVDB (episode orders, episode lists, artwork, stills, cast, collections), as long as a TVDB API key is set in Settings > Library. Every TVDB request goes straight to `api4.thetvdb.com`; without a key these features stay empty.
- Trakt sign-in, scrobbling and token refresh, through this fork's Trakt app: just connect. Harbor calls `api.trakt.tv` directly with device sign-in and no client secret. You can use an app of your own instead (Settings > Trackers > Trakt > Your Trakt app), and builds can override the default with `VITE_TRAKT_CLIENT_ID`.
- MyAnimeList sign-in and token refresh, through this fork's MAL client (App Type "other", so no secret). Harbor does OAuth2 PKCE (`plain`) against `myanimelist.net/v1/oauth2/token`. The desktop app catches the redirect on `http://localhost:47321/harbor-mal` (`src-tauri/src/mal_auth.rs`); if that port is busy, or in the browser build, you paste the redirected address into Harbor instead. You can use a client of your own instead (register the same redirect URL), and builds can override the default with `VITE_MAL_CLIENT_ID`.
- AniList sign-in, with no setup: the implicit grant on Harbor's AniList client shows the token on AniList's pin page, and you paste it into Harbor.
- Simkl community ratings, straight from `api.simkl.com/ratings`.
- Watch parties through your own Cloudflare relay (Settings > Relay).
- Bug reports from Settings, the crash screen and the menu bar, as prefilled issues on this fork's GitHub (attachments are dragged in on GitHub).
- The speech-to-text model, downloaded from whisper.cpp's Hugging Face repository.
- Chromecast video and audio, through Google's Default Media Receiver.
- In-app updates on Windows, macOS and the Linux AppImage, from this fork's GitHub releases. Builds up to 0.9.201 carry upstream's updater key, so they have to be replaced by hand once with a later release. Rolling back to an earlier build and rating a build (as a GitHub issue) work from Settings > Updates.
- Award badges on movie and show pages (Wikidata plus lists built into the app), anime award badges matched by title (the built-in Crunchyroll, TAAF, Japan Media Arts, Animation Kobe and r/anime lists), and the Discover "Award winners" row, which is built from the built-in award history plus TMDB when a TMDB key is set.
- Static feeds load from this repository's `data/` folder through `raw.githubusercontent.com` (`HARBOR_DATA_BASE` in `src/lib/config/endpoints.ts`), so they work again once `data/` is on `main`: anime award badges matched by Kitsu ID (`anime-awards.json`, built from the bundled award lists and title map), anime hero art (`anime-hero-art.json`, the bundled snapshot), release notes for 0.9.119 to 0.9.128 (`release-notes.json`), and Discord Rich Presence images (the app icon plus award art for the Oscars, Golden Globes, BAFTA, Critics Choice, SAG, Venice, Berlin, Crunchyroll, TAAF, Japan Media Arts and r/anime; Emmy, Cannes and Animation Kobe fall back to the Harbor logo). Feeds whose data could not be recovered ship empty in the shape the app expects and can be filled by pull request: the hosted anime hero, curated logos, announcements, the hosted award-winners and hero pools, the manga source list and the Harbor people rankings.
- IGDB in Games (catalogs, details, completion times, favorites search), once a Twitch client ID and secret are set in Settings > Library > Games. Requests go straight to `id.twitch.tv` and `api.igdb.com`; without the credentials the Games catalog stays empty and says how to add them.
- IMDb ratings on titles and episodes, and the IMDb parents guide with its age rating (hover previews and the player's content advisory), straight from IMDb's public GraphQL endpoint `caching.graphql.imdb.com` with no key (`src/lib/providers/harbor-imdb.ts`). Common Sense Media stays the fallback for the parents guide. The same endpoint fills the player's About panel (title, plot, cast, directors and writers) when no TMDB key is set (`src/lib/providers/imdbapi/imdbapi-details.ts`).
- Browsing and installing community themes, from the read-only index in `data/themes/` (seeded with the built-in presets). New themes join it by pull request (`data/themes/README.md`); publishing, ratings, comments, notifications and the "My themes" tab needed Harbor accounts and are hidden.
- Browsing community collections (Collections > From the community, and Big Picture's Community tab), from the read-only `data/collections/index.json`. Collections join it by pull request (`data/collections/README.md`); sharing to the community from the app and share links still needed Harbor accounts.

## What no longer works

These relied on services hosted at `harbor.site` and its subdomains, which are gone:

| Feature                                                                                                                                                                            | Dead service                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Harbor accounts (sign-in, handles, recovery keys) and TV settings sync through them; the account tab, the Big Picture account step and the account offer in phone setup are hidden | `harbor.site/themes/api`, `/sync/v1`                       |
| Beta and experimental channels                                                                                                                                                     | `harbor.site/updates/...`                                  |
| Theme publishing, ratings and comments, title ratings (the rate button is hidden), profile badges, public profiles, shared collections and lists                                   | `harbor.site/themes/api`, `/collection`, `/list`           |
| Community badge and award bundles (the store tab, the badge settings link and the Support page's badge rows are hidden), and Harbor's own badge packs                              | `harbor.site/themes/api`, `harbor.site/badges`             |
| Shared ad-skip segments and ad reports (the player's report button is hidden)                                                                                                      | `harbor.site/updates/ad-segments.json`, `bugs.harbor.site` |
| Shared subtitle autosync                                                                                                                                                           | `sync.harbor.site`                                         |
| Public watch-party relay (its button is hidden), web invite links and the Discord join and "Listen in Harbor" buttons                                                              | `pub.harbor.site`, `app.harbor.site`                       |
| Suggesting a manga source from the app                                                                                                                                             | `harbor.site/api/manga-sources/suggest`                    |

### Bringing features back without a server

The "repo as a backend" pattern of [Orion Store](https://rookieenough.github.io/Orion-Docs/) fits some of these: static JSON on GitHub Pages or raw GitHub for reads, and for writes a pre-filled GitHub issue (posted from the user's own account) that a scheduled GitHub Action folds into a static file. Anonymous writes need a Cloudflare Worker holding the bot token; a signing secret shipped inside the app is public, so only the Worker's per-IP limits protect it.

| Feature                                                                   | Fit     | How                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discord "Listen in Harbor" and watch-party Join buttons, web invite links | Good    | A static GitHub Pages page that forwards `?relay=…&room=…` to the `harbor://` deep link and offers the download when Harbor isn't installed; Discord buttons need its `https` URL         |
| Player ad report                                                          | Good    | A pre-filled GitHub issue, like build feedback                                                                                                                                            |
| Theme publishing                                                          | Good    | "Submit theme" opens a pre-filled issue and an Action turns it into a `data/themes` pull request; a URL cannot attach the `.harborstyle`, so it goes in the body (65 KB limit) or by hand |
| Theme ratings and comments                                                | Partial | Issues gathered into `data/themes/ratings.json`, comments as one Discussion per theme; both need a GitHub account unless a Worker accepts them anonymously                                |
| Chromecast custom receiver                                                | Partial | The receiver is a static page GitHub Pages can host; registering it costs Google's one-time $5 Cast developer fee                                                                         |
| Community badges and award bundles                                        | Partial | The catalogue can be static `data/`; who earned what lived in Harbor accounts                                                                                                             |
| Title ratings                                                             | No      | Personal data on a public repo; keep them local or send them to Trakt or Simkl                                                                                                            |
| Harbor accounts, profile and TV sync, theme notifications and "My themes" | No      | Need sign-in and private storage                                                                                                                                                          |
| Public watch-party relay                                                  | No      | Needs a live WebSocket server (a Cloudflare Worker with Durable Objects on the project's own account); users can still deploy their own relay                                             |

Every Harbor service base URL can also be pointed elsewhere at build time through `VITE_HARBOR_API_BASE` and the other variables in `src/lib/config/endpoints.ts`; `VITE_HARBOR_DATA_BASE` moves the static feeds (for example to a fork or a branch).

## Building from a fresh clone

- `libmpv-2.dll` (Windows, mpv `v0.41.0-1224-g6a262d11f`, SHA-256 `f2e18b3d4226fe09d54970a9ba1ee89559445a614addc260aa7c911389734ca1`) is too large for git (115 MB, and GitHub refuses Git LFS uploads to a public fork), so it lives as the [`libmpv-f2e18b3d4226` release](https://github.com/crazyrabbit0/harbor-deps/releases/tag/libmpv-f2e18b3d4226) of [`crazyrabbit0/harbor-deps`](https://github.com/crazyrabbit0/harbor-deps), a separate repo that keeps these builds off Harbor's own Releases page. `pnpm run setup:libmpv` downloads it from there into `src-tauri/libmpv/`. If that fails it falls back to [`mpv-dev-x86_64-20261020-git-6a262d11f6.7z`](https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/20261020/mpv-dev-x86_64-20261020-git-6a262d11f6.7z) from `shinchiro/mpv-winbuild-cmake`, whose `libmpv-2.dll` is byte-identical (needs `7z` on PATH). That project keeps only about a month of daily releases, so the harbor-deps release is the copy to rely on. Other builds of the same mpv commit (the `x86_64-v3` variant, `zhongfly/mpv-winbuild`) are not byte-identical.
- `mpv.exe`, ffmpeg, yt-dlp and fonts come from their own public projects and are unaffected.
- `android-extension-compat/tools/deps.sh` still downloads `nanojson-e9d656d.jar` from the deleted repository, so the Android extension layer cannot be provisioned from scratch. Build without it with `HARBOR_CAPSTAN_SRC=<nonexistent dir>` and `HARBOR_CAPSTAN_OPTIONAL=1`.

## Upstream's old `main` branch

Upstream's `main` (kept as the tag `upstream-main`) was an older 0.9.21 line with about 30 commits that never reached beta. Most were earlier versions of work beta later redid (liquid glass, focus styles, Linux SVP, season picker placement). These look genuinely missing from beta and could be ported from the old history if wanted:

| Commit     | Change                                                                |
| ---------- | --------------------------------------------------------------------- |
| `b8bafdad` | Russian UI translation (`ru.json`)                                    |
| `169a4f2a` | Safety net so `layout:custom` themes never end up with no navigation  |
| `c97e7a8f` | Poster images retry after transient load failures (`poster-retry.ts`) |
| `2cf18ad3` | macOS crash on audio device hotplug                                   |
| `15003a6e` | Remember the fullscreen window state                                  |
| `68f050ea` | Block injection through addon-controlled stream URLs                  |
| `a35f59e6` | RTL layout of the PIN entry                                           |
| `e77dc71d` | Leave Linux updates to the package manager                            |

They remain reachable through the `upstream-main` tag.
