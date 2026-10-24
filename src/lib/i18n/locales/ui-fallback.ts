// Newly introduced UI copy remains usable until each locale provides an override.
const uiFallback: Record<string, string> = {
  "Big Picture display": "Big Picture display",
  "Which monitor Big Picture opens on at startup.":
    "Which monitor Big Picture opens on at startup.",
  "Separate window display": "Separate window display",
  "Which monitor the separate mpv window opens on. Harbor's own window stays where it is.":
    "Which monitor the separate mpv window opens on. Harbor's own window stays where it is.",
  "Cover the taskbar": "Cover the taskbar",
  "Span the whole screen including the taskbar. Turn off to keep the taskbar visible on that monitor.":
    "Span the whole screen including the taskbar. Turn off to keep the taskbar visible on that monitor.",
  "True HDR, separate window is selected. That mode always plays in its own window, so mpv cannot be embedded. Choose a different HDR mode to change this.":
    "True HDR, separate window is selected. That mode always plays in its own window, so mpv cannot be embedded. Choose a different HDR mode to change this.",
  "Follow Harbor": "Follow Harbor",
  "Open on the same monitor as Harbor": "Open on the same monitor as Harbor",
  "Open on {name}": "Open on {name}",
  Primary: "Primary",
  "A source couldn't be reached": "A source couldn't be reached",
  "{n} sources couldn't be reached": "{n} sources couldn't be reached",
  "blocked by the network policy": "blocked by the network policy",
  "timed out": "timed out",
  "returned an error": "returned an error",
  "couldn't be reached": "couldn't be reached",
  "{ok} updated · {failed} failed": "{ok} updated · {failed} failed",
  "Added · refresh for updates": "Added · refresh for updates",
  "Refresh subtitle": "Refresh subtitle",
  "Translating… try again in a minute": "Translating… try again in a minute",
  "Translating… we'll add it when it's ready": "Translating… we'll add it when it's ready",
  Translations: "Translations",
  "Showing {lang}": "Showing {lang}",
  "Sends HDR to the display through macOS EDR instead of mapping it down to SDR. Needs HDR-to-SDR tonemapping off, mpv embedded, and a display with HDR headroom. Takes effect on the next video. Experimental: color can look flat, and an SDR video after an HDR one may need a window resize.":
    "Sends HDR to the display through macOS EDR instead of mapping it down to SDR. Needs HDR-to-SDR tonemapping off, mpv embedded, and a display with HDR headroom. Takes effect on the next video. Experimental: color can look flat, and an SDR video after an HDR one may need a window resize.",
  "Hide this tab": "Hide this tab",
  "Show this tab": "Show this tab",
  "Nothing hidden.": "Nothing hidden.",
  "Edit sidebar": "Edit sidebar",
  "Show all tabs": "Show all tabs",
  "Hide categories from recommendations. Customize tabs separately in the sidebar.":
    "Hide categories from recommendations. Customize tabs separately in the sidebar.",
  "Hides anime titles from Home, Discover, Top 10, and catalogs. Western animation stays visible. To hide the Anime tab, edit the sidebar.":
    "Hides anime titles from Home, Discover, Top 10, and catalogs. Western animation stays visible. To hide the Anime tab, edit the sidebar.",
  "Could not sync your display name. Check your connection and try again.":
    "Could not sync your display name. Check your connection and try again.",
  "Syncing display name…": "Syncing display name…",
  "Display name saved to your Harbor account.": "Display name saved to your Harbor account.",
  "Show ignore title button": "Show ignore title button",
  "Display a button on the content advisory card to permanently ignore the title.":
    "Display a button on the content advisory card to permanently ignore the title.",
  "These are compiled Android extensions (.cs3). Harbor runs script plugins only, so they cannot be installed here.":
    "These are compiled Android extensions (.cs3). Harbor runs script plugins only, so they cannot be installed here.",
  "This is a Stremio addon manifest. Add it from the Addons page instead.":
    "This is a Stremio addon manifest. Add it from the Addons page instead.",
  "Skipped: {reason}": "Skipped: {reason}",
  "Share as link": "Share as link",
  "Back in two weeks": "Back in two weeks",
  "Never shown again": "Never shown again",
  "Directed by {name}": "Directed by {name}",
  "Click to choose": "Click to choose",
  "Default drifts through backdrops from what's trending. Boat plays a hand drawn illustration. Custom plays your own videos, GIFs, or images.":
    "Default drifts through backdrops from what's trending. Boat plays a hand drawn illustration. Custom plays your own videos, GIFs, or images.",
  Boat: "Boat",
  "Your screensavers": "Your screensavers",
  "Add videos, GIFs, or images from this computer. Videos loop with the sound off, and everything fills the screen.":
    "Add videos, GIFs, or images from this computer. Videos loop with the sound off, and everything fills the screen.",
  "Nothing added yet. The default screensaver plays until you add one.":
    "Nothing added yet. The default screensaver plays until you add one.",
  "Add video, GIF, or image": "Add video, GIF, or image",
  "Try it now": "Try it now",
  GIF: "GIF",
  "{kind} · In use": "{kind} · In use",
  Use: "Use",
  "Who's watching background": "Who's watching background",
  "Shown behind the profile picker only. It does not change the app theme or wallpaper.":
    "Shown behind the profile picker only. It does not change the app theme or wallpaper.",
  "No background yet. The picker blurs the app behind it.":
    "No background yet. The picker blurs the app behind it.",
  "Who's watching preview": "Who's watching preview",
  "Profile names and avatars should stay readable at this dim.":
    "Profile names and avatars should stay readable at this dim.",
  "0% shows the raw image. 100% covers it in black. 60-80% keeps profiles readable.":
    "0% shows the raw image. 100% covers it in black. 60-80% keeps profiles readable.",
  "Highest rated on IMDb": "Highest rated on IMDb",
  "Prefer episode still artwork": "Prefer episode still artwork",
  "Show the detail page's episode still on the card instead of your saved frame. The saved frame is kept as a fallback when no still exists.":
    "Show the detail page's episode still on the card instead of your saved frame. The saved frame is kept as a fallback when no still exists.",
  "View experimental changelog": "View experimental changelog",
  "Report an issue": "Report an issue",
  "A short note about this list": "A short note about this list",
  "Return to beta": "Return to beta",
  "Experimental {version} · Build {buildId}": "Experimental {version} · Build {buildId}",
  "Couldn't verify your Harbor account access. Check your connection and try again.":
    "Couldn't verify your Harbor account access. Check your connection and try again.",
  "No verified experimental build is available for this device yet.":
    "No verified experimental build is available for this device yet.",
  "No tested return to beta is available for this build.":
    "No tested return to beta is available for this build.",
  "The experimental build changed during the check. Check again before downloading.":
    "The experimental build changed during the check. Check again before downloading.",
  "Couldn't check experimental builds. Check your connection and try again.":
    "Couldn't check experimental builds. Check your connection and try again.",
  "Couldn't verify this return to beta. Check your connection and try again.":
    "Couldn't verify this return to beta. Check your connection and try again.",
  "Couldn't save the recovery backup. Free some storage and try again.":
    "Couldn't save the recovery backup. Free some storage and try again.",
  "Return to beta did not finish. Your recovery files have been kept. Try again from Experimental builds.":
    "Return to beta did not finish. Your recovery files have been kept. Try again from Experimental builds.",
  "Harbor Setup did not finish updating Harbor. Check for updates to try again.":
    "Harbor Setup did not finish updating Harbor. Check for updates to try again.",
  "Couldn't save the update channel. Free some storage and try again.":
    "Couldn't save the update channel. Free some storage and try again.",
  "Leave experimental builds before changing your normal update channel.":
    "Leave experimental builds before changing your normal update channel.",
  "Finish the current download or installation before changing channels.":
    "Finish the current download or installation before changing channels.",
  "Continue the return to beta in Experimental builds below.":
    "Continue the return to beta in Experimental builds below.",
  "No newer experimental build is available for this device.":
    "No newer experimental build is available for this device.",
  "Replace this experimental installation with a tested beta. Compatible settings and watch progress stay in place. Beta updates resume after a successful restart.":
    "Replace this experimental installation with a tested beta. Compatible settings and watch progress stay in place. Beta updates resume after a successful restart.",
  "Automatic return to beta is not available for this platform yet.":
    "Automatic return to beta is not available for this platform yet.",
  "Beta version": "Beta version",
  "Choose a tested beta": "Choose a tested beta",
  "Beta {version}": "Beta {version}",
  "Harbor saves a local recovery backup before installing. It can contain account details. Old backups are not restored automatically, and recovery files use extra disk space.":
    "Harbor saves a local recovery backup before installing. It can contain account details. Old backups are not restored automatically, and recovery files use extra disk space.",
  "Install beta {version} and restart? This replaces the experimental app, not your current settings.":
    "Install beta {version} and restart? This replaces the experimental app, not your current settings.",
  "Install beta {version} and restart": "Install beta {version} and restart",
  "Download and verify beta": "Download and verify beta",
  "Downloading beta: {pct}%": "Downloading beta: {pct}%",
  "Saving recovery files and installing beta…": "Saving recovery files and installing beta…",
  "Beta download verified. Ready to install.": "Beta download verified. Ready to install.",
  "Checking the selected beta…": "Checking the selected beta…",
  "Experimental builds": "Experimental builds",
  "Return to a regular build": "Return to a regular build",
  "Experimental access requires a Harbor account with a Tester, Moderator, Admin, or Dev badge.":
    "Experimental access requires a Harbor account with a Tester, Moderator, Admin, or Dev badge.",
  "Checking experimental builds…": "Checking experimental builds…",
  "Experimental updates are enabled on this device.":
    "Experimental updates are enabled on this device.",
  "Experimental updates are off.": "Experimental updates are off.",
  "Test upcoming changes": "Test upcoming changes",
  "Available to Harbor accounts with a Tester, Moderator, Admin, or Dev badge.":
    "Available to Harbor accounts with a Tester, Moderator, Admin, or Dev badge.",
  "These builds may crash or change your settings. Back up Harbor before installing. Downloads and installation still require your approval.":
    "These builds may crash or change your settings. Back up Harbor before installing. Downloads and installation still require your approval.",
  "Installed: Harbor {version}": "Installed: Harbor {version}",
  "Update channel: {channel}": "Update channel: {channel}",
  "Experimental installation currently requires a managed Windows installation with a tested return to beta.":
    "Experimental installation currently requires a managed Windows installation with a tested return to beta.",
  "Leave experimental builds": "Leave experimental builds",
  "Enable experimental builds": "Enable experimental builds",
  "View experimental update": "View experimental update",
  "Check experimental builds": "Check experimental builds",
  "Enable experimental updates on this device? This replaces your normal update feed until you leave. It does not install a build now.":
    "Enable experimental updates on this device? This replaces your normal update feed until you leave. It does not install a build now.",
  "Enable and check": "Enable and check",
  "Leaving only turns off experimental checks. Use Return to beta below to replace the experimental app.":
    "Leaving only turns off experimental checks. Use Return to beta below to replace the experimental app.",
  "Find on your sources": "Find on your sources",
  "Search your manga sources": "Search your manga sources",
  "Add a manga source first — a Suwayomi server, Mangayomi, a local folder, or a plugin — then pick the matching copy here.":
    "Add a manga source first — a Suwayomi server, Mangayomi, a local folder, or a plugin — then pick the matching copy here.",
  "Searching your sources…": "Searching your sources…",
  "No match on your extensions. Edit the query above or check the language filter in the manga tab.":
    "No match on your extensions. Edit the query above or check the language filter in the manga tab.",
  "Everything from {name}": "Everything from {name}",
  "Filter, sort and search the full catalogue": "Filter, sort and search the full catalogue",
  Launch: "Launch",
  "Start Harbor in the couch-friendly Big Picture layout whenever the app opens.":
    "Start Harbor in the couch-friendly Big Picture layout whenever the app opens.",
  "Animate backdrop art on Big Picture screens.": "Animate backdrop art on Big Picture screens.",
  "Press Esc to stop.": "Press Esc to stop.",
  "Harbor and the installer": "Harbor and the installer",
  "The Big Picture opener and the boat that builds itself while Harbor installs.":
    "The Big Picture opener and the boat that builds itself while Harbor installs.",
  "The General": "The General",
  "Anime upscalers": "Anime upscalers",
  "Screensaver style": "Screensaver style",
  "Cinematic drifts through backdrops from what's trending. Cat and boat plays a hand drawn illustration instead.":
    "Cinematic drifts through backdrops from what's trending. Cat and boat plays a hand drawn illustration instead.",
  "Cat and boat": "Cat and boat",
  "Desktop notifications": "Desktop notifications",
  "Get a system notification on this device when something you follow drops.":
    "Get a system notification on this device when something you follow drops.",
  "Notifications are blocked for Harbor. Enable them in your system settings, then turn this back on.":
    "Notifications are blocked for Harbor. Enable them in your system settings, then turn this back on.",
  "Add a Discord or Telegram destination, or turn on Desktop notifications, first. Rules need somewhere to send their alerts.":
    "Add a Discord or Telegram destination, or turn on Desktop notifications, first. Rules need somewhere to send their alerts.",
  "Show a system notification on this device.": "Show a system notification on this device.",
  "Turn on Desktop notifications on the Destinations tab first.":
    "Turn on Desktop notifications on the Destinations tab first.",
  "Harbor test message ({service}). If you can read this, it's wired up.":
    "Harbor test message ({service}). If you can read this, it's wired up.",
  "Connect Discord or Telegram, or turn on desktop notifications, and Harbor alerts you when something you follow is about to drop. Hit Send test to send yourself a sample first.":
    "Connect Discord or Telegram, or turn on desktop notifications, and Harbor alerts you when something you follow is about to drop. Hit Send test to send yourself a sample first.",
  "Manga sync": "Manga sync",
  "{title} · Chapter {chapter}": "{title} · Chapter {chapter}",
  "Reorder extensions": "Reorder extensions",
  "Reset order": "Reset order",
  "Filter sources...": "Filter sources...",
  Scanlator: "Scanlator",
  "Resolving pages": "Resolving pages",
  "Match manga": "Match manga",
  "Choose a match, or select None to skip": "Choose a match, or select None to skip",
  "Search title on {tracker}": "Search title on {tracker}",
  "Select this if you don't want to sync to {tracker}":
    "Select this if you don't want to sync to {tracker}",
  "No matches. Check the search box or try a different title.":
    "No matches. Check the search box or try a different title.",
  "★ {n}": "★ {n}",
  "Tip: press": "Tip: press",
  "to reopen this anytime": "to reopen this anytime",
  "Chapter progress": "Chapter progress",
  "Download current page": "Download current page",
  "Download page": "Download page",
  "Updating... ({n}/{total})": "Updating... ({n}/{total})",
  "Update all ({n})": "Update all ({n})",
  "The lists you created, full of saved manga": "The lists you created, full of saved manga",
  "Show cursor": "Show cursor",
  "When off, the right stick no longer shows a cursor on screen. Focus navigation still works.":
    "When off, the right stick no longer shows a cursor on screen. Focus navigation still works.",
  "Hide after idle": "Hide after idle",
  "The cursor fades away when you stop moving the stick. Move it again to bring it back.":
    "The cursor fades away when you stop moving the stick. Move it again to bring it back.",
  "{n} s": "{n} s",
  "In the manga reader.": "In the manga reader.",
  "Choose whether the content advisory appears in full color or a restrained monochrome tone.":
    "Choose whether the content advisory appears in full color or a restrained monochrome tone.",
  "Content advisory theme": "Content advisory theme",
  Monochrome: "Monochrome",
  "#": "#",
  "%": "%",
  "1 minute": "1 minute",
  "1 second": "1 second",
  "1280 × 720.": "1280 × 720.",
  "14s": "14s",
  "1920 × 1080. This is what the Watch Trailer button targets.":
    "1920 × 1080. This is what the Watch Trailer button targets.",
  "2 minutes": "2 minutes",
  "20s": "20s",
  "6-digit code": "6-digit code",
  "640 × 360. Fastest to start, softest picture.": "640 × 360. Fastest to start, softest picture.",
  "90 seconds": "90 seconds",
  "A Letterboxd list you added by address.": "A Letterboxd list you added by address.",
  "A list by {owner}, {n} films.": "A list by {owner}, {n} films.",
  "A list by {owner}.": "A list by {owner}.",
  "A pack file lists your images with names and sets. Point items at files next to the JSON, at http links, or inline them as data URIs. Hover a set you imported and press Export to write one out.":
    "A pack file lists your images with names and sets. Point items at files next to the JSON, at http links, or inline them as data URIs. Hover a set you imported and press Export to write one out.",
  "A pack swaps Harbor's built-in badge art, or adds whole new badges of its own.":
    "A pack swaps Harbor's built-in badge art, or adds whole new badges of its own.",
  "A regular expression Harbor tests against each stream title. Every stream that matches gets this badge.":
    "A regular expression Harbor tests against each stream title. Every stream that matches gets this badge.",
  "A rule watches for one kind of release and pings the channels you pick. Each rule fires on its own.":
    "A rule watches for one kind of release and pings the channels you pick. Each rule fires on its own.",
  "A short hand-picked list, plus a box for pasting any badges.json link you were sent.":
    "A short hand-picked list, plus a box for pasting any badges.json link you were sent.",
  "A stream row in the play picker": "A stream row in the play picker",
  "API-Sports": "API-Sports",
  "API-Sports key": "API-Sports key",
  "API-Sports · leagues ESPN does not carry": "API-Sports · leagues ESPN does not carry",
  Acknowledgements: "Acknowledgements",
  "Add a Discord or Telegram destination first. Rules need somewhere to send their alerts.":
    "Add a Discord or Telegram destination first. Rules need somewhere to send their alerts.",
  "Add a Discord webhook URL on the Destinations tab first.":
    "Add a Discord webhook URL on the Destinations tab first.",
  "Add a Telegram bot token on the Destinations tab first.":
    "Add a Telegram bot token on the Destinations tab first.",
  "Add a rule": "Add a rule",
  "Add an IPTV source": "Add an IPTV source",
  "Add another home server": "Add another home server",
  "Add people in the Custom calendar manager first, then come back to this rule.":
    "Add people in the Custom calendar manager first, then come back to this rule.",
  "Add teams": "Add teams",
  "Add to your teams": "Add to your teams",
  "Addons ({n})": "Addons ({n})",
  "Adds a comments section to movie, show, and episode pages. No Trakt account needed to read them.":
    "Adds a comments section to movie, show, and episode pages. No Trakt account needed to read them.",
  "Adds it to the top of your list, already switched on.":
    "Adds it to the top of your list, already switched on.",
  "Adds the New York Times bestseller lists to the eBook page, on the hero and as a row, with rank and weeks on the list. Free key at":
    "Adds the New York Times bestseller lists to the eBook page, on the hero and as a row, with rank and weeks on the list. Free key at",
  "Advanced: use an access token": "Advanced: use an access token",
  "Aggregator addons": "Aggregator addons",
  "All listed rules": "All listed rules",
  "All selected": "All selected",
  "Linking your Discord account also joins you to Harbor's Discord server, so the bot can send your Backup keys privately.":
    "Linking your Discord account also joins you to Harbor's Discord server, so the bot can send your Backup keys privately.",
  "Also joins Harbor's Discord server.": "Also joins Harbor's Discord server.",
  "Always use for {league}": "Always use for {league}",
  "An accent line down the side, with each line revealed as it arrives.":
    "An accent line down the side, with each line revealed as it arrives.",
  "Animated sidebar icons": "Animated sidebar icons",
  "Another shortcut in this list now uses the same key. Change one of them.":
    "Another shortcut in this list now uses the same key. Change one of them.",
  "Any badges.json address works: a raw gist, Pastebin, or a file in a repo. Broken JSON gets repaired automatically.":
    "Any badges.json address works: a raw gist, Pastebin, or a file in a repo. Broken JSON gets repaired automatically.",
  "Anything TMDB has not translated stays in English. Picking a new language reloads Harbor.":
    "Anything TMDB has not translated stays in English. Picking a new language reloads Harbor.",
  "Appears in the release notes. Use whatever name you want credit under.":
    "Appears in the release notes. Use whatever name you want credit under.",
  "Apply and reload": "Apply and reload",
  "Attach a channel": "Attach a channel",
  "Attach a stream": "Attach a stream",
  "Auto uses mpv when Harbor can reach it and falls back to the built in player. Pick one yourself if playback misbehaves.":
    "Auto uses mpv when Harbor can reach it and falls back to the built in player. Pick one yourself if playback misbehaves.",
  Automatic: "Automatic",
  Avatar: "Avatar",
  "Badge art packs you installed from the community store. Remove one to put its badges back to Harbor's default.":
    "Badge art packs you installed from the community store. Remove one to put its badges back to Harbor's default.",
  "Badges you have changed": "Badges you have changed",
  Bench: "Bench",
  "Both shows direct, debrid, and peer-to-peer results together. Direct/debrid keeps torrents out of the way unless nothing else is available. P2P puts torrents first.":
    "Both shows direct, debrid, and peer-to-peer results together. Direct/debrid keeps torrents out of the way unless nothing else is available. P2P puts torrents first.",
  "Bring your Letterboxd watchlist, diary, liked films and lists into Harbor through the Stremboxd bridge.":
    "Bring your Letterboxd watchlist, diary, liked films and lists into Harbor through the Stremboxd bridge.",
  "Browse community badge packs": "Browse community badge packs",
  "Build a pack in one of these tools, export the JSON, host it as a gist, then paste the raw link below.":
    "Build a pack in one of these tools, export the JSON, host it as a gist, then paste the raw link below.",
  "Built on": "Built on",
  "Built-in format chips first, then any of your rules that match.":
    "Built-in format chips first, then any of your rules that match.",
  "Buttons, states, and the things that live on a card.":
    "Buttons, states, and the things that live on a card.",
  "Cached stream files and the DHT cache are deleted. The next stream starts from scratch.":
    "Cached stream files and the DHT cache are deleted. The next stream starts from scratch.",
  "Came off": "Came off",
  "Came on": "Came on",
  "Caps how many score chips a poster shows. Extras drop off the end of the chip. You have {n} turned on.":
    "Caps how many score chips a poster shows. Extras drop off the end of the chip. You have {n} turned on.",
  "Caps what Harbor asks {name} to send. Original streams the file exactly as it is stored.":
    "Caps what Harbor asks {name} to send. Original streams the file exactly as it is stored.",
  Carousel: "Carousel",
  "Centered along the top edge, clear of the subtitles.":
    "Centered along the top edge, clear of the subtitles.",
  "Change the ratio while watching": "Change the ratio while watching",
  "Change the shortcut for {name}": "Change the shortcut for {name}",
  "Change your picture": "Change your picture",
  "Changing the metadata language reloads Harbor so the new language takes effect. Apply when you're done with the options above.":
    "Changing the metadata language reloads Harbor so the new language takes effect. Apply when you're done with the options above.",
  "Charity Navigator": "Charity Navigator",
  "Checks the username against Stremboxd and turns on the catalogs it finds.":
    "Checks the username against Stremboxd and turns on the catalogs it finds.",
  "Chips are off, so the row stays bare.": "Chips are off, so the row stays bare.",
  "Choose a file": "Choose a file",
  "Choose source": "Choose source",
  "Choose whether Play asks you, prefers this device, prefers online sources, or goes straight to one of your home servers.":
    "Choose whether Play asks you, prefers this device, prefers online sources, or goes straight to one of your home servers.",
  "Choose whether your operating system draws the title bar, or Harbor draws its own.":
    "Choose whether your operating system draws the title bar, or Harbor draws its own.",
  "Choose which services feed your Continue Watching row. Turn on as many as you like and Harbor merges them, keeping the most recent progress for each title. What you watch is still scrobbled to every connected service regardless of what you pick here.":
    "Choose which services feed your Continue Watching row. Turn on as many as you like and Harbor merges them, keeping the most recent progress for each title. What you watch is still scrobbled to every connected service regardless of what you pick here.",
  "Choose your username": "Choose your username",
  "Clear home team": "Clear home team",
  "Clearing these is always safe. Nothing you downloaded on purpose is removed.":
    "Clearing these is always safe. Nothing you downloaded on purpose is removed.",
  "Cloudflare is a single origin, so on a very fast line this can read lower than a multi-server test. Uses up to 150 MB, with a 90 second cooldown.":
    "Cloudflare is a single origin, so on a very fast line this can read lower than a multi-server test. Uses up to 150 MB, with a 90 second cooldown.",
  Colored: "Colored",
  "Colors your name, your cursor in Watch Together, and the ring around your avatar.":
    "Colors your name, your cursor in Watch Together, and the ring around your avatar.",
  "Comments and reviews posted by other Trakt members.":
    "Comments and reviews posted by other Trakt members.",
  Compatibility: "Compatibility",
  "Connect Discord or Telegram and Harbor posts a message when something you follow is about to drop. Hit Send test to send yourself a sample first.":
    "Connect Discord or Telegram and Harbor posts a message when something you follow is about to drop. Hit Send test to send yourself a sample first.",
  "Connect Jellyfin, Emby, and Plex libraries on this device. Credentials stay in native secret storage. Each server keeps its own refresh schedule, and cached titles stay available while a server is offline.":
    "Connect Jellyfin, Emby, and Plex libraries on this device. Credentials stay in native secret storage. Each server keeps its own refresh schedule, and cached titles stay available while a server is offline.",
  "Connected. {n} catalogs are available.": "Connected. {n} catalogs are available.",
  "Content Advisory": "Content Advisory",
  "Content advisory style": "Content advisory style",
  "Continue Watching on Home": "Continue Watching on Home",
  "Continue Watching sources": "Continue Watching sources",
  "Continue with Discord": "Continue with Discord",
  "Converts video to plain 8-bit before display for graphics cards that glitch on 10-bit or unusual formats. Fixes some visual artifacts, but turns off HDR. Leave off unless you need it.":
    "Converts video to plain 8-bit before display for graphics cards that glitch on 10-bit or unusual formats. Fixes some visual artifacts, but turns off HDR. Leave off unless you need it.",
  "Copies your badge art and rules to the clipboard as JSON, ready to paste into a gist and share.":
    "Copies your badge art and rules to the clipboard as JSON, ready to paste into a gist and share.",
  "Copy JSON": "Copy JSON",
  "Copy your Harbor watchlist over to Trakt, or pull your Trakt watchlist into Harbor.":
    "Copy your Harbor watchlist over to Trakt, or pull your Trakt watchlist into Harbor.",
  "Could not reach that page.": "Could not reach that page.",
  "Could not reach the extension list. Check your server connection and try again.":
    "Could not reach the extension list. Check your server connection and try again.",
  "Couldn't save the playlist. Free up storage space in Settings and try again.":
    "Couldn't save the playlist. Free up storage space in Settings and try again.",
  "Covers everything. The taskbar is hidden.": "Covers everything. The taskbar is hidden.",
  "Curated packs and link import": "Curated packs and link import",
  "Currently using {name}. Pick another preset or build your own.":
    "Currently using {name}. Pick another preset or build your own.",
  "Cursor speed": "Cursor speed",
  "Custom theme": "Custom theme",
  "Data copied from {name}": "Data copied from {name}",
  "Days to wait between automatic refreshes of this library.":
    "Days to wait between automatic refreshes of this library.",
  "Decide whether the genres below apply to movies or to series.":
    "Decide whether the genres below apply to movies or to series.",
  "Deep shadows keep their steps, so dark scenes stay readable.":
    "Deep shadows keep their steps, so dark scenes stay readable.",
  "Describe the result you were after.": "Describe the result you were after.",
  "Describe what Harbor did instead, including any message on screen.":
    "Describe what Harbor did instead, including any message on screen.",
  "Didn't get it? Send another code": "Didn't get it? Send another code",
  "Direct media link": "Direct media link",
  Direct3D: "Direct3D",
  "Directed by {names}": "Directed by {names}",
  "Discord confirmed. Pick a username and password to finish.":
    "Discord confirmed. Pick a username and password to finish.",
  "Discord linked": "Discord linked",
  Display: "Display",
  "Displays the raw release filename under each source in the condensed picker. Off keeps rows compact. The Stremio layout always shows it.":
    "Displays the raw release filename under each source in the condensed picker. Off keeps rows compact. The Stremio layout always shows it.",
  Donate: "Donate",
  "Download folder": "Download folder",
  "Downloaded and ready to use. Re-download to pick up a newer version from the author.":
    "Downloaded and ready to use. Re-download to pick up a newer version from the author.",
  Draws: "Draws",
  Drew: "Drew",
  "Each title gets its own folder holding its EPUB or PDF.":
    "Each title gets its own folder holding its EPUB or PDF.",
  "Egyptian, Qatari, Emirati and Korean football plus the KHL on the sports page.":
    "Egyptian, Qatari, Emirati and Korean football plus the KHL on the sports page.",
  "ElfHosted plans": "ElfHosted plans",
  Elsewhere: "Elsewhere",
  "Email address or Discord handle": "Email address or Discord handle",
  "Embedded player": "Embedded player",
  "Enable the Books API on your app. Lists refresh weekly.":
    "Enable the Books API on your app. Lists refresh weekly.",
  "Enter a full http:// or https:// address.": "Enter a full http:// or https:// address.",
  "Enter your code": "Enter your code",
  Essentials: "Essentials",
  Estimated: "Estimated",
  "Every change on this page shows up here first. The art you pick below rides on rows exactly like this one.":
    "Every change on this page shows up here first. The art you pick below rides on rows exactly like this one.",
  "Every format badge Harbor can show on streams. Pick one to swap its art, hide it, or put it back. Changes apply everywhere badges appear.":
    "Every format badge Harbor can show on streams. Pick one to swap its art, hide it, or put it back. Changes apply everywhere badges appear.",
  "Every saved frame goes. Press again to confirm, or wait to cancel.":
    "Every saved frame goes. Press again to confirm, or wait to cancel.",
  "Every source above follows one language order, and it lives on the Languages page.":
    "Every source above follows one language order, and it lives on the Languages page.",
  "Everything cached is removed. Anything you reopen downloads again from scratch.":
    "Everything cached is removed. Anything you reopen downloads again from scratch.",
  "Everything else that moves": "Everything else that moves",
  "Everything pulled toward the middle, so nothing jolts you late at night.":
    "Everything pulled toward the middle, so nothing jolts you late at night.",
  "Everything you pick is saved into one file. Restoring it later only touches what is in the file. Your Stremio sign-in is always left out.":
    "Everything you pick is saved into one file. Restoring it later only touches what is in the file. Your Stremio sign-in is always left out.",
  "Export again": "Export again",
  "Export failed: {error}": "Export failed: {error}",
  "Export log": "Export log",
  "Export pack": "Export pack",
  "Export your Harbor setup to a single file — pick exactly what goes in. Restore brings back only what the file contains. Your Stremio sign-in is always left out.":
    "Export your Harbor setup to a single file — pick exactly what goes in. Restore brings back only what the file contains. Your Stremio sign-in is always left out.",
  "Export your setup": "Export your setup",
  "Export {n} sections": "Export {n} sections",
  "Exporting…": "Exporting…",
  "Fade the text back if it sits too hard over bright scenes.":
    "Fade the text back if it sits too hard over bright scenes.",
  "Fallbacks for machines where the modern video path misbehaves. Leave these alone unless the picture is wrong or a file won't start.":
    "Fallbacks for machines where the modern video path misbehaves. Leave these alone unless the picture is wrong or a file won't start.",
  "Favorites ({n})": "Favorites ({n})",
  "Featured matches": "Featured matches",
  "Files land in a folder named after the movie or series instead of loose in the download folder.":
    "Files land in a folder named after the movie or series instead of loose in the download folder.",
  "Fills the screen, but the title bar and taskbar stay.":
    "Fills the screen, but the title bar and taskbar stay.",
  "Fills the sports page where ESPN has no feed: Egyptian Premier League, Qatar Stars League, UAE Pro League, K League and the KHL, with lineups and live minutes. Free key at":
    "Fills the sports page where ESPN has no feed: Egyptian Premier League, Qatar Stars League, UAE Pro League, K League and the KHL, with lineups and live minutes. Free key at",
  "Find a stream on a page": "Find a stream on a page",
  "Find a stream on a web page": "Find a stream on a web page",
  "Find streams": "Find streams",
  "Finish creating my account": "Finish creating my account",
  "Finish the setup on the configure page, then paste the manifest URL it hands back here.":
    "Finish the setup on the configure page, then paste the manifest URL it hands back here.",
  "Follow a club to pin its fixtures and results": "Follow a club to pin its fixtures and results",
  "Forces a compatibility present mode that removes a thin bright line some monitors show at the screen edge. Side effects: 4K playback can drop to a slideshow and HDR content looks dimmer, because this mode bypasses the HDR display path. Leave off unless you see that line. Restart playback to apply.":
    "Forces a compatibility present mode that removes a thin bright line some monitors show at the screen edge. Side effects: 4K playback can drop to a slideshow and HDR content looks dimmer, because this mode bypasses the HDR display path. Leave off unless you see that line. Restart playback to apply.",
  "Frosts the still image on each unwatched episode in the list.":
    "Frosts the still image on each unwatched episode in the list.",
  "Full mode is active, so diary, friends activity and your ratings all work.":
    "Full mode is active, so diary, friends activity and your ratings all work.",
  "Full mode signs in with your Letterboxd password so your diary, friends activity and personal ratings work too. The password goes only to Stremboxd to fetch a token, and Harbor never stores it.":
    "Full mode signs in with your Letterboxd password so your diary, friends activity and personal ratings work too. The password goes only to Stremboxd to fetch a token, and Harbor never stores it.",
  "Full pack format reference: docs/avatar-packs.md in the Harbor repository.":
    "Full pack format reference: docs/avatar-packs.md in the Harbor repository.",
  "Full time": "Full time",
  GB: "GB",
  GD: "GD",
  GP: "GP",
  "GPU (compatibility)": "GPU (compatibility)",
  "GPU next": "GPU next",
  Goals: "Goals",
  Graphics: "Graphics",
  "Groups Refresh beside Back at the start of the picker header. Off keeps it at the far end, across from Back.":
    "Groups Refresh beside Back at the start of the picker header. Off keeps it at the far end, across from Back.",
  "Harbor did not draw its own icons. Two people did, and they are worth hiring.":
    "Harbor did not draw its own icons. Two people did, and they are worth hiring.",
  "Harbor hosts no media and indexes no media. The sources and addons available to you are the ones you choose to configure, and their use is subject to the laws of your jurisdiction and the terms of the services concerned.":
    "Harbor hosts no media and indexes no media. The sources and addons available to you are the ones you choose to configure, and their use is subject to the laws of your jurisdiction and the terms of the services concerned.",
  "Harbor is an independent client. It is not affiliated with, endorsed by, or sponsored by Stremio, or by any company, addon author, or trademark holder referenced in this application. All trademarks are the property of their respective owners.":
    "Harbor is an independent client. It is not affiliated with, endorsed by, or sponsored by Stremio, or by any company, addon author, or trademark holder referenced in this application. All trademarks are the property of their respective owners.",
  "Harbor is authorized on this device and syncing with Simkl.":
    "Harbor is authorized on this device and syncing with Simkl.",
  "Harbor is free and open source software, released under the MIT License.":
    "Harbor is free and open source software, released under the MIT License.",
  "Harbor is signed in to your MyAnimeList account.":
    "Harbor is signed in to your MyAnimeList account.",
  "Harbor is using {used} of the {quota} this computer allows.":
    "Harbor is using {used} of the {quota} this computer allows.",
  "Harbor library": "Harbor library",
  "Harbor opens 4 parallel requests to speed.cloudflare.com, discards the first 1.2 seconds so TCP slow-start does not tank the result, then measures until it has 150 MB or 8 seconds of steady transfer.":
    "Harbor opens 4 parallel requests to speed.cloudflare.com, discards the first 1.2 seconds so TCP slow-start does not tank the result, then measures until it has 150 MB or 8 seconds of steady transfer.",
  "Harbor opens only the address you paste here and lists the media it finds in that page's own source. It does not search anywhere else.":
    "Harbor opens only the address you paste here and lists the media it finds in that page's own source. It does not search anywhere else.",
  "Harbor picks the best stream it can find and starts playing straight away.":
    "Harbor picks the best stream it can find and starts playing straight away.",
  "Harbor picks the size your connection can keep up with.":
    "Harbor picks the size your connection can keep up with.",
  "Harbor puts streams, audio tracks and subtitles in these languages first. Leave it empty to accept anything.":
    "Harbor puts streams, audio tracks and subtitles in these languages first. Leave it empty to accept anything.",
  "Harbor reads your display and lands between the two.":
    "Harbor reads your display and lands between the two.",
  "Harbor scales the prompt to the episode length, so a short episode does not ask this early. The bar shows the last three minutes.":
    "Harbor scales the prompt to the episode length, so a short episode does not ask this early. The bar shows the last three minutes.",
  "Harbor scrobbles your playback to Trakt and keeps your watchlist in sync.":
    "Harbor scrobbles your playback to Trakt and keeps your watchlist in sync.",
  "Harbor shows the full list of streams every time so you choose one yourself.":
    "Harbor shows the full list of streams every time so you choose one yourself.",
  "Harbor shows you a short code to type in at trakt.tv. Scrobbling and watchlist sync begin the moment you approve it.":
    "Harbor shows you a short code to type in at trakt.tv. Scrobbling and watchlist sync begin the moment you approve it.",
  "Harbor signs out and stops syncing. Your lists on Simkl are left exactly as they are.":
    "Harbor signs out and stops syncing. Your lists on Simkl are left exactly as they are.",
  "Harbor signs out and stops updating your progress. Your list on MyAnimeList is left as it is.":
    "Harbor signs out and stops updating your progress. Your list on MyAnimeList is left as it is.",
  "Harbor tries HTTP, HTTPS, reverse proxies, and the provider's default port. Credentials are stored separately.":
    "Harbor tries HTTP, HTTPS, reverse proxies, and the provider's default port. Credentials are stored separately.",
  "Harbor uses its own community server. You can point it at a server you run yourself.":
    "Harbor uses its own community server. You can point it at a server you run yourself.",
  "Head to head": "Head to head",
  "Heads-up time": "Heads-up time",
  "Hide email address": "Hide email address",
  "Hide the code editors": "Hide the code editors",
  "Hides the episode name, which often gives the twist away on its own.":
    "Hides the episode name, which often gives the twist away on its own.",
  "Hides the synopsis text under each unwatched episode.":
    "Hides the synopsis text under each unwatched episode.",
  "Hold Ctrl or Cmd and scroll to resize Harbor's interface smoothly. This one cannot be changed.":
    "Hold Ctrl or Cmd and scroll to resize Harbor's interface smoothly. This one cannot be changed.",
  "Home team": "Home team",
  "How Harbor draws its own interface. Leave this on Automatic unless the app itself stutters, flickers or tears while scrolling, which some G-SYNC and high refresh rate setups do. Switching backends usually settles it. This does not affect video playback.":
    "How Harbor draws its own interface. Leave this on Automatic unless the app itself stutters, flickers or tears while scrolling, which some G-SYNC and high refresh rate setups do. Switching backends usually settles it. This does not affect video playback.",
  "How big the handle sits on the timeline while you scrub.":
    "How big the handle sits on the timeline while you scrub.",
  "How dark the gradient behind the featured title on Home is. 100% is the classic look.":
    "How dark the gradient behind the featured title on Home is. 100% is the classic look.",
  "How far ahead of the start time Harbor pings you. It scans your playlist EPG every 30 minutes.":
    "How far ahead of the start time Harbor pings you. It scans your playlist EPG every 30 minutes.",
  "How heavy the stroke around each letter is.": "How heavy the stroke around each letter is.",
  "How large every poster card is drawn across Home and search.":
    "How large every poster card is drawn across Home and search.",
  "How large subtitles are drawn on the video, at any window size.":
    "How large subtitles are drawn on the video, at any window size.",
  "How long Harbor fills the buffer before the picture appears.":
    "How long Harbor fills the buffer before the picture appears.",
  "How long a poster takes to grow and settle as the pointer passes it.":
    "How long a poster takes to grow and settle as the pointer passes it.",
  "How many episodes auto-play back to back before Harbor pauses to ask.":
    "How many episodes auto-play back to back before Harbor pauses to ask.",
  "How much of the video Harbor downloads in front of where you are watching.":
    "How much of the video Harbor downloads in front of where you are watching.",
  "How often Harbor re-reads the library index from {name}. Manual only refreshes when you press Sync now.":
    "How often Harbor re-reads the library index from {name}. Manual only refreshes when you press Sync now.",
  "How quickly the Harbor cursor moves with the right stick.":
    "How quickly the Harbor cursor moves with the right stick.",
  "How rounded the corners of every poster card are.":
    "How rounded the corners of every poster card are.",
  "How solid the panel behind the text looks over the video.":
    "How solid the panel behind the text looks over the video.",
  "How strongly the buffered part stands out against the rest of the bar.":
    "How strongly the buffered part stands out against the rest of the bar.",
  "How subtitles are drawn over the picture. The still below updates as you change anything, so you can judge the size and the contrast before you start a film.":
    "How subtitles are drawn over the picture. The still below updates as you change anything, so you can judge the size and the contrast before you start a film.",
  "How the buttons map in each context. Xbox glyphs are listed first, PlayStation second. The layout is fixed and cannot be changed.":
    "How the buttons map in each context. Xbox glyphs are listed first, PlayStation second. The layout is fixed and cannot be changed.",
  "How the navigation icons behave.": "How the navigation icons behave.",
  "How thick the timeline sits at the bottom of the player.":
    "How thick the timeline sits at the bottom of the player.",
  Hue: "Hue",
  "If a stream or the video player misbehaves, the log usually names the cause.":
    "If a stream or the video player misbehaves, the log usually names the cause.",
  "If this account has Discord linked, we'll DM you a code to reset your password without the recovery key.":
    "If this account has Discord linked, we'll DM you a code to reset your password without the recovery key.",
  "Image address": "Image address",
  "Import data from {name}": "Import data from {name}",
  "Import from a file": "Import from a file",
  "Import from a link": "Import from a link",
  "Import or export a .json pack": "Import or export a .json pack",
  "Import pack (.json)": "Import pack (.json)",
  "Include anime episodes and seasons, even when TV is turned off.":
    "Include anime episodes and seasons, even when TV is turned off.",
  "Include film releases from every source you turned on above.":
    "Include film releases from every source you turned on above.",
  "Include series premieres and new episodes. Anime is counted separately.":
    "Include series premieres and new episodes. Anime is counted separately.",
  Independence: "Independence",
  "Instant playback preparation": "Instant playback preparation",
  "Instant starts the best-ranked stream straight away. Pick a source opens the stream list every time, so you choose the release, quality and provider yourself.":
    "Instant starts the best-ranked stream straight away. Pick a source opens the stream list every time, so you choose the release, quality and provider yourself.",
  "Jump to today": "Jump to today",
  "Keeps subtitles visible when the player shrinks into the small floating window. Turn off to hide them there.":
    "Keeps subtitles visible when the player shrinks into the small floating window. Turn off to hide them there.",
  "Keyboard size": "Keyboard size",
  L: "L",
  "Latest chapters": "Latest chapters",
  "Letterboxd asked for a second step. Enter the six digit code, then connect again.":
    "Letterboxd asked for a second step. Enter the six digit code, then connect again.",
  "Licence texts": "Licence texts",
  "Lift subtitles clear of a letterbox bar or a burned-in logo.":
    "Lift subtitles clear of a letterbox bar or a burned-in logo.",
  Lineups: "Lineups",
  "Link Discord": "Link Discord",
  "Linked as {username}": "Linked as {username}",
  "Linked to your Harbor account.": "Linked to your Harbor account.",
  "Live TV, {scope}, {minutes} min lead": "Live TV, {scope}, {minutes} min lead",
  "Live now": "Live now",
  "Live preview is on. Save keeps what you've picked as your Custom theme. Reset reverts the editor to the saved palette.":
    "Live preview is on. Save keeps what you've picked as your Custom theme. Reset reverts the editor to the saved palette.",
  "Loaders, boats, and the bits between screens.": "Loaders, boats, and the bits between screens.",
  "Loads a backup file and restores exactly what it contains, without touching the rest of your setup. Your Stremio sign-in on this device stays as is.":
    "Loads a backup file and restores exactly what it contains, without touching the rest of your setup. Your Stremio sign-in on this device stays as is.",
  "Look any of them up before you give, or find a cause of your own.":
    "Look any of them up before you give, or find a cause of your own.",
  Lost: "Lost",
  "Low end lifted, for weight on speakers that do not have it.":
    "Low end lifted, for weight on speakers that do not have it.",
  "Low end pulled back, kinder to small speakers and to the neighbours.":
    "Low end pulled back, kinder to small speakers and to the neighbours.",
  "Low is cosmetic. Normal is annoying. High means a feature is broken. Critical means Harbor is unusable.":
    "Low is cosmetic. Normal is annoying. High means a feature is broken. Critical means Harbor is unusable.",
  "Manage this rule": "Manage this rule",
  "Match details are not available yet.": "Match details are not available yet.",
  "Match preview": "Match preview",
  "Match report": "Match report",
  "Match stats": "Match stats",
  "Measure this connection": "Measure this connection",
  Meetings: "Meetings",
  "Mid range lifted, so dialogue sits forward of the music and effects.":
    "Mid range lifted, so dialogue sits forward of the music and effects.",
  "Modern renderer with higher-quality processing. The right choice for almost every machine.":
    "Modern renderer with higher-quality processing. The right choice for almost every machine.",
  "Monochrome (White)": "Monochrome (White)",
  Motion: "Motion",
  "MyAnimeList is a free site for tracking the anime you watch. Open it to read more or to make an account.":
    "MyAnimeList is a free site for tracking the anime you watch. Open it to read more or to make an account.",
  NR: "NR",
  NRR: "NRR",
  "Name of the badge": "Name of the badge",
  "Name or pattern": "Name or pattern",
  "Name what broke in one sentence. Maintainers read this line first.":
    "Name what broke in one sentence. Maintainers read this line first.",
  "Narrow the list below by rule name or by the pattern text.":
    "Narrow the list below by rule name or by the pattern text.",
  "Navigation animations": "Navigation animations",
  "Needs an API-Sports key. The free plan covers it.":
    "Needs an API-Sports key. The free plan covers it.",
  "New releases": "New releases",
  "Next match": "Next match",
  "No fixtures on this day.": "No fixtures on this day.",
  "No fixtures scheduled": "No fixtures scheduled",
  "No number": "No number",
  "No playable media was found in that page's source.":
    "No playable media was found in that page's source.",
  "No prompt. The episode plays out and stops.": "No prompt. The episode plays out and stops.",
  "No settings match that.": "No settings match that.",
  "No shaping. The track plays exactly as it was mixed.":
    "No shaping. The track plays exactly as it was mixed.",
  "No sports channels found in your playlists.": "No sports channels found in your playlists.",
  "No subtitle addons installed yet.": "No subtitle addons installed yet.",
  "No teams available for these competitions yet.":
    "No teams available for these competitions yet.",
  "No teams match that search.": "No teams match that search.",
  "None of the images in that pack could be loaded.":
    "None of the images in that pack could be loaded.",
  "None yet. This opens Streaming sources, where subtitle addons are installed.":
    "None yet. This opens Streaming sources, where subtitle addons are installed.",
  "Not verified on macOS yet. It needs the gpu-next renderer, which is reliable on Windows.":
    "Not verified on macOS yet. It needs the gpu-next renderer, which is reliable on Windows.",
  "Nothing in this title to badge.": "Nothing in this title to badge.",
  "Number every step from a fresh start. This is the single most useful thing in a report.":
    "Number every step from a fresh start. This is the single most useful thing in a report.",
  "Nvidia RTX GPUs only. Upconverts SDR video to HDR on the GPU (turn on RTX Video HDR in the Nvidia app; needs GPU decode). Experimental. Unavailable while SVP is active for the current video.":
    "Nvidia RTX GPUs only. Upconverts SDR video to HDR on the GPU (turn on RTX Video HDR in the Nvidia app; needs GPU decode). Experimental. Unavailable while SVP is active for the current video.",
  "Nvidia RTX GPUs only. Upscales SDR video with AI on the GPU (turn on RTX Video Super Resolution in the Nvidia app; needs GPU decode). Experimental. Unavailable while SVP is active for the current video.":
    "Nvidia RTX GPUs only. Upscales SDR video with AI on the GPU (turn on RTX Video Super Resolution in the Nvidia app; needs GPU decode). Experimental. Unavailable while SVP is active for the current video.",
  OTL: "OTL",
  "Off the row": "Off the row",
  "Older, simpler renderer. Use it only if the modern one shows a black screen, wrong colors, or won't start on your graphics card.":
    "Older, simpler renderer. Use it only if the modern one shows a black screen, wrong colors, or won't start on your graphics card.",
  "On shows titles in your metadata language (English by default). Off keeps titles in English.":
    "On shows titles in your metadata language (English by default). Off keeps titles in English.",
  "On the pad, hold {button} to stop.": "On the pad, hold {button} to stop.",
  "On the pitch": "On the pitch",
  "One account covers football and hockey. The free plan allows 100 requests a day and Harbor paces itself to stay inside it.":
    "One account covers football and hockey. The free plan allows 100 requests a day and Harbor paces itself to stay inside it.",
  "Only the card gets wider. The text stays the same size, so bigger cards mean bigger artwork and fewer of them on screen.":
    "Only the card gets wider. The text stays the same size, so bigger cards mean bigger artwork and fewer of them on screen.",
  "Open Harbor on desktop to link Discord.": "Open Harbor on desktop to link Discord.",
  "Open anilist.co": "Open anilist.co",
  "Open myanimelist.net": "Open myanimelist.net",
  "Open simkl.com": "Open simkl.com",
  "Open trakt.tv": "Open trakt.tv",
  OpenGL: "OpenGL",
  "Opens Stremio's donation page in your browser.":
    "Opens Stremio's donation page in your browser.",
  "Opens anilist.co in your browser, where you can read what AniList does and make a free account.":
    "Opens anilist.co in your browser, where you can read what AniList does and make a free account.",
  "Opens stremboxd.com, the community bridge that reads Letterboxd on Harbor's behalf.":
    "Opens stremboxd.com, the community bridge that reads Letterboxd on Harbor's behalf.",
  "Opens three editors for CSS, JavaScript, and an HTML overlay. Changes apply as you type.":
    "Opens three editors for CSS, JavaScript, and an HTML overlay. Changes apply as you type.",
  "Opens trakt.tv in your browser, where you can read what Trakt does and make a free account.":
    "Opens trakt.tv in your browser, where you can read what Trakt does and make a free account.",
  "Optional. Point at a png, webp, or svg to show a picture instead of a text badge.":
    "Optional. Point at a png, webp, or svg to show a picture instead of a text badge.",
  P: "P",
  PCT: "PCT",
  PD: "PD",
  PTS: "PTS",
  "Page metadata": "Page metadata",
  "Page source": "Page source",
  Pages: "Pages",
  "Paste a link to a png, webp, or svg. Harbor will use it for this badge everywhere streams show format chips.":
    "Paste a link to a png, webp, or svg. Harbor will use it for this badge everywhere streams show format chips.",
  "Paste a stream": "Paste a stream",
  "Paste from clipboard": "Paste from clipboard",
  "Paste the address of any public Letterboxd list to add it as its own row.":
    "Paste the address of any public Letterboxd list to add it as its own row.",
  "Paste the page address": "Paste the page address",
  "Pattern to match": "Pattern to match",
  "Peek at a title on hover": "Peek at a title on hover",
  "Pick a badges.json that is already saved on this computer.":
    "Pick a badges.json that is already saved on this computer.",
  "Pick as many as you like. With none picked, every genre counts.":
    "Pick as many as you like. With none picked, every genre counts.",
  "Pick the cap your connection can sustain. Streams that need more than this rank lower, so Harbor stops offering you files you cannot actually play.":
    "Pick the cap your connection can sustain. Streams that need more than this rank lower, so Harbor stops offering you files you cannot actually play.",
  "Pick the clubs you follow and their next fixture and last result stay pinned here.":
    "Pick the clubs you follow and their next fixture and last result stay pinned here.",
  "Pick the countries of origin you follow. With none picked, every country counts.":
    "Pick the countries of origin you follow. With none picked, every country counts.",
  "Pick the services you care about. With none picked, every service counts.":
    "Pick the services you care about. With none picked, every service counts.",
  "Pick what to save, then everything you choose lands in one file: theme, home layout, settings, addons, profiles, watchlist, player layouts, watch progress, and more. Your Stremio sign-in is left out on purpose.":
    "Pick what to save, then everything you choose lands in one file: theme, home layout, settings, addons, profiles, watchlist, player layouts, watch progress, and more. Your Stremio sign-in is left out on purpose.",
  "Pick which corner of the poster the bookmark sits in.":
    "Pick which corner of the poster the bookmark sits in.",
  "Pick which languages Harbor looks for first, and which ones it falls back to.":
    "Pick which languages Harbor looks for first, and which ones it falls back to.",
  "Pick who this rule watches. With nobody picked, everyone you track counts.":
    "Pick who this rule watches. With nobody picked, everyone you track counts.",
  Picked: "Picked",
  "Pin this competition": "Pin this competition",
  "Play opens the stream list so you pick the release yourself.":
    "Play opens the stream list so you pick the release yourself.",
  "Play starts the best-ranked stream straight away.":
    "Play starts the best-ranked stream straight away.",
  "Player config": "Player config",
  "Player screen lock": "Player screen lock",
  "Point Harbor at a hosted pack link, upload your own images, or import a .zip. Harbor stores the link, so the artwork stays with whoever made it.":
    "Point Harbor at a hosted pack link, upload your own images, or import a .zip. Harbor stores the link, so the artwork stays with whoever made it.",
  "Post the alert to the Discord channel set up on the Destinations tab.":
    "Post the alert to the Discord channel set up on the Destinations tab.",
  "Prefer these sources": "Prefer these sources",
  "Preview unavailable": "Preview unavailable",
  "Previous match": "Previous match",
  "Probes the server's settings endpoint from this device and reports what came back.":
    "Probes the server's settings endpoint from this device and reports what came back.",
  "Public mode reads your account with nothing but your username. You get your watchlist, liked films, popular this week and the Top 250, and no password is needed.":
    "Public mode reads your account with nothing but your username. You get your watchlist, liked films, popular this week and the Top 250, and no password is needed.",
  "Pull every title on your Trakt watchlist into Harbor. Anything already saved is left alone.":
    "Pull every title on your Trakt watchlist into Harbor. Anything already saved is left alone.",
  "Pulls what you have part-watched on Simkl into the row, marked with the Simkl logo. Requires a connected Simkl account.":
    "Pulls what you have part-watched on Simkl into the row, marked with the Simkl logo. Requires a connected Simkl account.",
  "Pulls what you have part-watched on Trakt into the row, marked with the Trakt logo. Requires a connected Trakt account.":
    "Pulls what you have part-watched on Trakt into the row, marked with the Trakt logo. Requires a connected Trakt account.",
  "Puts a small bookmark on posters you have already saved.":
    "Puts a small bookmark on posters you have already saved.",
  "Puts the current offset on screen while you nudge subtitle timing with Z or X, so you can see how far you have shifted them.":
    "Puts the current offset on screen while you nudge subtitle timing with Z or X, so you can see how far you have shifted them.",
  "Puts the score you gave a film in the corner of its poster, wherever Letterboxd has one for you.":
    "Puts the score you gave a film in the corner of its poster, wherever Letterboxd has one for you.",
  "Read the source, file an issue, or fork it and send a patch.":
    "Read the source, file an issue, or fork it and send a patch.",
  "Reading your environment details…": "Reading your environment details…",
  "Reading {host}...": "Reading {host}...",
  "Recommended: sign in with Plex": "Recommended: sign in with Plex",
  "Recover via Discord": "Recover via Discord",
  "Recover via a code sent to Discord": "Recover via a code sent to Discord",
  Red: "Red",
  "Red cards": "Red cards",
  "Refresh every": "Refresh every",
  "Refresh this library": "Refresh this library",
  "Relay update available": "Relay update available",
  "Remove comment": "Remove comment",
  "Remove from your teams": "Remove from your teams",
  "Remove this stream": "Remove this stream",
  Renderer: "Renderer",
  "Rendering backend": "Rendering backend",
  "Renders mpv inline so playback lives in Harbor itself. Turn off to open it in a separate window instead.":
    "Renders mpv inline so playback lives in Harbor itself. Turn off to open it in a separate window instead.",
  "Renders subtitles in a heavier weight. Turn off to use your font's normal weight.":
    "Renders subtitles in a heavier weight. Turn off to use your font's normal weight.",
  "Replace selected data?": "Replace selected data?",
  Required: "Required",
  "Reset size": "Reset size",
  "Resolved from {host}": "Resolved from {host}",
  "Rest the cursor on a poster to peek at the rating, story, and quick actions without opening it. Off by default.":
    "Rest the cursor on a poster to peek at the rating, story, and quick actions without opening it. Off by default.",
  "Right in the middle of the picture, hard to miss.":
    "Right in the middle of the picture, hard to miss.",
  Role: "Role",
  "Rule is active": "Rule is active",
  "Rule name": "Rule name",
  "Rulesets bring a full badge set with their own matching. Art remaps only swap the pictures on Harbor's built-in badges. Anything shared as a badges.json link imports here too.":
    "Rulesets bring a full badge set with their own matching. Art remaps only swap the pictures on Harbor's built-in badges. Anything shared as a badges.json link imports here too.",
  "Run your own relay": "Run your own relay",
  "Running version {version} of the Watch Together protocol.":
    "Running version {version} of the Watch Together protocol.",
  "Running version {version}. Harbor's public relay updates itself, so there is nothing for you to do.":
    "Running version {version}. Harbor's public relay updates itself, so there is nothing for you to do.",
  "Running version {version}. Redeploy to pick up the latest Watch Together fixes. The in-app banner clears once the new version is live.":
    "Running version {version}. Redeploy to pick up the latest Watch Together fixes. The in-app banner clears once the new version is live.",
  "Runs a short download test against Cloudflare and shows the result here, so you can pick a cap that matches your real line.":
    "Runs a short download test against Cloudflare and shows the result here, so you can pick a cap that matches your real line.",
  "SUBDL API key": "SUBDL API key",
  "SUBDL returns nothing until a key is saved here.":
    "SUBDL returns nothing until a key is saved here.",
  "Same coverage, but still a window, so alt-tab stays instant.":
    "Same coverage, but still a window, so alt-tab stays instant.",
  "Saturation and brightness": "Saturation and brightness",
  "Save as JSON": "Save as JSON",
  "Save as SVG": "Save as SVG",
  "Save the rule": "Save the rule",
  "Saved to Downloads as harbor-mpv-log.txt. Attach it above.":
    "Saved to Downloads as harbor-mpv-log.txt. Attach it above.",
  "Saved {when} from Harbor {app}. Your Stremio sign-in stays as is.":
    "Saved {when} from Harbor {app}. Your Stremio sign-in stays as is.",
  "Saved.": "Saved.",
  "Search channels": "Search channels",
  "Search rules": "Search rules",
  "Search teams": "Search teams",
  "Search your channels": "Search your channels",
  "Searching works without a key. Adding one lets Harbor line subtitles up with the audio on its own.":
    "Searching works without a key. Adding one lets Harbor line subtitles up with the audio on its own.",
  "See which fixes are already in review before you start on one.":
    "See which fixes are already in review before you start on one.",
  "Seek dot": "Seek dot",
  "Send code": "Send code",
  "Send every title in your Harbor watchlist up to Trakt. Safe to run again, Trakt skips anything it already has.":
    "Send every title in your Harbor watchlist up to Trakt. Safe to run again, Trakt skips anything it already has.",
  "Send the alert through the Telegram bot set up on the Destinations tab.":
    "Send the alert through the Telegram bot set up on the Destinations tab.",
  "Sent once to Stremboxd to obtain a sign-in token. Harbor never keeps it.":
    "Sent once to Stremboxd to obtain a sign-in token. Harbor never keeps it.",
  "Set as home team": "Set as home team",
  "Shader files": "Shader files",
  "Shadow strength": "Shadow strength",
  "Shots on target": "Shots on target",
  "Show a lock control in the player that blocks mouse, keyboard, remote, and media-key input until you unlock it.":
    "Show a lock control in the player that blocks mouse, keyboard, remote, and media-key input until you unlock it.",
  "Show a row of the anime on your Simkl plan-to-watch list.":
    "Show a row of the anime on your Simkl plan-to-watch list.",
  "Show a row of the anime you are part way through.":
    "Show a row of the anime you are part way through.",
  "Show a row of the movies on your Simkl plan-to-watch list.":
    "Show a row of the movies on your Simkl plan-to-watch list.",
  "Show a row of the shows on your Simkl plan-to-watch list.":
    "Show a row of the shows on your Simkl plan-to-watch list.",
  "Show a row of the shows you are part way through.":
    "Show a row of the shows you are part way through.",
  "Show email address": "Show email address",
  "Show the code editors": "Show the code editors",
  "Shows a lighter fill for how much is buffered or downloaded ahead. It hides itself once a stream is fully cached (green dot).":
    "Shows a lighter fill for how much is buffered or downloaded ahead. It hides itself once a stream is fully cached (green dot).",
  "Shows everything the addon sends in the Stremio picker layout instead of trimming it to a few lines. That matters for AIOStreams and other custom formats. Off gives shorter, tidier rows.":
    "Shows everything the addon sends in the Stremio picker layout instead of trimming it to a few lines. That matters for AIOStreams and other custom formats. Off gives shorter, tidier rows.",
  "Sidebar icons play a short animation when you hover them. Turn this off to keep them as plain static icons.":
    "Sidebar icons play a short animation when you hover them. Turn this off to keep them as plain static icons.",
  "Sign in at anilist.co and authorize Harbor. Your anime lists show up on the Anime page as soon as you are back.":
    "Sign in at anilist.co and authorize Harbor. Your anime lists show up on the Anime page as soon as you are back.",
  "Sign in once with MyAnimeList. Harbor then updates your episode count as you watch, and never lowers a count you already have.":
    "Sign in once with MyAnimeList. Harbor then updates your episode count as you watch, and never lowers a count you already have.",
  "Sign in once with a short device code. Harbor then marks what you finish as watched and keeps your plan-to-watch list in step.":
    "Sign in once with a short device code. Harbor then marks what you finish as watched and keeps your plan-to-watch list in step.",
  "Sign in to sync your library, add-ons and watch history with Stremio.":
    "Sign in to sync your library, add-ons and watch history with Stremio.",
  "Sign in with Discord": "Sign in with Discord",
  "Sign in with Full mode to use this catalog.": "Sign in with Full mode to use this catalog.",
  "Sign out of Stremio": "Sign out of Stremio",
  "Signed in": "Signed in",
  "Signed in as {email}. Your library, add-ons and watch history sync with Stremio.":
    "Signed in as {email}. Your library, add-ons and watch history sync with Stremio.",
  "Signed in. Enter your server address below.": "Signed in. Enter your server address below.",
  "Signs in to Letterboxd and unlocks your diary, friends activity and ratings.":
    "Signs in to Letterboxd and unlocks your diary, friends activity and ratings.",
  "Simkl is a free site for tracking the movies, shows, and anime you watch. Open it to read more or to make an account.":
    "Simkl is a free site for tracking the movies, shows, and anime you watch. Open it to read more or to make an account.",
  "Simkl progress": "Simkl progress",
  "Simkl rails are turned off, so none of the rows below appear on Home yet.":
    "Simkl rails are turned off, so none of the rows below appear on Home yet.",
  "Simple color mode": "Simple color mode",
  "Size of the controller on-screen keyboard.": "Size of the controller on-screen keyboard.",
  "Small outlined pills that slide in under the title.":
    "Small outlined pills that slide in under the title.",
  Software: "Software",
  "Source extension": "Source extension",
  "Space in use": "Space in use",
  Standings: "Standings",
  Starter: "Starter",
  "Starting soon": "Starting soon",
  "Still watching check-in": "Still watching check-in",
  "Stops syncing on this device. Your library stays safe in your Stremio account.":
    "Stops syncing on this device. Your library stays safe in your Stremio account.",
  "Streaming catalogs need a TMDB key": "Streaming catalogs need a TMDB key",
  "Structured data": "Structured data",
  "Subsource API key": "Subsource API key",
  "Subsource returns nothing until a key is saved here.":
    "Subsource returns nothing until a key is saved here.",
  "Swap the handle for a sticker, a cat, anything you like.":
    "Swap the handle for a sticker, a cat, anything you like.",
  "Switch every rule the list currently shows. With a search active this only touches the matches.":
    "Switch every rule the list currently shows. With a search active this only touches the matches.",
  "Switch relay": "Switch relay",
  "Switch to sharing? This profile will use {name}'s library, watchlist and addons. Its own data is kept but hidden until you switch back.":
    "Switch to sharing? This profile will use {name}'s library, watchlist and addons. Its own data is kept but hidden until you switch back.",
  T: "T",
  "TMDB, Fanart, TVDB, OMDb and RPDB supply posters, artwork and ratings. Adding your own free keys makes artwork load faster and more completely.":
    "TMDB, Fanart, TVDB, OMDb and RPDB supply posters, artwork and ratings. Adding your own free keys makes artwork load faster and more completely.",
  "Takes effect the next time Harbor starts.": "Takes effect the next time Harbor starts.",
  "Test a stream title": "Test a stream title",
  "That pack could not be imported.": "That pack could not be imported.",
  "That page answered {status} and sent nothing back.":
    "That page answered {status} and sent nothing back.",
  "That page answered {status}, so there was nothing to read.":
    "That page answered {status}, so there was nothing to read.",
  "That page sent back no readable content.": "That page sent back no readable content.",
  "The Last Stand has aired its last episode, so it drops off the row and comes back when a new one lands.":
    "The Last Stand has aired its last episode, so it drops off the row and comes back when a new one lands.",
  "The Last Stand stays on the row with an amber countdown to the next episode.":
    "The Last Stand stays on the row with an amber countdown to the next episode.",
  "The Up Next pill appears {lead} before the end. The bar shows the last three minutes.":
    "The Up Next pill appears {lead} before the end. The bar shows the last three minutes.",
  "The account identifier Stremio uses for your library and addon collection.":
    "The account identifier Stremio uses for your library and addon collection.",
  "The address of the streaming server, including its port.":
    "The address of the streaming server, including its port.",
  "The bar runs to {pct} percent. Everything past the mark is boost.":
    "The bar runs to {pct} percent. Everything past the mark is boost.",
  "The chrome abiyyu drew for the player: transport, subtitles, shaders, and the rest.":
    "The chrome abiyyu drew for the player: transport, subtitles, shaders, and the rest.",
  "The color of the panel behind the text.": "The color of the panel behind the text.",
  "The controller button glyphs elsewhere in Harbor are not ours. They come from Kenney's Input Prompts, released into the public domain under CC0.":
    "The controller button glyphs elsewhere in Harbor are not ours. They come from Kenney's Input Prompts, released into the public domain under CC0.",
  "The darkest steps flatten together, which is how an LCD really behaves.":
    "The darkest steps flatten together, which is how an LCD really behaves.",
  "The entries taking the most room right now. Most of them are caches that rebuild themselves, so this list changes as you browse.":
    "The entries taking the most room right now. Most of them are caches that rebuild themselves, so this list changes as you browse.",
  "The fill color of the subtitle letters themselves.":
    "The fill color of the subtitle letters themselves.",
  "The filled part of the timeline. Default follows your Harbor accent.":
    "The filled part of the timeline. Default follows your Harbor accent.",
  "The full text of every licence covering software distributed with Harbor. Select any entry to save a copy.":
    "The full text of every licence covering software distributed with Harbor. Select any entry to save a copy.",
  "The handle in your profile address, letterboxd.com/your-name.":
    "The handle in your profile address, letterboxd.com/your-name.",
  "The most memory the head start is allowed to take while a video plays.":
    "The most memory the head start is allowed to take while a video plays.",
  "The principal open source components Harbor is built from.":
    "The principal open source components Harbor is built from.",
  "The release Harbor watches for. Everything else on this page narrows it down.":
    "The release Harbor watches for. Everything else on this page narrows it down.",
  "The shadow is what keeps the title and buttons readable. Drop it too far and the text starts fighting the artwork.":
    "The shadow is what keeps the title and buttons readable. Drop it too far and the text starts fighting the artwork.",
  "The sidebar set. Click any one to save the SVG.":
    "The sidebar set. Click any one to save the SVG.",
  "The small on-screen readout that appears while you nudge subtitle timing with Z and X during playback. Automatic syncing lives in the Sync tab.":
    "The small on-screen readout that appears while you nudge subtitle timing with Z and X during playback. Automatic syncing lives in the Sync tab.",
  "The stroke or halo drawn behind the letters.": "The stroke or halo drawn behind the letters.",
  "The text Harbor prints on the badge, for example REMUX.":
    "The text Harbor prints on the badge, for example REMUX.",
  "The typeface subtitles are drawn in. Add your own TTF, OTF or WOFF file if none of these suit.":
    "The typeface subtitles are drawn in. Add your own TTF, OTF or WOFF file if none of these suit.",
  "The volume bar stops at 100 percent. No boost is available.":
    "The volume bar stops at 100 percent. No boost is available.",
  "Theme and appearance": "Theme and appearance",
  "Then notify": "Then notify",
  "These are Harbor's own, drawn for Harbor. Take them for a theme, a fork, a mockup, a personal project. Keep the credit on the artists and do not sell the set on its own.":
    "These are Harbor's own, drawn for Harbor. Take them for a theme, a fork, a mockup, a personal project. Keep the credit on the artists and do not sell the set on its own.",
  "These organisations provide their services to Harbor at no cost.":
    "These organisations provide their services to Harbor at no cost.",
  "These rows are switched on but hidden from your home page. Choose Show to bring one back.":
    "These rows are switched on but hidden from your home page. Choose Show to bring one back.",
  "This badge is hidden everywhere streams show format chips.":
    "This badge is hidden everywhere streams show format chips.",
  "This badge uses art you picked instead of Harbor's default.":
    "This badge uses art you picked instead of Harbor's default.",
  "This cannot be undone. You would need to deploy a new relay.":
    "This cannot be undone. You would need to deploy a new relay.",
  "This deletes those entries from your library. Playing them again re-adds them.":
    "This deletes those entries from your library. Playing them again re-adds them.",
  "This file restores its {n} saved entries and replaces only those parts of your setup. Anything it does not contain stays exactly as it is.":
    "This file restores its {n} saved entries and replaces only those parts of your setup. Anything it does not contain stays exactly as it is.",
  "Tile your own artwork across the timeline instead of a plain fill.":
    "Tile your own artwork across the timeline instead of a plain fill.",
  Timeline: "Timeline",
  "Titles you are part-way through in your local downloads, even offline.":
    "Titles you are part-way through in your local downloads, even offline.",
  "Torrentio 4K": "Torrentio 4K",
  "Trakt progress": "Trakt progress",
  Trigger: "Trigger",
  "Tucked into the upper corner, clear of the subtitles.":
    "Tucked into the upper corner, clear of the subtitles.",
  "Turn on AniList comments first.": "Turn on AniList comments first.",
  "Turn this off and the report ships with no name attached.":
    "Turn this off and the report ships with no name attached.",
  "Turn this off to keep the rule but stop it sending anything for now.":
    "Turn this off to keep the rule but stop it sending anything for now.",
  "Turn this on and Harbor watches just the Live TV channels you starred. Off means every channel in your playlists.":
    "Turn this on and Harbor watches just the Live TV channels you starred. Off means every channel in your playlists.",
  "Turning this on adds your Letterboxd catalogs to the home page and a Letterboxd panel to every film page.":
    "Turning this on adds your Letterboxd catalogs to the home page and a Letterboxd panel to every film page.",
  "Type any release name here to see what Harbor would badge it with.":
    "Type any release name here to see what Harbor would badge it with.",
  "Unavailable while Continue Watching is kept private to each profile, because Simkl progress is shared across every profile on this account.":
    "Unavailable while Continue Watching is kept private to each profile, because Simkl progress is shared across every profile on this account.",
  "Unavailable while Continue Watching is kept private to each profile, because Trakt progress is shared across every profile on this account.":
    "Unavailable while Continue Watching is kept private to each profile, because Trakt progress is shared across every profile on this account.",
  "Unavailable while Continue Watching is kept private to each profile.":
    "Unavailable while Continue Watching is kept private to each profile.",
  Unlink: "Unlink",
  "Unpin this competition": "Unpin this competition",
  "Up to 3840 × 2160 when the source has it. Takes a beat longer to start.":
    "Up to 3840 × 2160 when the source has it. Takes a beat longer to start.",
  "Upload a picture of your own, or pick one from the Harbor catalog.":
    "Upload a picture of your own, or pick one from the Harbor catalog.",
  "Uploads stay on this computer. Keep the file under 250 KB.":
    "Uploads stay on this computer. Keep the file under 250 KB.",
  "Use color to distinguish severity, or keep every advisory monochrome.":
    "Use color to distinguish severity, or keep every advisory monochrome.",
  "Use for this fixture": "Use for this fixture",
  "Used only if we need one more detail to reproduce the bug.":
    "Used only if we need one more detail to reproduce the bug.",
  "User-made packs from the community store, refreshed every week.":
    "User-made packs from the community store, refreshed every week.",
  "Using these": "Using these",
  "Video element": "Video element",
  "Volume {n}": "Volume {n}",
  Vulkan: "Vulkan",
  W: "W",
  "Warming up…": "Warming up…",
  "Watched history": "Watched history",
  "Watchlist ({n})": "Watchlist ({n})",
  "We sent a 6-digit code to your Discord DMs. It expires in 10 minutes.":
    "We sent a 6-digit code to your Discord DMs. It expires in 10 minutes.",
  "We tag this account on the issue so you see the fix land.":
    "We tag this account on the issue so you see the fix land.",
  "We'll show a one-time recovery key and send it to you on Discord. Save it: it's the only way back in if you forget your password.":
    "We'll show a one-time recovery key and send it to you on Discord. Save it: it's the only way back in if you forget your password.",
  "What should the backup include?": "What should the backup include?",
  "What the sidebar icons do when you land on them.":
    "What the sidebar icons do when you land on them.",
  "What this rule is called in your list. Leave it empty and Harbor names it after the trigger.":
    "What this rule is called in your list. Leave it empty and Harbor names it after the trigger.",
  "When a movie or episode starts, briefly show its Common Sense Media parental guide (violence, nudity, profanity, substances) with severity. Fades on its own.":
    "When a movie or episode starts, briefly show its Common Sense Media parental guide (violence, nudity, profanity, substances) with severity. Fades on its own.",
  "Where Play looks first": "Where Play looks first",
  "Where a subtitle line sits across the width of the video.":
    "Where a subtitle line sits across the width of the video.",
  "Where badges come from": "Where badges come from",
  "Where the laurel tab sits relative to the score chips on the poster.":
    "Where the laurel tab sits relative to the score chips on the poster.",
  "Which top corner of the poster the ribbon folds over.":
    "Which top corner of the poster the ribbon folds over.",
  "Who drew all this": "Who drew all this",
  "Writes the last playback session to your Downloads folder so you can attach it above.":
    "Writes the last playback session to your Downloads folder so you can attach it above.",
  "Yellow cards": "Yellow cards",
  "You have no automations yet. Create one and Harbor will message you the moment something matches.":
    "You have no automations yet. Create one and Harbor will message you the moment something matches.",
  "You have not added any favourites yet": "You have not added any favourites yet",
  "Your AniList account": "Your AniList account",
  "Your MyAnimeList account": "Your MyAnimeList account",
  "Your Simkl account": "Your Simkl account",
  "Your Trakt account": "Your Trakt account",
  "Your own Harbor account progress. The primary source for almost everyone.":
    "Your own Harbor account progress. The primary source for almost everyone.",
  "Your pick for this competition": "Your pick for this competition",
  "Your preferences, layout state, and small lookup caches. Clearing caches shrinks this.":
    "Your preferences, layout state, and small lookup caches. Clearing caches shrinks this.",
  "Your teams": "Your teams",
  at: "at",
  "contains login credentials": "contains login credentials",
  icons: "icons",
  "in 4d 6h": "in 4d 6h",
  "in {d}d": "in {d}d",
  "in {d}d {h}h": "in {d}d {h}h",
  "in {h}h": "in {h}h",
  "in {h}h {m}m": "in {h}h {m}m",
  "in {m}m": "in {m}m",
  "in {n}m": "in {n}m",
  "in {n}s": "in {n}s",
  "nowhere yet": "nowhere yet",
  username: "username",
  vs: "vs",
  "{count} installed. Their results are merged in with everything else.":
    "{count} installed. Their results are merged in with everything else.",
  "{ms} ms": "{ms} ms",
  "{m} of {n} on": "{m} of {n} on",
  "{n} badges use art you picked instead of Harbor's default.":
    "{n} badges use art you picked instead of Harbor's default.",
  "{n} badges, by {name}": "{n} badges, by {name}",
  "{n} films.": "{n} films.",
  "{n} followed": "{n} followed",
  "{n} found": "{n} found",
  "{n} images in that pack could not be loaded.": "{n} images in that pack could not be loaded.",
  "{n} of {total} chosen": "{n} of {total} chosen",
  "{n} px/s": "{n} px/s",
  "{n} seconds": "{n} seconds",
  "{n}x card width": "{n}x card width",
  "{trigger}. Sends to {channels}.": "{trigger}. Sends to {channels}.",
  "Harbor on Discord": "Harbor on Discord",
  "Release notes, help from other people using Harbor, and somewhere to send bugs.":
    "Release notes, help from other people using Harbor, and somewhere to send bugs.",
  "Player controls in Big Picture": "Player controls in Big Picture",
  "Ten-foot uses large controls built for a remote across the room. Desktop keeps the same player you use in the normal window, which is quicker with a mouse and keyboard.":
    "Ten-foot uses large controls built for a remote across the room. Desktop keeps the same player you use in the normal window, which is quicker with a mouse and keyboard.",
  "Ten-foot": "Ten-foot",
  Desktop: "Desktop",
  "Prefer original-language audio": "Prefer original-language audio",
  "Pick the audio track in the title's original language before your list, so a Japanese film plays in Japanese and a Spanish series in Spanish. Uses TMDB to find the language when the title doesn't say.":
    "Pick the audio track in the title's original language before your list, so a Japanese film plays in Japanese and a Spanish series in Spanish. Uses TMDB to find the language when the title doesn't say.",
  "Start reading": "Start reading",
  "Mark as unread": "Mark as unread",
  "Mark as read": "Mark as read",
  "Browse by Country": "Browse by Country",
  "The canon": "The canon",
  "music.billboard.rank": "#{rank} on the Billboard Hot 100",
  "music.spotifyDevices.title": "Play on",
  "music.spotifyDevices.body":
    "Harbor plays Spotify through its own output. Pick another device to hear it there instead.",
  "music.spotifyDevices.refresh": "Refresh",
  "music.spotifyDevices.harbor": "Harbor",
  "music.spotifyDevices.empty":
    "No other Spotify devices are awake. Open Spotify on a phone, speaker or desktop and refresh.",
  "music.lastfm.viewProfile": "View profile",
  "music.lastfm.keyHelp":
    "Last.fm asks every app to identify itself. Create a free API account, then paste the key and shared secret it shows you. Harbor keeps both on this device.",
  "music.lastfm.getKey": "Get an API key",
  "music.lastfm.createAccount": "Create a Last.fm account",
  "Pick a preset above, or add a filter to start shaping the sound.":
    "Pick a preset above, or add a filter to start shaping the sound.",
  "music.quick.playlists": "Playlists",
  "music.quick.playlistsNote": "Everything you have made and saved",
  "music.quick.play": "Play {name}",
  "music.quick.empty": "Nothing played yet",
  "music.quick.emptyNote": "Songs you play show up here for one click back.",
  "music.card.openPlaying": "Open {name}",
  "Set up Live TV to watch these events.": "Set up Live TV to watch these events.",
  "games.noResults": "No matching games",
  "games.library.showMore": "Show more games",
  "The Times: Best Books of the 21st Century": "The Times: Best Books of the 21st Century",
  "From the New York Times critics' list of the century so far":
    "From the New York Times critics' list of the century so far",
  "Read It Before You Watch It": "Read It Before You Watch It",
  "Books behind the films and series everyone knows":
    "Books behind the films and series everyone knows",
  "Banned and Challenged": "Banned and Challenged",
  "Books someone tried to pull from a shelf": "Books someone tried to pull from a shelf",
  "Nobel Laureates in Literature": "Nobel Laureates in Literature",
  "Signature works by winners of the Nobel Prize": "Signature works by winners of the Nobel Prize",
  "Twentieth century books that never left the shelf":
    "Twentieth century books that never left the shelf",
  Dystopias: "Dystopias",
  "Futures nobody would choose to live in": "Futures nobody would choose to live in",
  "Crime and Mystery Essentials": "Crime and Mystery Essentials",
  "The cases that set the genre": "The cases that set the genre",
  "Women's Prize for Fiction": "Women's Prize for Fiction",
  "Full length fiction by women writing in English":
    "Full length fiction by women writing in English",
  "National Book Award Winners": "National Book Award Winners",
  "The American award for the year's best writing":
    "The American award for the year's best writing",
  "Backdrop mosaic": "Backdrop mosaic",
  "Backdrop zoom": "Backdrop zoom",
  "games.savedEmpty": "A place for your next adventure",
  "Snapshot {date}": "Snapshot {date}",
  "Inducted {year}": "Inducted {year}",
  Credits: "Credits",
  "Essay by {name}": "Essay by {name}",
  "Essay from the Library": "Essay from the Library",
  "Showing {shown} of {total} from the last snapshot.":
    "Showing {shown} of {total} from the last snapshot.",
  "Spine {n}": "Spine {n}",
  "Film Registry": "Film Registry",
  "One other screen version": "One other screen version",
  "{n} other screen versions": "{n} other screen versions",
  "Read it": "Read it",
  Television: "Television",
  "No Season": "No Season",
  "One episode · Apple Podcasts": "One episode · Apple Podcasts",
  "{n} episodes · Apple Podcasts": "{n} episodes · Apple Podcasts",
  "Open in Apple Podcasts": "Open in Apple Podcasts",
  "Based on": "Based on",
  Soundtrack: "Soundtrack",
  "Discussed on": "Discussed on",
  ShotOnWhat: "ShotOnWhat",
  Digital: "Digital",
  "Shot on": "Shot on",
  Camera: "Camera",
  Cameras: "Cameras",
  Lens: "Lens",
  Lenses: "Lenses",
  "Film stock": "Film stock",
  Finish: "Finish",
  "Shares crew with 1 other film": "Shares crew with 1 other film",
  "Shares crew with {n} other films": "Shares crew with {n} other films",
  "Shares crew with": "Shares crew with",
  "Three or more of the same crew": "Three or more of the same crew",
  "Same source": "Same source",
  "Shares {n} crew": "Shares {n} crew",
  Editions: "Editions",
  "{n} published": "{n} published",
  Readers: "Readers",
  "{n} ratings": "{n} ratings",
  "Want to read": "Want to read",
  "{n} readers": "{n} readers",
  Setting: "Setting",
  Period: "Period",
  "The series that carried {name} beyond its own borders":
    "The series that carried {name} beyond its own borders",
  "The films that carried {name} beyond its own borders":
    "The films that carried {name} beyond its own borders",
  "1 title from {name}": "1 title from {name}",
  "{n} titles from {name}": "{n} titles from {name}",
  "The country's biggest names, ranked across their whole careers":
    "The country's biggest names, ranked across their whole careers",
  "The directors from {name}, ranked across their whole careers":
    "The directors from {name}, ranked across their whole careers",
  "Top ten films of {year}": "Top ten films of {year}",
  "games.about": "About the game",
  "games.steam": "View on Steam",
  "games.charts.loading": "Loading chart…",
  "games.discovery.activeTitle": "Where everyone is playing",
  "games.discovery.activeNote": "Steam's most-played games, with current player counts.",
  "games.availability.": "games.availability.",
  "games.charts.error": "This chart couldn't load. Try again.",
  "games.discovery.activeSource": "Ordered by Steam's daily most-played chart",
  "games.discovery.countsSource": "Current player counts from Steam · refreshed every 2 minutes",
  "games.editorial.consoleTitle": "Across generations",
  "games.editorial.consoleNote":
    "Explore console libraries, from handheld classics to new releases.",
  "games.atlas.browseAll": "Explore the atlas",
  "games.editorial.explorePlatform": "Explore games",
  "games.atlas.hacksNote": "Familiar foundations. Entirely new adventures.",
  "games.clear": "Clear search",
  "games.emulation.ownGames": "Have games for this platform on your device?",
  "games.atlas.mod": "Mod",
  "games.atlas.ratingNote": "IGDB combined rating · {count} ratings",
  "games.retryNote": "Try again to load the game catalog.",
  "games.details.broadcast": "Broadcasting now",
  "games.details.broadcastViewers": "{count} watching",
  "games.details.broadcastSource": "Steam Broadcast · Refreshed every minute",
  "games.details.broadcastWatch": "Watch on Steam",
  "games.catalog.inTheMood": "Worlds, moods & mechanics",
  "games.catalog.players": "Play style",
  "games.catalog.price": "Price",
  "games.allPlatforms": "All platforms",
  "games.catalog.filters": "Filters",
  "games.fullController": "Full controller support",
  "games.details.removeFeature": "Remove {name} filter",
  "games.results": "Search results",
  "games.catalog.title": "Find your kind of game",
  "games.catalog.error": "This part of the catalog couldn't load. Try again to continue.",
  "games.catalog.activeFilters": "{count} filters active",
  "games.catalog.searching": "Exploring the catalog…",
  "games.library.grid": "Cover view",
  "games.catalog.noResultsNote": "Try fewer filters or another title.",
  "games.cloud.part": "Download part {n}",
  "games.cloud.kicker": "Your connected services",
  "games.cloud.title": "Cloud files",
  "games.cloud.provider": "Cloud service",
  "games.cloud.connected": "Connected",
  "games.cloud.openSettings": "Open source settings",
  "games.cloud.review": "Ready to download",
  "games.cloud.root": "Your files",
  "games.cloud.refresh": "Refresh files",
  "games.cloud.unknownSize": "Size not supplied",
  "games.cloud.reviewNote":
    "Choose where to save this file. You can follow its progress and pause or resume it in Downloads.",
  "games.cloud.search": "Search this page",
  "games.cloud.clearSearch": "Clear file search",
  "games.cloud.resolving": "Preparing download…",
  "games.cloud.folder": "Folder",
  "games.cloud.more": "Show more files",
  "games.cloud.previousPage": "Previous file page",
  "games.cloud.nextPage": "Next file page",
  "games.discovery.collections": "Find your kind of game",
  "games.collectionNote": "Explore by the way you like to play.",
  "games.discovery.collectionPosition": "Collections {start}–{end} of {total}",
  "games.collection.search": "Search this collection",
  "games.community.studio": "From the studio",
  "games.community.allUpdates": "All updates",
  "games.community.newsError": "Studio updates couldn't load. Try again in a moment.",
  "games.community.noUpdates": "The studio hasn't published any announcements here yet.",
  "games.player.position": "Media {current} of {total}",
  "games.achievements": "Steam achievements",
  "games.community.achievementsNote":
    "Game achievement highlights. This doesn't show your personal progress, and names may contain spoilers.",
  "games.community.allAchievements": "All achievements on Steam",
  "games.details.completionTimes": "Completion times",
  "games.details.hours": "{count} hrs",
  "games.details.completionSamples": "Averages · {count} submissions",
  "games.atlas.keepExploring": "Keep exploring",
  "games.atlas.related": "Another world to step into",
  "games.atlas.relatedNote": "Related games from IGDB. Follow what catches your eye.",
  "games.atlas.kind.mode": "Play mode",
  "games.atlas.kind.perspective": "Perspective",
  "games.media.eyebrow": "Connected stories",
  "games.media.filter": "Filter connected stories",
  "games.media.error": "The story connections couldn't load. Try them again.",
  "games.media.more": "More connected stories",
  "games.custom.artwork": "Choose cover image",
  "games.custom.resetArt": "Use catalog artwork",
  "games.custom.title": "Your local games",
  "games.custom.add": "Add a game",
  "games.custom.desktopTitle": "Bring your installed games together",
  "games.custom.desktopNote":
    "Use the Harbor desktop app to add games from your computer and launch them here.",
  "games.custom.visibility": "Game visibility",
  "games.custom.visible": "In your library",
  "games.custom.hidden": "Hidden games",
  "games.custom.running": "Running",
  "games.custom.pinned": "Pinned",
  "games.custom.localFile": "Local game",
  "games.custom.manageNamed": "Manage {name}",
  "games.custom.executable": "Game executable",
  "games.custom.useDefault": "Use default",
  "games.custom.name": "Game name",
  "games.custom.nameHint": "Give your game a name",
  "games.custom.compatibility": "Launch with",
  "games.custom.native": "Direct launch",
  "games.custom.compatNote":
    "Choose an installed compatibility application and a separate folder for this game's Windows settings and saves. Harbor uses these choices only when you press Play.",
  "games.custom.advanced": "Launch options",
  "games.custom.arguments": "Arguments",
  "games.custom.argumentsNote":
    "One argument per line. Spaces stay part of that argument; no extra quotes are needed. Blank lines are ignored.",
  "games.custom.detailsTitle": "Artwork and game details",
  "games.custom.lastLaunch": "Last launched",
  "games.custom.historyNote":
    "Counts completed processes launched while Harbor is open. A separate launcher may close before its game, so this can differ from the game's own playtime.",
  "games.custom.removeNote":
    "Remove {name} and its launch history from Harbor? The game, artwork files, compatibility folder, and save backups stay on your computer.",
  "games.custom.remove": "Remove from library",
  "games.details.scan": "Check installed games",
  "games.details.support": "Controls & compatibility",
  "games.details.playOn": "Play on",
  "games.details.controllerPartial": "Controller support",
  "games.details.deckMore": "See Steam Deck compatibility details",
  "games.details.deck": "Steam Deck",
  "games.details.playersAt": "Checked {time}",
  "games.details.playingNow": "playing now on Steam",
  "games.details.ratings": "Ratings",
  "games.details.ratingCount": "{count} ratings",
  "games.details.critics": "Critic score",
  "games.languages": "Languages",
  "games.details.languageCount": "{count} supported languages",
  "games.requirements": "System requirements",
  "games.details.publicAchievements": "Achievements",
  "games.details.viewAchievements": "View all {count}",
  "games.detailError": "Details aren't available for this listing.",
  "games.library.play": "Play",
  "games.libraryPersonal.customize": "Customize game",
  "games.details.findSources": "Find sources",
  "games.details.details": "Game details",
  "games.details.information": "Release & studio",
  "games.features": "Features & play modes",
  "games.details.enrichmentError": "Extra game details are unavailable right now.",
  "games.atlas.relationshipError": "The wider game connections couldn't be loaded.",
  "games.editorial.scoreNote": "{score}% positive from {count} Steam reviews",
  "games.discovery.ratingsLoading": "Loading ratings",
  "games.discovery.ratingCount": "{count} ratings",
  "games.freshArrivals": "New releases",
  "games.new_releases": "New on Steam",
  "games.new_releasesNote": "New releases on Steam",
  "games.newRelease": "New on Steam",
  "games.charts.title": "Explore the charts",
  "games.charts.note": "What people play, what they rate, and what's next.",
  "games.liveCatalog": "Explore more",
  "games.charts.search": "Filter this list",
  "games.download.details": "File details",
  "games.download.progress": "Download progress for {name}",
  "games.torrent.peers": "{count} peers",
  "games.download.destination": "Destination",
  "games.library.refresh": "Rescan",
  "games.sources.manage": "Sources",
  "games.torrent.add": "Add torrent",
  "games.download.add": "Add download",
  "games.download.desktopTitle": "Make room for what's next",
  "games.download.desktopNote":
    "Download and manage game files in Harbor for Windows, macOS or Linux.",
  "games.download.verified": "Checksum matches",
  "games.download.pauseShort": "Pause download",
  "games.download.pause": "Pause {name}",
  "games.download.resume": "Resume {name}",
  "games.download.revealShort": "Show in folder",
  "games.download.reveal": "Show {name} in folder",
  "games.download.remove": "Remove {name} from queue",
  "games.download.cancelShort": "Cancel and discard partial download",
  "games.download.cancel": "Cancel {name}",
  "games.download.directNote":
    "Paste the direct link to a file, then choose a destination. Downloading doesn't run or install it.",
  "games.download.url": "Direct file link",
  "games.download.name": "Display name (optional)",
  "games.download.checksum": "Check against a publisher checksum",
  "games.download.hashPlaceholder": "64-character SHA-256",
  "games.download.hashNote":
    "If the publisher provides a SHA-256 checksum, paste it here. Harbor will compare the completed file before marking it downloaded.",
  "games.emulation.platform": "For {name}",
  "games.emulation.setup": "Player setup",
  "games.emulation.desktopTitle": "Your collection belongs here",
  "games.emulation.desktopNote":
    "Use Harbor on Windows, macOS or Linux to connect your game folders and installed emulators. Discovery and your saved games are available here too.",
  "games.emulation.emulator": "Emulator",
  "games.emulation.application": "Application",
  "games.emulation.noApp": "Choose the installed application",
  "games.emulation.core": "RetroArch core",
  "games.emulation.chooseCoreNote": "Select a core that supports {name}",
  "games.emulation.chooseCore": "Choose core",
  "games.emulation.notDetected":
    "{name} wasn't found in the usual locations. Choose its application if you keep it somewhere else.",
  "games.emulation.official": "Get {name} from its project",
  "games.emulation.recent": "Last played here",
  "games.catalog.sort.Name_ASC": "Title A–Z",
  "games.library.view": "Library view",
  "games.library.list": "List view",
  "games.emulation.importing": "Reading your games…",
  "games.emulation.discs": "{count} discs",
  "games.emulation.unavailableGame": "Files unavailable · Check the folder",
  "games.match.findFor": "Find artwork for {name}",
  "games.emulation.folders": "Connected folders · {count}",
  "games.emulation.unavailableFolder":
    "This folder couldn't be read. Reconnect the drive and rescan.",
  "games.emulation.scanLimited":
    "This scan reached its limit. Add a smaller subfolder to include the rest.",
  "games.emulation.skipped": "{count} items couldn't be read.",
  "games.emulation.removeFolder": "Disconnect {name}",
  "games.emulation.removeNote":
    "Disconnecting a folder only removes it from Harbor. Your files stay where they are.",
  "games.discovery.esportsTitle": "On the competitive stage",
  "games.discovery.esportsEntry": "Follow tournaments, teams and live broadcasts in Harbor Sports.",
  "games.discovery.openSports": "Open Sports",
  "games.discovery.esportsNote": "Live matches and the next events to watch in Harbor Sports.",
  "games.discovery.bestOf": "Best of {count}",
  "games.discovery.viewEvent": "View event",
  "games.discovery.esportsCoverage": "{ready} of {total} match feeds available",
  "games.discovery.worldsTitle": "Enter a world",
  "games.discovery.worldsNote": "Follow a series across games and generations.",
  "games.discovery.exploreWorld": "Explore the collection",
  "games.discovery.gameType.": "games.discovery.gameType.",
  "games.editorial.favorites": "Player favorites",
  "games.editorial.moreRated": "Browse top rated",
  "games.discovery.reviewCount": "{count} reviews",
  "games.editorial.favoritesError": "Player favorites couldn't load.",
  "games.bundles.terms":
    "Title matched with Humble's live bundle listing. Check the included edition, tier and region before buying.",
  "games.bundles.included": "In a Humble bundle",
  "games.bundles.ends": "Ends {date}",
  "games.bundles.unavailable": "Humble bundle availability couldn't be fully checked.",
  "games.prices.title": "Compare prices",
  "games.prices.find": "Find a price",
  "games.prices.from": "at {store}",
  "games.details.storeRegion": "US store",
  "games.prices.steamSale": "Steam sale: {discount}% off",
  "games.shops.back": "Back to prices",
  "games.prices.lowest": "Lowest matching price",
  "games.prices.noMatching": "No tracked offers match these filters.",
  "games.prices.market": "USD prices",
  "games.prices.region": "Activation region: check the store",
  "games.prices.keyshops": "Explore key shops",
  "games.prices.keyshopsHint": "Browse stores, marketplaces and price comparison sites",
  "games.prices.activation": "Activation",
  "games.prices.steamOffers": "Steam offers",
  "games.prices.allPc": "All PC offers",
  "games.prices.seller": "Store",
  "games.prices.allStores": "All stores",
  "games.prices.refresh": "Refresh prices",
  "games.prices.offerCount": "{count} offers",
  "games.prices.priceOrder": "Lowest price first",
  "games.prices.viewAt": "View offer at {store}",
  "games.prices.view": "View offer",
  "games.prices.coverage":
    "Prices from stores tracked by CheapShark. Activation-country restrictions and checkout fees are not included in this feed.",
  "games.prices.partial": "Some results may be unavailable.",
  "games.shops.footer": "Shop directory · Prices and availability checked on each website",
  "games.prices.source": "Prices by CheapShark",
  "games.prices.checked": "Checked {time}",
  "games.shops.shoppingFor": "Shopping for",
  "games.shops.copyError": "Couldn't copy. Select the game name above to copy it.",
  "games.shops.search": "Find a shop",
  "games.shops.type": "Shop type",
  "games.shops.note":
    "Open a shop to search this game and choose your region. Check the edition, activation platform and whether the listing is a key or an account.",
  "games.shops.empty": "No shops match. Try another name or shop type.",
  "music.quick.search": "Search songs",
  "music.quick.saved": "Saved songs",
  "games.library.playGame": "Play {name}",
  "games.libraryPersonal.manage": "Customize {name}",
  "games.libraryPersonal.yourLibrary": "Make it yours",
  "games.libraryPersonal.chooseCover": "Choose cover",
  "games.libraryPersonal.originalCover": "Use original cover",
  "games.libraryPersonal.coverNote":
    "A portrait image fits best. Your original artwork stays available.",
  "games.libraryPersonal.pin": "Pin near the top",
  "games.libraryPersonal.pinNote": "Keep this game ahead of the rest of your library.",
  "games.libraryPersonal.hide": "Hide from your games",
  "games.libraryPersonal.hideNote":
    "Find it again in Hidden. Its files and saves stay where they are.",
  "games.libraryPersonal.localNote":
    "Saved for this Harbor profile. Steam and your game files stay unchanged.",
  "games.mods.nav": "Mods",
  "games.library.yourSpace": "Your games, together",
  "games.library.desktopTitle": "Your library lives in Harbor.",
  "games.library.desktopNote":
    "Open Harbor on your computer to find your installed Steam games and launch them from one place.",
  "games.library.findInstalls": "Find installed games",
  "games.library.launchSteam": "Play through Steam",
  "games.library.scanning": "Finding your Steam games…",
  "games.account.installedView": "On this device",
  "games.account.ownedView": "Account library",
  "games.library.scanError":
    "Your library couldn't be refreshed. Previously found games are still shown.",
  "games.library.noSteam": "Steam hasn't been found yet",
  "games.library.noSteamNote": "Install Steam and add a game, then rescan your library.",
  "games.library.recentPick": "Back to your world",
  "games.library.installed": "Ready to play",
  "games.library.details": "Game details",
  "games.library.offline": "Unavailable",
  "games.library.partialNote":
    "Some libraries or game files couldn't be read. Reconnect any unavailable drives, then rescan.",
  "games.library.count": "{count} games",
  "games.library.status": "Install status",
  "games.library.all": "All games",
  "games.library.gameDetails": "Details for {name}",
  "games.loadError": "Steam couldn't be reached",
  "games.emulation.chooseCopy": "Choose a copy to play",
  "games.screenshot": "Screenshot {number}",
  "games.gallery": "Screenshots and trailers",
  "games.player.previous": "Previous media",
  "games.player.next": "Next media",
  "games.player.trailerNamed": "Trailer: {name}",
  "games.mods.chooseFolder": "Choose mods folder",
  "games.mods.kicker": "Builders & sims",
  "games.mods.title": "A different kind of playground.",
  "games.mods.gameVersion": "Minecraft version",
  "games.mods.loader": "Mod loader",
  "games.mods.workspace": "Mod workspace",
  "games.mods.selectFolder": "Choose a workspace",
  "games.mods.view": "Mod view",
  "games.mods.sort": "Order mods",
  "common.refresh": "Refresh",
  "games.mods.added": "In your setup",
  "games.mods.empty": "No mods match this setup",
  "games.mods.emptyNote": "Try another search, Minecraft version, or loader.",
  "games.mods.results": "{count} compatible projects",
  "games.mods.projectPage": "Project page",
  "games.mods.ready": "Your setup is ready",
  "games.mods.verifiedNote":
    "Each file is checked against its published SHA-512 hash. Harbor keeps a record so you can disable or remove it later.",
  "games.mods.optionalNote":
    "{count} optional dependencies are listed by these projects. They are not added automatically.",
  "games.mods.version": "Compatible version",
  "games.mods.noVersion": "This project has no downloadable version for the selected setup.",
  "games.mods.resolving": "Checking compatibility and dependencies…",
  "games.mods.installing": "Downloading and checking files…",
  "games.feed.title": "Updates & events",
  "games.feed.note": "The latest from the developers of today's most-played games.",
  "games.feed.refresh": "Refresh",
  "games.feed.refreshing": "Checking updates…",
  "games.publisher": "Publisher",
  "games.feed.error": "Some developer posts couldn't load. Try again.",
  "games.feed.empty": "No recent developer announcements in this selection.",
  "games.feed.source": "Developer announcements on Steam · Sorted by publication date",
  "games.free": "Free to play",
  "games.library.sort.name": "Title A–Z",
  "games.story.error": "Game artwork is unavailable. You can still open each title.",
  "games.details.achievementNote": "Global achievements · Steam Community",
  "games.details.achievementError": "Couldn't load the public achievement list.",
  "games.details.achievementHidden": "Description hidden by the developer",
  "games.details.achievementRate": "{percent}% of players",
  "games.details.achievementSource": "View on Steam Community",
  "games.community.hoursAtReview": "{count} hours at review",
  "games.community.playedOnDeck": "Mostly on Steam Deck",
  "games.community.receivedFree": "Received for free",
  "games.community.earlyAccess": "Early Access review",
  "games.community.refunded": "Refunded",
  "games.community.developerResponse": "Developer response",
  "games.community.helpfulCount": "{count} found this helpful",
  "games.community.original": "Original review",
  "games.community.players": "People who played",
  "games.community.community": "Steam community",
  "games.community.recommend": "recommend this game",
  "games.community.ratingCount": "Across {count} reviews in this selection",
  "games.community.sort": "Review order",
  "games.community.sentiment": "Recommendation",
  "games.community.filters": "Review filters",
  "games.community.language": "Review language",
  "games.community.playtime": "Time played",
  "games.community.purchase": "Game access",
  "games.community.deckOnly": "Steam Deck players",
  "games.community.resetFilters": "Reset extra filters",
  "games.community.minimumHours": "At least {count} hours",
  "games.community.noReviews": "No reviews match these filters. Try a wider selection.",
  "games.community.reviewError": "Player reviews couldn't load. Your selection is still here.",
  "games.community.matches": "{count} matching reviews",
  "games.featuredSelection": "Featured selection",
  "games.details.recommended": "Recommended",
  "games.romShowcase.eyebrow": "Made by fans",
  "games.romShowcase.title": "ROM hacks",
  "games.romShowcase.note": "New stories, regions and challenges for familiar consoles.",
  "games.romShowcase.browse": "Explore ROM hacks",
  "games.exploreGame": "Explore game",
  "games.romShowcase.empty": "No ROM hacks returned. Try again or explore the full catalog.",
  "games.season.error": "Seasonal games couldn't load. Try again.",
  "games.controller": "Controller support",
  "games.details.showMore": "Show more",
  "games.sources.platform.": "games.sources.platform.",
  "games.sources.copyError": "Couldn't copy this link. Try again.",
  "games.sources.public.state.": "games.sources.public.state.",
  "games.sources.public.": "games.sources.public.",
  "games.sources.eyebrow": "Your sources, together",
  "games.sources.releases": "Available releases",
  "games.sources.cachedNote":
    "Some sources couldn't refresh. Listings from their last successful update are still available.",
  "games.sources.titleNote":
    "This listing has a similar title but no game ID. Check the edition and platform before choosing a file.",
  "games.sources.cachedRelease":
    "Cached listing from {date}. The source hasn't refreshed successfully since then.",
  "games.sources.openLink": "Visit source",
  "games.sources.copyMagnet": "Copy magnet",
  "games.sources.checked": "Updated {date}",
  "games.sources.enable": "Use {name}",
  "games.sources.refresh": "Refresh {name}",
  "games.sources.remove": "Remove {name}",
  "games.sources.retained": "Your previous catalog is still here.",
  "games.sources.skipped": "{count} invalid or duplicate listings were left out.",
  "games.sources.chooseNote":
    "Bring your game, mod, and patch catalogs into one place. You choose which sources appear on game pages.",
  "games.sources.empty": "Make room for your sources.",
  "games.sources.emptyNote":
    "Add a catalog link to browse its releases and find matches across your games.",
  "games.sources.search": "Search this catalog",
  "games.sources.checking": "Reading catalog…",
  "games.sources.profileNote":
    "Sources are saved for this profile. Removing one keeps your downloaded files.",
  "games.sources.add": "Add source",
  "games.details.speedruns": "Speedruns",
  "games.details.speedrunCategory": "Speedrun category",
  "games.details.speedrunError": "Records are unavailable right now.",
  "games.details.speedrunEmpty": "No verified record for this category yet.",
  "games.details.fastestVerified": "Fastest verified",
  "games.details.runDetails": "Run details",
  "games.details.runDate": "Run on {date}",
  "games.details.speedrunScope": "Community default rules · All platforms",
  "games.account.connectHint": "Bring in owned games, playtime and achievement progress.",
  "games.account.connectTitle": "Your Steam library",
  "games.account.manage": "Account",
  "games.account.connect": "Connect Steam",
  "games.account.refresh": "Refresh Steam account",
  "games.account.intro":
    "Connect your Steam profile with a personal Web API key. Harbor can then read your library and achievements while Steam continues to handle your games and account.",
  "games.account.disconnect": "Disconnect",
  "games.account.disconnectNote":
    "Remove this profile's saved Steam connection and account snapshot? Installed games, local games, collections and save backups stay here.",
  "games.account.confirmDisconnect": "Disconnect account",
  "games.account.profile": "Steam profile link or SteamID64",
  "games.account.key": "Personal Steam Web API key",
  "games.account.getKey": "Get your key on Steam",
  "games.account.remember": "Remember on this device",
  "games.account.privacy":
    "Your key goes directly to Steam over an encrypted connection. Harbor only reads account information. It never asks for your Steam password.",
  "games.account.visibilityNote":
    "Steam's profile and game-details privacy settings determine which information is available. A private library won't be shown as an empty one.",
  "games.account.localOnly": "This connection belongs to the current Harbor profile.",
  "games.account.privateTitle": "Your game list is private",
  "games.account.privateNote":
    "Steam didn't make this account's game list available. Check your game-details privacy settings, then refresh here. Installed games are still available in On this device.",
  "games.account.privacySettings": "Steam privacy settings",
  "games.account.hours": "{count} hours played",
  "games.account.unplayed": "No recorded playtime",
  "games.account.installNamed": "Install {name} with Steam",
  "games.account.ownedNote":
    "Account games and playtime reported by Steam, including played free games. Installation opens Steam's own setup flow.",
  "games.account.achievements": "Your achievements",
  "games.account.unlocked": "unlocked",
  "games.account.searchAchievements": "Find an achievement",
  "games.account.achievementFilter": "Achievement status",
  "games.discovery.sale.checked": "Checked {date}",
  "games.discovery.sale.dateRange": "{start} to {end}",
  "games.discovery.sale.calendar": "Upcoming sales",
  "games.discovery.sale.error": "The sale schedule couldn't refresh.",
  "games.discovery.sale.title": "Steam sales",
  "games.discovery.sale.unannounced": "Steam hasn't published the next seasonal sale dates yet.",
  "games.steamStatus.details": "Service status",
  "games.onTheHorizon": "On the horizon",
  "games.coming_soon": "Coming soon",
  "games.coming_soonNote": "Upcoming releases to keep an eye on",
  "games.media.evidence": "View this connection on Wikidata",
  "games.editorial.connected": "Beyond the game",
  "games.story.title": "Story order",
  "games.story.entryNote": "Resident Evil games, films & series · Capcom timeline",
  "games.story.note":
    "Follow the story across games and animated films. Dates show when events happen; some stories overlap.",
  "games.story.current": "You're here",
  "games.story.original": "View original game",
  "games.story.scope":
    "Based on Capcom's published timeline through Village. Later releases and DLC are not included. Live-action adaptations follow separate continuities.",
  "games.story.source": "Capcom · View the source timeline",
  "games.discovery.studioRange": "Games {start}–{end}",
  "games.discovery.studioPrevious": "Previous studio games",
  "games.discovery.studioNext": "More studio games",
  "games.discovery.studioLoading": "Loading more games",
  "games.studios.error": "This studio couldn't load. Try again.",
  "games.studios.related": "Related studios",
  "games.studios.partOf": "Part of",
  "games.studios.title": "Studios & publishers",
  "games.studios.note": "Find more from the people behind your favorite games.",
  "games.studios.search": "Find a studio or publisher",
  "games.studios.empty": "No matching studios. Try another name.",
  "games.studios.featured": "Explore studios",
  "games.studios.previous": "Previous studios",
  "games.studios.next": "More studios",
  "games.studios.choose": "Choose a studio or publisher",
  "games.studios.explore": "Explore the catalog",
  "games.studios.source": "Games and company relationships from IGDB",
  "games.atlas.kind.company": "From the people who made it",
  "games.studios.catalogNote": "Explore games from this studio and its related labels.",
  "games.torrent.destination": "Where should they go?",
  "games.torrent.folderName": "New folder name",
  "games.torrent.source": "Magnet link or torrent file",
  "games.torrent.chooseFile": "Choose a .torrent file",
  "games.torrent.resolvingNote":
    "Waiting for a peer with this torrent's metadata. You can cancel at any time.",
  "games.torrent.inventory": "{count} files · {size} in total",
  "games.torrent.change": "Change source",
  "games.torrent.downloadLimit": "Download limit",
  "games.torrent.unlimited": "No limit",
  "games.torrent.uploadLimit": "Upload limit",
  "games.torrent.sharingNote":
    "BitTorrent shares pieces while downloading. Harbor stops sharing when your selected files are complete. Two torrents can run at once; the rest wait in order.",
  "games.torrent.identity": "Torrent identity",
  "games.torrent.private": "This private torrent uses its own trackers.",
  "games.torrent.selection": "{count} selected · {size}",
  "games.torrent.reviewNote": "Reviewing a magnet connects to peers for its file list.",
  "games.torrent.fileList": "Torrent files",
  "games.torrent.searchFiles": "Find a file",
  "games.torrent.moreFiles": "Show more files · {count} remaining",
  "games.torrent.fileCount": "{count} selected files",
  "games.torrent.verified": "Pieces verified",
  "games.torrent.bandwidth": "Speed limits",
  "games.torrent.bandwidthValue": "Download: {down} · Upload: {up}",
  "games.torrent.keepNote":
    "Removing this transfer keeps its downloaded files. Unfinished transfers stay paused after restarting Harbor.",
  "games.torrent.remove": "Remove transfer · keep files",
  "games.player.unmute": "Turn sound on",
  "games.player.buffering": "Loading trailer",
  "games.player.error": "This trailer couldn't play.",
  "games.player.retry": "Try trailer again",
  "games.player.seek": "Seek trailer",
  "games.player.volume": "Trailer volume",
  "games.player.wheel": "Scroll to adjust",
  "games.media.movie": "Film",
  "games.storeSource": "Game catalog from Steam",
  "games.updatedAt": "Updated",
  "games.emulation.librarySource": "Library source",
  "games.library.launchError":
    "Steam couldn't open this game. Check its installation in Steam, then try again.",
  "games.saveError": "Couldn't save this change on your device. Please try again.",
  "Tap the heart on any movie, show, or character to save it here. Manga lives in the manga Library.":
    "Tap the heart on any movie, show, or character to save it here. Manga lives in the manga Library.",
  "Added 1 new title from your folders": "Added 1 new title from your folders",
  "Added {n} new titles from your folders": "Added {n} new titles from your folders",
  "Release to place": "Release to place",
  "{label} · Up Next": "{label} · Up Next",
  "Show more chapters ({n} remaining)": "Show more chapters ({n} remaining)",
  "Star any manga and it takes over this screen.": "Star any manga and it takes over this screen.",
  "Create your first manga list": "Create your first manga list",
  "Group the manga you love. Reading now, backlog, all-time favorites.":
    "Group the manga you love. Reading now, backlog, all-time favorites.",
  "Scan with your phone camera, or type the address below.":
    "Scan with your phone camera, or type the address below.",
  "Chapter hidden": "Chapter hidden",
  "Reading on phone": "Reading on phone",
  "Your favorites and manga lists": "Your favorites and manga lists",
  "Horizontal strip": "Horizontal strip",
  "Reading direction": "Reading direction",
  "Hide pages": "Hide pages",
  "Swipe sideways": "Swipe sideways",
  "Tap sides to turn": "Tap sides to turn",
  "Control layout": "Control layout",
  "Changes apply to your computer instantly, and stay in sync both ways.":
    "Changes apply to your computer instantly, and stay in sync both ways.",
  "Strip preview": "Strip preview",
  "Hidden strips scroll numbered pages with the same sync.":
    "Hidden strips scroll numbered pages with the same sync.",
  "music.habit.onRepeat": "On repeat",
  "music.habit.onRepeat.subtitle": "The artists you keep coming back to",
  "music.habit.forgotten": "Buried in your saves",
  "music.habit.forgotten.subtitle": "Saved a while ago and not played since",
  "music.explore.fans": "{count} fans",
  "music.explore.deepTitle": "Keep digging",
  "music.explore.deepSubtitle": "Everything else in this scene, as far as it goes",
  "music.explore.deepEmpty": "Nothing more in this scene yet.",
  "music.jumpBackIn.title": "Jump back in",
  "music.newRelease.title": "New from artists you play",
  "music.newRelease.subtitle": "Just released",
  "music.newRelease.listen": "Listen to {title}",
  "music.newRelease.eyebrow": "New release",
  "music.newRelease.outNow": '"{title}" is out now',
  "music.newRelease.action": "Listen now",
  "music.xxl.title": "XXL Freshman Class",
  "music.xxl.subtitle": "Every class since 2007, pulled live from Wikipedia",
  "Harbor could not reach your music sources while searching for {query}.":
    "Harbor could not reach your music sources while searching for {query}.",
  "No connected music source has {query}. Harbor also searched {alternatives} and found nothing.":
    "No connected music source has {query}. Harbor also searched {alternatives} and found nothing.",
  "No connected music source has {query}.": "No connected music source has {query}.",
  "No source has {query}. Showing results for {fallback}.":
    "No source has {query}. Showing results for {fallback}.",
  "Born today": "Born today",
  "Seen all {total} films": "Seen all {total} films",
  "Seen {n} of {total} films": "Seen {n} of {total} films",
  Editing: "Editing",
  "Production Design": "Production Design",
  "Costume Design": "Costume Design",
  "Searching streams": "Searching streams",
  "Sources unavailable": "Sources unavailable",
  "The service refused the request, so there was nothing for the plugin to return.":
    "The service refused the request, so there was nothing for the plugin to return.",
  "Arrange the plugin tab": "Arrange the plugin tab",
  "This arranges the All plugins page. A single plugin still lists its own rows as it reports them.":
    "This arranges the All plugins page. A single plugin still lists its own rows as it reports them.",
  "No plugin has any rows to arrange.": "No plugin has any rows to arrange.",
  "All plugins": "All plugins",
  "Filter plugins...": "Filter plugins...",
  "Results for {q}": "Results for {q}",
  "Search the plugins for a title": "Search the plugins for a title",
  "No plugin has anything for that title.": "No plugin has anything for that title.",
  "Every row is hidden. Use Arrange to bring one back.":
    "Every row is hidden. Use Arrange to bring one back.",
  "No plugin catalogs yet": "No plugin catalogs yet",
  "Install a plugin that offers rows of its own and they show up here as poster rails.":
    "Install a plugin that offers rows of its own and they show up here as poster rails.",
  "Manage plugins": "Manage plugins",
  "Smoothed frame rate": "Smoothed frame rate",
  "Doubling is the cleanest: a 24fps film becomes an exact 48, so every frame is evenly spaced. Fixed 60 divides 24 unevenly and is the usual cause of shimmering or torn motion.":
    "Doubling is the cleanest: a 24fps film becomes an exact 48, so every frame is evenly spaced. Fixed 60 divides 24 unevenly and is the usual cause of shimmering or torn motion.",
  "Turn on SVP above to choose the frame rate.": "Turn on SVP above to choose the frame rate.",
  "48 fps": "48 fps",
  "60 fps": "60 fps",
  "Match display": "Match display",
  "Keep folders up to date": "Keep folders up to date",
  "Checks the folders already in your library when you open it and adds anything new it finds. Titles you already have are left alone, including any you corrected with Identify.":
    "Checks the folders already in your library when you open it and adds anything new it finds. Titles you already have are left alone, including any you corrected with Identify.",
  Selected: "Selected",
  "Picture in picture": "Picture in picture",
  "Picture in picture style": "Picture in picture style",
  "Resize shrinks the Harbor window itself, so the app goes with it. Detached moves the video into its own floating window and hands Harbor back to you, so you can keep browsing while it plays.":
    "Resize shrinks the Harbor window itself, so the app goes with it. Detached moves the video into its own floating window and hands Harbor back to you, so you can keep browsing while it plays.",
  Resize: "Resize",
  Detached: "Detached",
  "Harbor could not start the runtime that Android extensions need. Reinstall Harbor, or install Java 17 or newer, then try again.":
    "Harbor could not start the runtime that Android extensions need. Reinstall Harbor, or install Java 17 or newer, then try again.",
  "This does not look like a plugin repository. Harbor reads its own plugin manifests, provider-script manifests and Android extension repositories.":
    "This does not look like a plugin repository. Harbor reads its own plugin manifests, provider-script manifests and Android extension repositories.",
  "That is an app link, not a web address. Open the repository in a browser and paste the https link to its JSON file.":
    "That is an app link, not a web address. Open the repository in a browser and paste the https link to its JSON file.",
  "This kind of extension can only be installed in the desktop app.":
    "This kind of extension can only be installed in the desktop app.",
  "Could not install: {error}": "Could not install: {error}",
  "Stopped after {n} failures.": "Stopped after {n} failures.",
  "Plugins look for streams on sites Harbor does not know about. Everything here was installed by you, from repositories you chose.":
    "Plugins look for streams on sites Harbor does not know about. Everything here was installed by you, from repositories you chose.",
  "Pause or resume every plugin at once, without removing anything. The switch below decides where they are asked.":
    "Pause or resume every plugin at once, without removing anything. The switch below decides where they are asked.",
  "Use plugins outside the Plugins page": "Use plugins outside the Plugins page",
  "Let Android extensions, which stand up rows of their own, be asked from Home, Discover, Catalogs, search and the Play button too. A plugin with no rows of its own has nowhere else to be found, so it is asked either way.":
    "Let Android extensions, which stand up rows of their own, be asked from Home, Discover, Catalogs, search and the Play button too. A plugin with no rows of its own has nowhere else to be found, so it is asked either way.",
  "Let auto-download and the next-episode prefetch ask plugins too. Off keeps plugins out of background work.":
    "Let auto-download and the next-episode prefetch ask plugins too. Off keeps plugins out of background work.",
  "Show languages on plugin posters": "Show languages on plugin posters",
  "Some plugins name a listing after everything it carries, so its languages are in the title. Harbor reads them back out and badges the poster. Shown only when the plugin provides it.":
    "Some plugins name a listing after everything it carries, so its languages are in the title. Harbor reads them back out and badges the poster. Shown only when the plugin provides it.",
  "Show quality on plugin posters": "Show quality on plugin posters",
  "Badge the resolutions a plugin's listing names, best first, and count the rest. Shown only when the plugin provides it.":
    "Badge the resolutions a plugin's listing names, best first, and count the rest. Shown only when the plugin provides it.",
  "Refresh all": "Refresh all",
  "Runs every plugin Harbor stood down. One that answers comes back; the others stay paused.":
    "Runs every plugin Harbor stood down. One that answers comes back; the others stay paused.",
  Android: "Android",
  "Paste the manifest link of a repository you trust. Harbor reads its own plugin repositories, provider-script repositories and Android extension repositories as they are, and installs nothing until you choose to.":
    "Paste the manifest link of a repository you trust. Harbor reads its own plugin repositories, provider-script repositories and Android extension repositories as they are, and installs nothing until you choose to.",
  "Reopen playing broadcasts after changing this setting.":
    "Reopen playing broadcasts after changing this setting.",
  "{n} entries": "{n} entries",
  "Poster thumbnails": "Poster thumbnails",
  "Resized cover cache, kept 30 days up to size limits. Rebuilds as you browse.":
    "Resized cover cache, kept 30 days up to size limits. Rebuilds as you browse.",
  "{size} across {n} files": "{size} across {n} files",
  Halloween: "Halloween",
  "Use the album art as the app icon while music plays":
    "Use the album art as the app icon while music plays",
  "The taskbar button becomes the cover of the track you are listening to, and goes back to your Harbor icon when music stops. The thumbnail preview always shows the cover either way.":
    "The taskbar button becomes the cover of the track you are listening to, and goes back to your Harbor icon when music stops. The thumbnail preview always shows the cover either way.",
  "Prize pool": "Prize pool",
  "Match list only; bracket structure is not available for this title.":
    "Match list only; bracket structure is not available for this title.",
  "Race time": "Race time",
  "Average speed (mph)": "Average speed (mph)",
  Leader: "Leader",
  "Full score": "Full score",
  "Search audio language": "Search audio language",
  "No audio track in that language.": "No audio track in that language.",
  "games.pokemon.openSave": "Open game save",
  "games.pokemon.importPokemon": "Import Pokémon file",
  "games.pokemon.exportPokemon": "Export Pokémon",
  "games.pokemon.engineMissing": "The Pokémon engine is not installed in this Harbor build yet.",
  "games.pokemon.bankError": "That action could not be completed.",
  "games.pokemon.error.generic":
    "The action failed. Your selected game save has not been overwritten.",
  "games.pokemon.bankUnreadable":
    "Some Pokémon could not be loaded ({count}). Their files are still on this device.",
  "games.pokemon.bankTruncated":
    "Showing the first 10,000 bank files. All files remain on this device.",
  "games.pokemon.showBankFolder": "Show bank folder",
  "games.pokemon.bankBrowse": "Browse your Pokémon",
  "games.pokemon.gameSave": "Game save",
  "games.pokemon.myBank": "My bank",
  "games.pokemon.readOnly": "This save is open for viewing only.",
  "games.pokemon.box": "Choose a box",
  "games.pokemon.party": "Party",
  "games.pokemon.slot": "Slot {slot}",
  "games.pokemon.emptySlot": "Empty slot {slot}",
  "games.pokemon.level": "Lv. {level}",
  "games.pokemon.created": "Created a Pokémon",
  "games.pokemon.deposit": "Save a copy to bank",
  "games.pokemon.error.pokemon_hack_export":
    "Bank export for this ROM hack is not ready: its extra Pokémon data cannot yet be preserved. You can still inspect and edit this save.",
  "games.pokemon.edited": "Edited {name}",
  "games.pokemon.released": "Remove {name} from the save",
  "games.pokemon.release": "Stage removal from save",
  "games.pokemon.chooseSlot":
    "Choose a Pokémon to inspect or edit. Choose an empty slot to create one.",
  "games.pokemon.allBoxes": "All boxes",
  "games.pokemon.boxNumber": "Box {number}",
  "games.pokemon.moveToBox": "Move to box",
  "games.pokemon.searchBank": "Search your bank",
  "games.pokemon.bankCopies":
    "Bank deposits keep the original in your save. Transfers keep the bank copy, too.",
  "games.pokemon.loadMore": "Show more",
  "games.pokemon.emptyBank":
    "Your bank is empty. Save a Pokémon from an open game or import a Pokémon file.",
  "games.pokemon.removeFromBank": "Remove from bank",
  "games.pokemon.transferHint":
    "Choose an empty destination slot in your game save, then preview this Pokémon’s transfer.",
  "games.pokemon.imported": "Imported a Pokémon from the bank",
  "games.pokemon.previewTransfer": "Preview transfer to save",
  "games.pokemon.undoRemove": "Undo bank removal",
  "games.pokemon.backupHistory": "Save backups",
  "games.pokemon.restoreChange": "Restore the previous save from its backup",
  "games.pokemon.review": "Review your changes",
  "games.pokemon.reviewNote":
    "These changes are staged. Keep the game closed. Saving creates a backup of the original first.",
  "games.pokemon.conversion": "Transfer details",
  "games.pokemon.discard": "Discard changes",
  "games.pokemon.commit": "Back up & save",
  "games.pokemon.savedBackup": "Saved. Your original is backed up.",
  "games.pokemon.restore": "Preview restore",
  "games.pokemon.draftKept":
    "Staged changes stay on this device. Reopen the same save to continue your draft.",
  "games.pokemon.engineSources": "Source & licenses",
  "games.pokemon.localEngine": "Local save engine · GPL-3.0-or-later",
  "games.pokemon.create": "Create a Pokémon",
  "games.pokemon.searchPokemon": "Find a Pokémon or number",
  "games.pokemon.levelLabel": "Level",
  "games.pokemon.shiny": "Shiny",
  "games.pokemon.createNote":
    "Choose a Pokémon and level. The engine finds a matching encounter for this game; unsupported combinations are refused. You can also paste a Showdown set below.",
  "games.pokemon.previewCreate": "Preview Pokémon",
  "games.pokemon.showdown": "Pokémon Showdown set",
  "games.pokemon.nickname": "Nickname",
  "games.pokemon.move": "Move {number}",
  "games.pokemon.training": "Individual values & effort values",
  "games.pokemon.previewEdits": "Preview edits",
  "games.pokemon.movePokemon": "Move within this save",
  "games.pokemon.destinationSlot": "Choose destination slot",
  "games.pokemon.swapHint":
    "An occupied destination swaps the two Pokémon. Review the move before saving.",
  "games.pokemon.previewMove": "Preview move",
  "games.pokemon.noChoices": "No matching choices.",
  "games.pokemon.browse": "Explore this Pokémon game",
  "games.pokemon.sources":
    "Pokémon data: PokeAPI · Walkthroughs: Bulbapedia · Maps: Bulbagarden Archives · Videos: YouTube. Source coverage varies by game.",
  "games.pokemon.maps": "Maps",
  "games.pokemon.levelRange": "Lv. {min}–{max}",
  "games.pokemon.noEncounters":
    "No encounters are recorded for this exact edition. Gifts, trades and special events may be missing.",
  "games.pokemon.backDex": "Back to Pokémon",
  "games.pokemon.pokemonDetails": "Pokémon details",
  "games.pokemon.evolutionScope":
    "The full evolution family from current Pokémon data. Later evolutions and methods may not exist in this game.",
  "games.pokemon.currentStats":
    "Current species stats and abilities from PokeAPI. Older editions can differ. The type labels above use this game’s generation.",
  "games.pokemon.dex": "Pokédex",
  "games.pokemon.dexScope":
    "This game’s regional Pokédex. Numbers on cards are National Pokédex numbers.",
  "games.pokemon.mapScope":
    "Original game maps from Bulbagarden Archives. Shared archives label each game variant in the image title.",
  "games.pokemon.searchMaps": "Search loaded maps",
  "games.pokemon.moreMaps": "Load more maps",
  "games.pokemon.editionMoves":
    "Learnsets for this game edition, including level-up, machines and tutors.",
  "games.pokemon.noMoves": "No move learnset is available for this edition.",
  "games.pokemon.detectedSaves": "Saves for this game",
  "games.pokemon.refreshSaves": "Refresh saves",
  "games.pokemon.discoverFailed":
    "Could not check for saves. Try refreshing or choose a save file.",
  "games.pokemon.noDetectedSaves":
    "No save found yet. Save inside the game first, or choose a save file from your emulator.",
  "games.pokemon.unavailable": "This source is unavailable right now. Try again.",
  "games.pokemon.walkthrough": "Walkthrough",
  "games.pokemon.encounters": "Encounters",
  "games.pokemon.locationScope":
    "Browse locations in this region. Encounters are filtered to this exact game edition.",
  "games.pokemon.searchLocation": "Find a route or location",
  "games.pokemon.noLocations": "Location data is not available for this game yet.",
  "games.pokemon.videos": "Videos",
  "games.pokemon.searchVideos": "Search walkthroughs and tips",
  "Is a new build giving you trouble? Pick an earlier one below and run its installer over your current copy. Your library, settings, and downloads all stay put.":
    "Is a new build giving you trouble? Pick an earlier one below and run its installer over your current copy. Your library, settings, and downloads all stay put.",
  "Harbor offers the newest build again on its next check. Dismiss that update to stay on the earlier one.":
    "Harbor offers the newest build again on its next check. Dismiss that update to stay on the earlier one.",
  "Thanks! Submit the GitHub issue that opened to send your rating.":
    "Thanks! Submit the GitHub issue that opened to send your rating.",
  "Open the issue again": "Open the issue again",
  "Send rating on GitHub": "Send rating on GitHub",
  "Report on GitHub": "Report on GitHub",
  "Submit the GitHub issue that opened to send the report.":
    "Submit the GitHub issue that opened to send the report.",
  "Opens a prefilled GitHub issue with the context above. No keys or library data.":
    "Opens a prefilled GitHub issue with the context above. No keys or library data.",
  "Pick screenshots, a recording, or a player log here, then drag them into the GitHub issue that opens.":
    "Pick screenshots, a recording, or a player log here, then drag them into the GitHub issue that opens.",
  "Shown publicly on the GitHub issue. Leave it empty if you would rather not.":
    "Shown publicly on the GitHub issue. Leave it empty if you would rather not.",
  "Your report is ready on GitHub": "Your report is ready on GitHub",
  "Check it in the browser tab that opened, drag in any attachments, then press Submit new issue to send it.":
    "Check it in the browser tab that opened, drag in any attachments, then press Submit new issue to send it.",
  "and create a new API app. Trakt asks you to link a verified GitHub account first.":
    "and create a new API app. Trakt asks you to link a verified GitHub account first.",
  "Give it any name, and enter this Redirect URI:":
    "Give it any name, and enter this Redirect URI:",
  "Save the app, then copy its Client ID below. The Client Secret is optional.":
    "Save the app, then copy its Client ID below. The Client Secret is optional.",
  "Add your Trakt Client ID to connect. Without it Harbor cannot sign in to Trakt.":
    "Add your Trakt Client ID to connect. Without it Harbor cannot sign in to Trakt.",
  "Trakt Client ID": "Trakt Client ID",
  "Client ID of your Trakt app": "Client ID of your Trakt app",
  "Used for sign-in and every Trakt request made on your behalf.":
    "Used for sign-in and every Trakt request made on your behalf.",
  "Trakt Client Secret (optional)": "Trakt Client Secret (optional)",
  "Client Secret of your Trakt app": "Client Secret of your Trakt app",
  "Trakt does not need it for device sign-in. Fill it in only if Trakt rejects the sign-in without it.":
    "Trakt does not need it for device sign-in. Fill it in only if Trakt rejects the sign-in without it.",
  "and click Create ID.": "and click Create ID.",
  'Set App Type to "other", so MyAnimeList does not issue a client secret.':
    'Set App Type to "other", so MyAnimeList does not issue a client secret.',
  "Enter this App Redirect URL:": "Enter this App Redirect URL:",
  "Fill in the remaining required fields, submit, then copy the Client ID below.":
    "Fill in the remaining required fields, submit, then copy the Client ID below.",
  "Add your MAL Client ID to connect. Without it Harbor cannot sign in to MyAnimeList.":
    "Add your MAL Client ID to connect. Without it Harbor cannot sign in to MyAnimeList.",
  "Client ID of your MyAnimeList app": "Client ID of your MyAnimeList app",
  "After you approve Harbor, MyAnimeList sends your browser to that address and Harbor catches it. If that page does not load, copy its full address from the address bar and paste it into Harbor.":
    "After you approve Harbor, MyAnimeList sends your browser to that address and Harbor catches it. If that page does not load, copy its full address from the address bar and paste it into Harbor.",
  "Your Trakt app": "Your Trakt app",
  "Harbor signs in to Trakt with its own app, so you only need to connect. To use an API app of your own instead, follow these steps.":
    "Harbor signs in to Trakt with its own app, so you only need to connect. To use an API app of your own instead, follow these steps.",
  "Your MyAnimeList app": "Your MyAnimeList app",
  "Harbor signs in to MyAnimeList with its own client, so you only need to connect. To use an API client of your own instead, follow these steps.":
    "Harbor signs in to MyAnimeList with its own client, so you only need to connect. To use an API client of your own instead, follow these steps.",
  "Trakt app not set up": "Trakt app not set up",
  'Add the Client ID of your own Trakt API app under "Your Trakt app" in these settings, then try again.':
    'Add the Client ID of your own Trakt API app under "Your Trakt app" in these settings, then try again.',
  "A browser tab opened on MyAnimeList. Approve Harbor there and Harbor connects on its own. If the next page does not load, copy its full address from the address bar and paste it below.":
    "A browser tab opened on MyAnimeList. Approve Harbor there and Harbor connects on its own. If the next page does not load, copy its full address from the address bar and paste it below.",
  "MyAnimeList app not set up": "MyAnimeList app not set up",
  'Add the Client ID of your own MyAnimeList API client under "Your MyAnimeList app" in these settings, then try again.':
    'Add the Client ID of your own MyAnimeList API client under "Your MyAnimeList app" in these settings, then try again.',
  "A browser tab opened on AniList. Approve Harbor there, then copy the token it shows (or the page address) and paste it below.":
    "A browser tab opened on AniList. Approve Harbor there, then copy the token it shows (or the page address) and paste it below.",
  "Paste the token or page URL from AniList": "Paste the token or page URL from AniList",
  "IGDB · Twitch client ID": "IGDB · Twitch client ID",
  "IGDB · Twitch client secret": "IGDB · Twitch client secret",
  "Twitch client ID": "Twitch client ID",
  "Twitch client secret": "Twitch client secret",
  "Game catalogs, details and completion times come from IGDB, which signs in with a Twitch app. Register one for free at":
    "Game catalogs, details and completion times come from IGDB, which signs in with a Twitch app. Register one for free at",
  "Use any name, set the OAuth redirect URL to http://localhost, choose the Confidential client type, then copy the client ID and a new secret here.":
    "Use any name, set the OAuth redirect URL to http://localhost, choose the Confidential client type, then copy the client ID and a new secret here.",
  "Harbor exchanges the ID and secret for a Twitch app token and keeps it until it expires. Without both, the Games catalog stays empty.":
    "Harbor exchanges the ID and secret for a Twitch app token and keeps it until it expires. Without both, the Games catalog stays empty.",
  "Add a Twitch client ID and secret in Settings > Library > Games to load the IGDB catalog.":
    "Add a Twitch client ID and secret in Settings > Library > Games to load the IGDB catalog.",
  "Submit a theme": "Submit a theme",
  "Themes are added to the library by pull request. Export yours as a .harborstyle file and follow the guide to submit it.":
    "Themes are added to the library by pull request. Export yours as a .harborstyle file and follow the guide to submit it.",
  "Every theme is reviewed before it joins the library and scanned again when you install it, so you can try any look without a second thought.":
    "Every theme is reviewed before it joins the library and scanned again when you install it, so you can try any look without a second thought.",
  "Made a look you love? Export it as a .harborstyle file and open a pull request to add it to the library.":
    "Made a look you love? Export it as a .harborstyle file and open a pull request to add it to the library.",
  "Harbor accounts are no longer available, so these settings stay on this computer and don't reach your TV.":
    "Harbor accounts are no longer available, so these settings stay on this computer and don't reach your TV.",
  "Find the Harbors on your network and choose how Big Picture looks and plays on your TV.":
    "Find the Harbors on your network and choose how Big Picture looks and plays on your TV.",
  "If you were going to send something, send it to Stremio above, or to one of the charities below. They all do more good with it.":
    "If you were going to send something, send it to Stremio above, or to one of the charities below. They all do more good with it.",
  "Paste this into the join box in Watch Together to set the relay URL and room code in one go.":
    "Paste this into the join box in Watch Together to set the relay URL and room code in one go.",
  "Once you're in a room you can copy an invite that sets the relay URL and the room code in one go.":
    "Once you're in a room you can copy an invite that sets the relay URL and the room code in one go.",
  "Share the track, artist and album art while music plays.":
    "Share the track, artist and album art while music plays.",
  "Your avatar and name in Harbor.": "Your avatar and name in Harbor.",
  "Stremio library": "Stremio library",
  "Progress from your Stremio account and this device. The primary source for almost everyone.":
    "Progress from your Stremio account and this device. The primary source for almost everyone.",
  "For Application URL anything works, for example https://github.com. TMDB never visits it.":
    "For Application URL anything works, for example https://github.com. TMDB never visits it.",
  "These settings stay on this computer.": "These settings stay on this computer.",
  "Changes not synced yet": "Changes not synced yet",
  "Stop GIF recording": "Stop GIF recording",
  "Hide stats": "Hide stats",
  "Show stats": "Show stats",
  "Looping {a} – {b}": "Looping {a} – {b}",
  "Start set at {a}": "Start set at {a}",
  "A-B loop": "A-B loop",
  "Change seek steps": "Change seek steps",
  Shorter: "Shorter",
  Longer: "Longer",
  "{n}s": "{n}s",
  "Seek step": "Seek step",
  "Short seek": "Short seek",
  "Drop here to hide": "Drop here to hide",
  "Show {label}, or drag it onto the player": "Show {label}, or drag it onto the player",
  "Edit player layout": "Edit player layout",
  "Cycle audio tracks": "Cycle audio tracks",
  "Cycle audio tracks backward": "Cycle audio tracks backward",
  "Download video": "Download video",
  Cast: "Cast",
  "Cast to a device": "Cast to a device",
  Started: "Started",
  "Jump through video 0-9": "Jump through video 0-9",
  "Switch to the next audio track.": "Switch to the next audio track.",
  "Switch to the previous audio track.": "Switch to the previous audio track.",
  "Start downloading the video you are watching, or cancel a download in progress.":
    "Start downloading the video you are watching, or cancel a download in progress.",
  "Open the list of devices to cast to.": "Open the list of devices to cast to.",
  "Open the layout editor over the video, without leaving playback.":
    "Open the layout editor over the video, without leaving playback.",
  "Jump to {time}": "Jump to {time}",
  "Right-click or hold for more options": "Right-click or hold for more options",
  "{word} {n} seconds. Right-click or hold for more options":
    "{word} {n} seconds. Right-click or hold for more options",
  "Previous channel (Live TV)": "Previous channel (Live TV)",
  "Long seek": "Long seek",
  "Long seek back": "Long seek back",
  "Long seek forward": "Long seek forward",
  "Jump back by the Long seek step set under Behavior.":
    "Jump back by the Long seek step set under Behavior.",
  "Jump forward by the Long seek step set under Behavior.":
    "Jump forward by the Long seek step set under Behavior.",
  "A longer jump for skipping ahead or back quickly. Its keys are set under Keys.":
    "A longer jump for skipping ahead or back quickly. Its keys are set under Keys.",
  "Drop here": "Drop here",
  "Click any control to edit it, or drag it to a new spot.":
    "Click any control to edit it, or drag it to a new spot.",
  "Sync AniList progress": "Sync AniList progress",
  "Sync MyAnimeList progress": "Sync MyAnimeList progress",
  "Offset indicator position": "Offset indicator position",
  "Offset indicator size": "Offset indicator size",
  "Sync indicator position": "Sync indicator position",
  "Subtitle size": "Subtitle size",
  "Poster size": "Poster size",
  "Save the last": "Save the last",
  "Save the last {n} seconds": "Save the last {n} seconds",
  "Clip length": "Clip length",
  Screenshots: "Screenshots",
  GIFs: "GIFs",
  "Video clips": "Video clips",
  "Player captures": "Player captures",
  "Pictures/Harbor": "Pictures/Harbor",
  "Choose where videos, eBooks and player captures are saved, and how their folders are organized.":
    "Choose where videos, eBooks and player captures are saved, and how their folders are organized.",
  "Save the current frame (video only, no subtitles) as a PNG to the Screenshots folder.":
    "Save the current frame (video only, no subtitles) as a PNG to the Screenshots folder.",
  "Start or stop recording a GIF of the video (no subtitles). Saves to the GIFs folder.":
    "Start or stop recording a GIF of the video (no subtitles). Saves to the GIFs folder.",
  "Save the last seconds of video, set by Clip length, as a clip with audio, choosing subtitles on or off. Saves to the Video clips folder.":
    "Save the last seconds of video, set by Clip length, as a clip with audio, choosing subtitles on or off. Saves to the Video clips folder.",
  "How many seconds Save video clip keeps, counting back from where you are.":
    "How many seconds Save video clip keeps, counting back from where you are.",
};

export default uiFallback;
