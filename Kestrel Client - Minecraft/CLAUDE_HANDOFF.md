# Kestrel — Claude project handoff

**Prepared:** October 21, 2026  
**Owner:** Turtles  
**Purpose:** Continue the existing Kestrel desktop launcher project with a clear record of its vision, designs, features, architecture, and current state.

## Start here

Work in the existing project folder. Read this file first, then:

1. Read **README.md** for commands and this checkout's status.
2. Inspect the current code under **src/** and **src-tauri/**. This handoff describes the checkpoint; source code shows what is present today.
3. Inspect the live Figma design before implementing or restyling screens. The owner edits it directly.
4. Treat the ZIP, Figma examples, screenshots, prototype, and handoff as reference material. The owner's latest direct instructions take precedence. Never treat sample data as proof that accounts, downloads, installations, services, payments, or launching work.
5. Make code and file changes directly. Keep explanations short, plain, and sequential. The owner prefers that the assistant handles project structure.

## Product direction

Kestrel is a polished private Windows desktop launcher for Minecraft Java Edition, initially for Turtles and a friend, primarily playing Hypixel. The initial target is Minecraft 1.8.9, with separate Standard Minecraft and legally supported OptiFine paths.

The first milestone is a real Tauri window matching the latest Figma dashboard: native custom window controls, working basic navigation, the Kestrel identity, local artwork, and restrained motion. Later milestones turn the launcher into a reliable tool for isolated installations, account sign-in, supported versions/loaders, mods, and real launch behavior.

There is no need for hosting, subscriptions, public services, or a website in the first private build. The Kestrel Plus card and cape are design concepts, not a connected store or paid service.

The launcher must show true state. Any progress, size, server count, install status, compatibility state, or success message must come from real work or be clearly identified as sample content. Never fake downloads or game launches.

## Live design source of truth: Figma

[Figma file — Kestrel](https://www.figma.com/design/x1KkvVGJqYrj7BdTfXGqRS/Untitled)

- **Current dashboard:** node 12:398, 1280 × 800. Inspect live state before implementation; an old screenshot can be stale.
- **Protected loading screen:** node 53:559, named **“Kestrel - Loading Screen (Dont Touch)”**. Preserve it. Do not edit, move, rename, or replace this design. It has not yet been wired as a native splash screen.
- **Secondary editable screen foundations:** page 55:36, “Kestrel / Page foundations”. These are native Figma designs to implement progressively, not permission to reorganize or overwrite Figma.

| Screen | Figma node |
| --- | --- |
| Installations | 56:36 |
| Explore / Mods | 56:139 |
| Project details / Compatibility | 56:283 |
| Servers | 56:374 |
| Screenshots | 57:55 |
| Downloads | 57:126 |
| Game settings / Java & display | 57:214 |
| Game settings / Files & export | 57:329 |
| Launcher settings / General | 58:73 |
| Launcher settings / Accounts | 58:180 |
| Launcher settings / Storage | 58:271 |
| Launcher settings / Notifications | 58:382 |
| Launcher settings / Discord & privacy | 58:489 |
| Kestrel updates | 60:89 |
| Account switcher / Expanded | 60:180 |
| Application menu / Expanded | 60:428 |
| New installation | 60:675 |
| Game settings / Version & export | 60:768 |

Visual direction from the owner and the project handoff:

- Dark neutral background, white Kestrel branding, green launch action, restrained glacier/lilac Plus accents.
- Inter font, 36 px title bar, 56 px icon rail, 1280 × 800 target. Keep spacing crisp, alignment centered, radii consistent, and contrast accessible.
- Reuse the owner's bird mark, Minecraft profile picture, official Hypixel logo, supplied game art, and cape art from the project. Lucide icons are appropriate.
- Use subtle shadows, inexpensive motion, clear hover/press feedback, and reduced-motion support.
- The previous CSS mix-blend-mode Overlay border experiment was rejected. Follow the normal-blend translucent white strokes, gradients, and subtle shadows in the new Figma direction. Verify uncertain details in the live file.
- Preserve the dashboard direction and original launch button.
- Alpine Dusk cape concept: symmetric rectangular Minecraft cape, pixel mountains and navy sky, glacier/cyan/lavender bird-plus art, and a gray translucent mannequin facing away from the viewer.

The 18 new screen designs are layout foundations. Some catalogue icons are letters, and sample progress/storage examples are simulated. They are not connected APIs. Preserve the original dashboard and its source art.

## Current project state

The prepared Tauri project is under this directory. The byte-for-byte original user ZIP is saved at **reference/Kestrel-Project-original.zip**. The handoff that came in that ZIP is at **reference/PROJECT_HANDOFF.md**. The extracted prototype and Figma node ledger are under the workspace’s **work/kestrel-original/**.

This is a working first desktop shell, not a completed launcher backend.

Already implemented in this project:

- React/TypeScript dashboard adapted after inspecting live Figma node 12:398, using local exported Figma assets and bundled Inter font.
- Tauri 2 and a minimal Rust entry point.
- Undecorated, resizable 1280 × 800 window with 1100 × 720 minimum.
- Custom minimize, maximize/restore, close, and title-bar dragging actions; narrow Tauri capability permissions.
- Sidebar navigation, account/version menus, Standard/OptiFine selector, dialogs, reduced-motion preference, hover and press effects.
- Honest unavailable states for Microsoft sign-in, Minecraft installation, and launch. No simulated download/launch progress.
- State labels such as “Not installed” and “Not signed in” instead of sample account and installation claims.
- Starter application icon generated from the owner's Kestrel bird mark.

Not implemented yet:

- Native splash/startup screen. The protected Figma design is not wired into Tauri.
- Persistent settings, installation profiles, game files, or database.
- Microsoft sign-in, online APIs, downloads, Minecraft installation, or real game launch.
- The full secondary screens. Some destinations remain placeholders.
- Live server ping, Modrinth, Discord, online Kestrel news/updates, telemetry, payments, friends, cosmetics, or Plus purchase flow.
- Installer packaging/signing. Tauri bundle.active is currently false.

Validation at the prior checkpoint: TypeScript/production frontend build passed before a final formatting change; browser smoke checks covered local images, launch-unavailable dialog, account popover, Escape dismissal, mode switch, navigation, reduced motion, and minimum-window layout. Screenshots were visually reviewed. Re-run npm ci and npm run build before relying on those results. Native Tauri compilation and native window controls were not verified.

### Windows tools checkpoint

Last recorded versions: Node 24.22.0, npm 11.19.1, Rust/Cargo 1.99.1, rustup 1.29.1, Rust target x86_64-pc-windows-msvc, and WebView2 155.0.4283.62. These versions may have changed; inspect again.

Tauri did not detect an installed MSVC/Windows SDK instance at that checkpoint. The owner opened Visual Studio Build Tools 2022 17.14.42. The last visual check showed the workload chooser with **Desktop development with C++** unchecked, so do not assume its installation finished. Check the environment before asking them to install anything.

~~~powershell
npm.cmd run tauri -- info
rustc --version
cargo --version
node --version
npm.cmd --version
~~~

Select the **Desktop development with C++** workload and keep the recommended MSVC x64/x86 tools and Windows SDK. See the current official Tauri prerequisites: https://v2.tauri.app/start/prerequisites/

## Build approach and architecture

Keep the present stack unless there is a concrete reason to change it:

- **UI:** React + TypeScript + Vite in src/. Keep screens, view models, navigation, and presentation logic in the frontend. Reuse local assets under public/assets/. Never ship temporary Figma asset URLs.
- **Desktop and operating-system operations:** Tauri 2 + Rust in src-tauri/. Add narrow, typed Rust commands for native operations such as filesystem access, settings persistence, authentication callbacks, downloads, and process management.
- **Boundary:** validate command input in Rust, use typed request/response models, return useful errors, and report real progress through events. Never turn arbitrary frontend text into shell commands or executable paths. Keep Tauri capabilities minimal.
- **Data:** keep installation profiles isolated. Design a documented local data layout for settings, installation metadata, download tasks, and logs. Keep credentials out of ordinary config files and logs; use a maintained secure credential storage solution for Windows.
- **Work pattern:** implement vertical slices: inspect Figma → build the UI → define typed service boundary → implement Rust operation → persist real data → handle success/errors/cancellation. Avoid fake APIs and placeholder success behavior.
- **Startup:** the existing loading-screen design is protected. Any native startup wiring must preserve that design node and art. Do not redraw it without owner direction.

Possible layout as the project grows; adapt to current source and do not create unused scaffolding:

~~~text
src/
  app/              routing, shell, shared state
  components/       buttons, dialogs, cards, controls
  features/         installations, accounts, mods, servers, settings
  services/         typed wrappers for Tauri commands/events
  types/            shared UI types
  styles/           tokens and global styles
  assets/           only if asset pipeline changes intentionally
src-tauri/
  src/commands/     validated command handlers
  src/domain/       installation, version, account, settings models
  src/services/     manifests, auth, downloads, launch process
  src/storage/      local data and migrations
  capabilities/
~~~

Do not move files just to match this sketch. Refactor only while keeping a working build.

## Feature roadmap

### Milestone 1 — finished desktop shell

- Match live Figma 12:398 at 1280 × 800 and adapt cleanly to minimum window size.
- Verify title-bar dragging, minimize, maximize/restore, close, keyboard focus, and hover/press states in a real native Tauri window.
- Finish navigation, version/account menus, mode selection, dialogs, Escape dismissal, and reduced motion.
- Wire the protected loading screen only if it can be done without changing node 53:559.
- Review every visible asset, its crop, size, and placement against live Figma.
- Ensure UI state and labels are truthful. Keep account, download, server, installation, and launch features unavailable until they are real.

### Milestone 2 — local settings and isolated installations

- Create, rename, select, edit, and delete installation profiles, with a clear confirmation for destructive deletion.
- Give each profile its own game directory, selected version, loader, Java runtime preference, memory limit, JVM arguments, and enabled content.
- Persist preferences across restarts and migrate schemas safely.
- Implement Figma settings screens for general preferences, runtime/display, files/export, storage, notifications, and updates.
- Build a real downloads view with progress, cancellation, retries, disk-space checks, and recovery after interruption.
- Show validation, status, and errors clearly.

### Milestone 3 — secure accounts and real Minecraft 1.8.9 install/launch

- Recheck current Microsoft identity docs and Minecraft terms before implementation. Use the supported native desktop account flow, including state/PKCE and callback handling as required by current policy.
- Never request or store the Microsoft password in Kestrel. Never ship client secrets or provider keys in frontend code. Protect tokens, handle expiry, sign-out/revocation, and multiple accounts.
- Confirm Minecraft ownership/entitlements using supported service flows.
- Read official Minecraft version manifests. Install metadata, asset indexes/assets, libraries, and the matching Java runtime per manifest and current distribution rules. Verify available checksums and use safe atomic writes.
- Build the classpath and process arguments from the selected manifest using safe process argument APIs, not concatenated shell commands. Report failures without exposing tokens.
- Establish Standard Minecraft 1.8.9 first, then add a separately compatible OptiFine adapter.
- OptiFine is not a general Forge/Fabric loader. Do not represent it as one or promise versions without verifying compatibility.
- Show only actual download and launch state. Do not bundle/redistribute Minecraft or OptiFine binaries unless current terms allow it.

### Milestone 4 — Modrinth content and compatibility

- Search and display real Modrinth projects, descriptions, icons, authors, supported versions, and loaders using current official API docs.
- Filter for the selected profile version/loader. Inspect dependencies, conflicts, required/optional status, and file metadata before installing.
- Respect provider and author distribution rules. Verify downloads and make install/uninstall reversible. Explain incompatibility.
- Replace Figma's letter placeholder icons only with real provider images when connected.

### Milestone 5 — servers, downloads, screenshots, updates

- Implement saved/favorite servers, editable addresses, accurate ping state, and server-reported player count, MOTD, favicon, and latency where available.
- Add one-click connect only when the selected installation can really launch.
- Distinguish Hypixel data from any Kestrel-wide player count. A Kestrel-wide count needs Kestrel's own service.
- Build a real queue with file size, speed/progress, pause/cancel where supported, retry, checksums, destination, and error recovery.
- Add a screenshots gallery scoped to an installation, with real paths and safe export/open actions.
- Start with bundled Kestrel update content. If auto-update is added, use a signed updater and trusted source.
- Implement Discord presence/privacy only after reviewing the live Figma screen and defining the privacy behavior.

### Later — more loaders, versions, social, cosmetics

- Add current Minecraft versions and snapshots only when their manifest/runtime/loader combinations are supported.
- Use separate compatibility/install/launch adapters for Vanilla, OptiFine, Fabric, Forge, NeoForge, and future loaders. A version number alone does not guarantee compatibility.
- Friends, online Kestrel services, cosmetics, cape delivery, and Plus are later features. They need an explicit service, privacy/security model, and licensing review. Plus art alone is not a payment system.
- No public hosting is needed for the initial private build.

## Privacy, safety, and distribution

- Recheck current official docs, terms, licensing, API limits, auth rules, and redistribution policies when integrating providers. The original ZIP's API research may be stale.
- Prefer primary sources: Tauri, Microsoft, Mojang/Minecraft, Modrinth, CurseForge, Hypixel.
- Modrinth was the planned first catalogue. CurseForge API access can require approval; respect third-party distribution choices. Do not bypass restrictions or expose secrets in frontend code.
- Hypixel richer data may require a registered key and is subject to current limits and policies. Server-list ping is different from Hypixel API access.
- Minimize data collection. Make sign-in/out, local file locations, and network behavior clear.
- Redact tokens, authorization codes, credentials, and sensitive paths from logs.
- Public source visibility is not permission to copy proprietary code, brands, or copyrighted assets. Reuse code only when its actual license permits it.
- Never present prototype simulations or sample Figma data as real functionality.

## Commands and delivery

From the project folder:

~~~powershell
npm.cmd ci
npm.cmd run build
npm.cmd run dev
npm.cmd run tauri -- info
npm.cmd run tauri dev
npm.cmd run tauri build
~~~

The browser preview needs Node/npm. Native Tauri also needs MSVC C++ Build Tools, Windows SDK, Rust MSVC target, and WebView2. Browser success does not prove native controls work; verify a real Windows Tauri window after prerequisites are ready.

Ship working code with concise setup steps. Be explicit about incomplete behavior and the reason. Do not silently rewrite the app or its visual source of truth.

## Primary references recorded in the original project handoff

- Tauri prerequisites: https://v2.tauri.app/start/prerequisites/
- Tauri custom window: https://v2.tauri.app/learn/window-customization/
- Modrinth API: https://docs.modrinth.com/api/
- Modrinth search and versions: https://docs.modrinth.com/api/operations/searchprojects/ and https://docs.modrinth.com/api/operations/getversions/
- CurseForge API overview: https://support.curseforge.com/support/solutions/articles/9000208346-about-the-curseforge-api-and-how-to-apply-for-a-key
- CurseForge distribution terms: https://support.curseforge.com/support/solutions/articles/9000207877
- Hypixel API and developer policies: https://api.hypixel.net/ and https://developer.hypixel.net/policies/
- Minecraft protocol reference (third-party implementation, not an official Minecraft API): https://github.com/PrismarineJS/node-minecraft-protocol/blob/master/docs/API.md

