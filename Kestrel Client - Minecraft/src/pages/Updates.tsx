import { useApp } from "../lib/store";

// Release notes bundled with this build. Online updates arrive with the first public release.
export const POSTS = [
  { tag: "New", date: "Oct 23, 2026", title: "Kestrel, now in your game", art: "/assets/news/kestrel-core.jpg",
    body: "Every 1.8.9 launch now has Kestrel built in. A new title screen over Minecraft's own panorama with your skin in 3D, and Right Shift opens 21 mods: FPS and CPS, Zoom, a custom crosshair, better chat, a cleaner Tab list, Hypixel helpers and more." },
  { tag: "Performance", date: "Oct 23, 2026", title: "About twice the FPS", art: "/assets/news/fps.jpg",
    body: "Kestrel removes the slow waits between your CPU and graphics card, builds clouds once and skips mobs hidden behind walls. In our tests that's around 2× the FPS in busy areas, and the game looks exactly the same." },
  { tag: "New", date: "Oct 23, 2026", title: "Installs itself, fixes itself", art: "/assets/art/windhover.jpg",
    body: "Java, Minecraft and OptiFine install before you press Launch. If the game crashes, Launch Control offers a one-click fix. Worlds can be restored from backups, older PCs get Low-end mode, and each installation shows your play time." },
  { tag: "Design update", date: "Oct 21, 2026", title: "Made to feel like yours", art: "/assets/v3/complementary.jpg",
    body: "A calmer launcher built around your installations: one launch button, one-click switching, and pages that keep you oriented. Moving between sections now sweeps across the screen with the Kestrel bird." },
  { tag: "New", date: "Oct 21, 2026", title: "Mods from Modrinth", art: "/assets/v3/bsl.jpg",
    body: "Search Modrinth from Explore. Every project shows whether it fits the installation you're installing to, and installs are checked against Modrinth's file hashes." },
  { tag: "New", date: "Oct 21, 2026", title: "Launch Control", art: "/assets/imgRectangle.png",
    body: "Pressing Launch opens Launch Control: each step of the launch, a live console, and controls to stop the game or open its folder." },
];

const SEEN = "kestrel.newsSeen";
/** How many posts haven't been opened yet (drives the red dot). */
export function unreadNews(): number {
  try { const seen: string[] = JSON.parse(localStorage.getItem(SEEN) ?? "[]"); return POSTS.filter((p) => !seen.includes(p.title)).length; } catch { return POSTS.length; }
}
export function markNewsRead() { try { localStorage.setItem(SEEN, JSON.stringify(POSTS.map((p) => p.title))); } catch { /* ignore */ } }

export function Updates() {
  const app = useApp();
  return (
    <div className="pad" style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="st"><h1 className="t-display">What's new</h1><p className="muted" style={{ marginTop: 4 }}>What's changed in Kestrel, newest first.</p></div>
      {POSTS.map((p, i) => (
        <article key={p.title} className="st" style={{ display: "flex", gap: 20, padding: 16, borderRadius: 14, background: i === 0 ? "var(--surface)" : "transparent", ["--i" as string]: i + 1 }}>
          <div style={{ width: 260, height: 146, borderRadius: 10, background: `url(${p.art}) center/cover`, flex: "none" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="t-small muted">{p.tag} <span className="faint">· {p.date}</span></span>
            <h2 className="t-title">{p.title}</h2>
            <p className="muted" style={{ lineHeight: "20px", maxWidth: "60ch" }}>{p.body}</p>
          </div>
        </article>
      ))}
      <button className="link st" style={{ alignSelf: "flex-start" }} onClick={() => app.navigate({ name: "home" })}>Back to Home</button>
    </div>
  );
}
