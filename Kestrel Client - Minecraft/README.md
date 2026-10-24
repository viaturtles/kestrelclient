# Kestrel desktop launcher

Design source: Figma page **"Kestrel / Design v3"** (file x1KkvVGJqYrj7BdTfXGqRS). Motion reference: `design/motion-lab/index.html`.

## Run

```powershell
npm.cmd ci
npm.cmd run tauri dev
```

Browser-only preview: `npm.cmd run dev` (desktop features show "Available in the Kestrel desktop app"). Live backend checks: `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` (needs internet).

## What works (October 21, 2026)

- **Loading screen** (Figma 53:559): the line under the bar names each real startup step: settings, Java search, Mojang version list, installation check, artwork.
- **Design v3 UI**: Home, Installations (Overview / Content / Screenshots / Settings), Explore and project pages, Servers, Settings (7 sections), What's new, Kestrel menu, account menu, Downloads popover, New installation dialog. Section sweep, quick in-page transitions, springs, Reduce motion and sweep toggles. Interface sounds only for Launch, finished downloads and errors (synthesized, no audio files).
- **Modrinth**: live search, project pages, versions, per-installation compatibility, verified installs (sha512/sha1) into the installation's `resourcepacks` / `shaderpacks` / `mods` folder.
- **Mojang**: version list, real 1.8.9 install (client, libraries, natives, 700+ assets) with checksum checks, shared across installations.
- **Java**: detects Java in JAVA_HOME, PATH, Program Files, Minecraft/Lunar runtimes and `.jdks`; downloads Mojang's Java 8 runtime (`jre-legacy`).
- **Servers**: real Server List Ping (players, ping, version, MOTD, icon).
- **Launch Control**: second window opened by Launch (fixed size, no maximize). Shows each step (Java, game files, mode, account, start), a live console with filters, Stop and folder buttons, a live memory/CPU graph, a plain-English explanation when Minecraft crashes, and a History menu with the last 30 launches (`logs\launches`).
- **Bring your setup over**: Installations → Overview → Import copies options.txt (keybinds), servers.dat (also added to the Servers page) and chosen resource/shader packs from `.minecraft`. `.minecraft` is never changed.
- **OptiFine**: Installations → Overview → OptiFine. Pick the installer you downloaded from optifine.net; Kestrel makes sure vanilla 1.8.9 is in `.minecraft`, opens OptiFine's own installer, then imports the version it created (`Use this`). Launches then use OptiFine's launchwrapper.
- **Smarter content**: files are matched to Modrinth by hash for real names, icons and versions, with Update / Update all. Drag `.jar`/`.zip` files onto the window to add them (sorted into mods, resource packs or shaders automatically).
- **Worlds tab**: world icons, names, game mode, last played, size; Back up zips a world into `%APPDATA%\Kestrel\backups\<installation>`.
- **Share**: Export writes one `.kestrel` file (settings + Modrinth file list with hashes). Import (the file button next to + in Installations) recreates it and downloads each file with hash checks. Non-Modrinth files are listed as not included.
- **Folders**: everything lives in `%APPDATA%\Kestrel` (instances, versions, libraries, assets, runtime, logs, backups). Tokens are never logged.

- **Accounts**: Microsoft sign-in (browser, auth code + PKCE on a loopback port → Xbox Live → XSTS → Minecraft services), saved encrypted with Windows DPAPI in `account.dat` and refreshed automatically. Without sign-in, Launch starts Minecraft **offline** with the name from Settings → Account (singleplayer only).
- **Discord Rich Presence**: "In the Kestrel launcher" (with the page) while browsing, "Playing Minecraft 1.8.9" in game with menus / singleplayer / server (read from the game log). Needs Discord open on the PC.
- **Sign in with Discord**: links a player's Discord (OAuth2 public client + PKCE, scope `identify`, redirect `http://127.0.0.1:53134/discord`), saved encrypted in `discord.dat`. Meant for free perks like capes later.
- **IDs**: the Azure client ID and Discord Application ID are built in via `src-tauri/src/config.rs`. Players never see them. Discord art to upload is in `discord-assets/` (asset names `kestrel` and `minecraft`).

## Installer

`npm.cmd run tauri build` produces `src-tauri\target\release\bundle\nsis\Kestrel_<version>_x64-setup.exe` (per-user install, no admin needed).

### Releases and auto-update

Kestrel checks `releases/latest/download/latest.json` on GitHub a few seconds after it starts and offers "Update to x.y.z" in the title bar. Updates must be signed with the private key in `%USERPROFILE%\.tauri\kestrel.key` (never commit it; keep a backup, since losing it means existing installs can't receive updates).

1. Bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, and write what's new in `RELEASE_NOTES.md` (shown in Kestrel's update prompt and on the release page).
2. Commit, then push a tag `v<version>` (GitHub Desktop: History → right-click → Create Tag).
3. The Release workflow builds and signs the installer (GitHub secret `TAURI_SIGNING_PRIVATE_KEY` = contents of the key file), uploads it with `latest.json`, and leaves a draft release. Edit it, set the release label to **Latest**, and save. Kestrel only sees the release marked Latest.

Local signed builds: set `TAURI_SIGNING_PRIVATE_KEY` to the key file's contents and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to empty before `npm.cmd run tauri build`.

### Kestrel Core (in-game mod)

`src-tauri/core/kestrel-core.jar` is added to every 1.8.9 launch with `-javaagent`, with or without OptiFine. Everything is sized from Minecraft's GUI scale (plus the Menu size setting). It replaces the title screen's buttons (the vanilla panorama stays, with a 3D skin preview you can drag to turn), opens the Kestrel panel with Right Shift (Mods, mod settings with a live preview, Settings), and draws the HUD mods (FPS, CPS, Coordinates, Clock). Settings are saved per installation in `<game folder>\kestrel\settings.properties`. If any part fails it switches itself off and the game carries on with vanilla.

Mods (`Mod.ALL`): HUD mods in `Mod.java` (FPS, CPS, Coordinates, Clock, Ping, TPS), gameplay mods in `Tools.java` (Zoom, Fullbright, Crosshair, Block outline, Damage effects, Toggle sprint, Better chat, Screenshots, Pause shortcuts, Friend alerts, Keybinds per server, Auto GG, Auto requeue, Triangulation) and `TabList.java`. Settings can be switches, sliders, choices or keys. Notices in the top-right come from `Toasts`. Chat commands: `/kestrel reset` (Triangulation), `/kestrel copyshot <file>` (used by the screenshot Copy button).

How it works: `Patcher` adds three calls into the game as it loads (GuiMainMenu draw/click, GuiIngame overlay). `KestrelBridge` and `KestrelScreen` are written against 1.8.9's obfuscated names (MCP names in comments) and loaded by `GameLoader`, because Minecraft's jar is signed. Drawing is plain OpenGL with Inter (OFL) and Lucide icons (ISC).

Performance (Settings > Performance, both on by default, both skip themselves where OptiFine replaces the same code):
- **Fewer GPU waits** (`Mat`): a CPU copy of the GL matrices, kept in step with GlStateManager, answers vanilla's per-frame matrix readbacks; GL error checks are off. A real readback every few seconds checks the copy and turns it off on any mismatch.
- **Faster clouds** (`KestrelClouds`): fancy clouds are built once into display lists and only moved each frame.
- **Hide hidden mobs and blocks** (`KestrelCull`): entities and block entities completely behind solid blocks aren't drawn (rays from the camera to points on their box). Players and anything with a custom name are never culled (their name tags show through walls in vanilla); things coming back into view are checked every frame.
- New installations start with `useVbo:true` in options.txt (vanilla's own Video Setting, ~4%).
Measured with the bench (`-Dkestrel.bench=<file.json>`, `-Dkestrel.bench.scene=lobby|town`, `-Dkestrel.perf=none|all|names`, `-Dkestrel.profile=<file.txt>`, `-Dkestrel.bench.ab=culling` for a same-run picture A/B) on an RTX 3060 / Ryzen 7 5700G: lobby ~317 → ~588 FPS, town (walls) ~319 → ~646 FPS, 1% lows 126 → 179; pictures match vanilla. Tried and dropped (no gain): streaming vertex buffer, cached chunk search, batched text.

OptiFine can't be bundled or downloaded by Kestrel (OptiFine's terms). `optifine_auto` opens the official download page, finds the jar in Downloads, and runs OptiFine's own `optifine.Installer.doInstall` headless (`kestrel.core.OptiFineSetup`) into a private folder, then imports it.

Rebuild after changing `core/src`: `powershell -ExecutionPolicy Bypass -File src-tauri\core\build.ps1` (needs a JDK and Minecraft 1.8.9 installed once by Kestrel). Icons: `node src-tauri\core\icons.cjs` (needs sharp). Self-test: start the game with `-Dkestrel.test=<folder>` (and optionally `-Dkestrel.test.world=<save>`); it saves a screenshot of each screen into the folder and quits.

### Quick play agent

`src-tauri/agent/kestrel-agent.jar` (source in `agent/src`) opens a singleplayer world on start, since 1.8.9 has no launch option for it. Rebuild with JDK 8+: `javac --release 8`, then `jar cfm kestrel-agent.jar MANIFEST.MF -C out .`.

## Not yet

- **Online play** needs an Azure client ID plus Mojang's approval (aka.ms/mce-reviewappid). Until approved, sign-in stops with "Waiting for Mojang to approve Kestrel".
- Startup with Windows, CurseForge (needs an approved API key), Fabric/Forge installations, code signing (Windows SmartScreen will warn on the unsigned installer).

Previous code is backed up in `reference/src-backup-2026-10-21` and `reference/src-backup-2026-10-21b`.
