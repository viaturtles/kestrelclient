import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, Bell,ChevronDown, ChevronLeft, ChevronRight, Download, Folder, FolderOpen, Gamepad2, Globe, House, Images, Info, LogIn, LogOut, MessageCircle, Minus, Palette, Puzzle, RefreshCw, RotateCcw, Scale, Settings as Gear, Square, User, X, FileText, MonitorPlay } from "lucide-react";
import { api, inApp } from "../lib/api";
import { openMissionControl } from "../lib/launch";
import { sfx } from "../lib/sfx";
import { SECTION_ORDER, sectionOf, useApp, type Route } from "../lib/store";
import { windowAction, type WindowAction } from "../native";
import { useDismiss } from "./ui";
import { Home } from "../pages/Home";
import { Installations } from "../pages/Installations";
import { Explore, ProjectPage } from "../pages/Explore";
import { Servers } from "../pages/Servers";
import { SettingsPage } from "../pages/Settings";
import { Updates, POSTS, unreadNews, markNewsRead } from "../pages/Updates";

const RAIL = [
  { section: "home", label: "Home", icon: House, route: { name: "home" } as Route },
  { section: "installations", label: "Installations", icon: Folder, route: { name: "installations" } as Route },
  { section: "explore", label: "Explore", icon: Puzzle, route: { name: "explore" } as Route },
  { section: "servers", label: "Servers", icon: Globe, route: { name: "servers" } as Route },
];

const PRESENCE: Record<string, string> = {
  home: "On the home screen", installations: "Setting up installations", explore: "Browsing mods and packs", servers: "Picking a server", settings: "Changing settings",
};

function crumbFor(r: Route, app: ReturnType<typeof useApp>) {
  switch (r.name) {
    case "home": return "Home";
    case "updates": return "Home / What's new";
    case "installations": { const i = app.installations.find((x) => x.id === r.id) ?? app.selected; return `Installations / ${i.name}${r.tab && r.tab !== "Overview" ? " / " + r.tab : ""}`; }
    case "explore": return "Explore";
    case "project": return "Explore / Project";
    case "servers": return "Servers";
    case "settings": return `Settings / ${r.tab ?? "General"}`;
  }
}

function PageFor({ route }: { route: Route }) {
  switch (route.name) {
    case "home": return <Home />;
    case "installations": return <Installations id={route.id} tab={route.tab} />;
    case "explore": return <Explore type={route.type} target={route.target} />;
    case "project": return <ProjectPage id={route.id} target={route.target} />;
    case "servers": return <Servers />;
    case "settings": return <SettingsPage tab={route.tab} />;
    case "updates": return <Updates />;
  }
}

export function Shell() {
  const app = useApp();
  const [shown, setShown] = useState<Route>(app.route);
  const [crumb, setCrumb] = useState(crumbFor(app.route, app));
  const [crumbSwap, setCrumbSwap] = useState(false);
  const [menu, setMenu] = useState<"" | "app" | "account" | "downloads" | "news">("");
  const [unread, setUnread] = useState(unreadNews);
  const panel = useRef<HTMLDivElement>(null);
  const sweepRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const [pillY, setPillY] = useState(0);
  const busy = useRef(false);
  const s = app.settings;

  // Rail highlight follows the section.
  const section = sectionOf(app.route);
  useLayoutEffect(() => {
    const btn = railRef.current?.querySelector<HTMLElement>(`[data-section="${section}"]`);
    const rail = railRef.current;
    if (btn && rail) setPillY(btn.getBoundingClientRect().top - rail.getBoundingClientRect().top - 24);
  }, [section]);

  // Route changes: sweep between sections, quick change within one.
  useEffect(() => {
    const next = app.route;
    setCrumbSwap(true);
    const t = setTimeout(() => { setCrumb(crumbFor(next, app)); setCrumbSwap(false); }, 120);
    const from = sectionOf(shown), to = sectionOf(next);
    if (from !== to && s.sectionTransitions && !s.reducedMotion && !busy.current) {
      runSweep(SECTION_ORDER.indexOf(to as never) >= SECTION_ORDER.indexOf(from as never) ? 1 : -1, () => setShown(next));
    } else {
      setShown(next);
    }
    return () => clearTimeout(t);
  }, [app.navTick]);

  // Discord: what to show while in the launcher (the game sets its own status).
  const openedAt = useRef(Date.now());
  useEffect(() => { if (inApp) api.discordPrefs(s.discordPresence, s.discordShowServer, s.discordInLauncher).catch(() => {}); }, [s.discordPresence, s.discordShowServer, s.discordInLauncher]);
  useEffect(() => {
    if (inApp) api.discordLauncher({ details: "In the Kestrel launcher", state: PRESENCE[section] ?? "", startMs: openedAt.current }).catch(() => {});
  }, [section]);
  const avatar = app.account ? `https://mc-heads.net/avatar/${app.account.uuid}/64` : "/assets/imgYourMinecraftPfp.png";

  // Keep the breadcrumb in sync when an installation is renamed.
  useEffect(() => { setCrumb(crumbFor(app.route, app)); }, [app.installations]);

  function runSweep(dir: number, swap: () => void) {
    const p = panel.current, sw = sweepRef.current;
    if (!p || !sw) { swap(); return; }
    busy.current = true;
    const w = p.clientWidth, h = p.clientHeight;
    const ang = (Math.atan2(h, w) * 180) / Math.PI;
    const footprint = w * Math.cos((ang * Math.PI) / 180) + h * Math.sin((ang * Math.PI) / 180);
    const track = sw.querySelector<HTMLElement>(".track")!, cars = sw.querySelector<HTMLElement>(".cars")!, mark = sw.querySelector<HTMLElement>(".mark")!;
    sw.hidden = false;
    track.style.transform = `rotate(${dir > 0 ? -ang : 180 - ang}deg)`;
    mark.style.transform = `translate(-50%,-50%) rotate(${dir > 0 ? ang : ang - 180}deg)`;
    const total = cars.scrollWidth, half = footprint / 2 + 8, body = 1700;
    const startX = 2100 - half - total, coverX = 2100 - body / 2 - 40 - 30, endX = 2100 + half;
    const d = 640 * parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--m") || "1");
    const a = cars.animate([
      { transform: `translateX(${startX}px)`, easing: "cubic-bezier(.55,0,.3,1)" },
      { transform: `translateX(${coverX}px)`, offset: 0.42, easing: "linear" },
      { transform: `translateX(${coverX + 60}px)`, offset: 0.58, easing: "cubic-bezier(.7,0,.45,1)" },
      { transform: `translateX(${endX}px)` },
    ], { duration: d, fill: "forwards" });
    mark.animate([{ opacity: 0 }, { opacity: 0, offset: 0.2 }, { opacity: 1, offset: 0.42 }, { opacity: 1, offset: 0.58 }, { opacity: 0, offset: 0.8 }, { opacity: 0 }], { duration: d, fill: "forwards" });
    setTimeout(swap, d * 0.5);
    a.onfinish = () => { sw.hidden = true; a.cancel(); busy.current = false; };
  }

  // Sounds for finished / failed downloads.
  const prevJobs = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const j of app.jobs) {
      const before = prevJobs.current[j.id];
      if (before === "running" && j.state !== "running" && s.interfaceSounds) {
        if (j.state === "done") sfx.done(s.soundVolume); else if (j.state === "failed") sfx.error(s.soundVolume);
      }
      prevJobs.current[j.id] = j.state;
    }
  }, [app.jobs]);

  const control = (a: WindowAction) => void windowAction(a).catch((e) => app.notify(e instanceof Error ? e.message : "Window action failed.", "error"));
  const running = app.jobs.filter((j) => j.state === "running");
  const go = (r: Route) => { setMenu(""); app.navigate(r); };

  return (
    <div className={"app" + (s.reducedMotion ? " reduced" : "")}>
      <header className="titlebar">
        <MenuAnchor open={menu === "app"} onClose={() => setMenu("")} trigger={
          <button className="brand" aria-haspopup="menu" aria-expanded={menu === "app"} onClick={() => setMenu(menu === "app" ? "" : "app")}>
            <img src="/assets/imgKestrelOriginalWhiteBird.svg" alt="" />KESTREL<ChevronDown size={12} color="var(--text3)" />
          </button>} style={{ left: 0, top: 34, width: 240 }}>
          <MI icon={<Info size={16} />} onClick={() => { setMenu(""); aboutDialog(app); }}>About Kestrel</MI>
          <MI icon={<RefreshCw size={16} />} onClick={() => { setMenu(""); app.notify("Update checks arrive with the first public release. You're on private build 0.1."); }}>Check for updates</MI>
          <MI icon={<Scale size={16} />} onClick={() => { setMenu(""); licencesDialog(app); }}>Licences</MI>
          <div className="sep" />
          <MI icon={<MonitorPlay size={16} />} onClick={() => { setMenu(""); void openMissionControl(); }}>Launch Control</MI>
          <MI icon={<FileText size={16} />} onClick={() => { setMenu(""); api.openFolder("logs").catch((e) => app.notify(e.message, "error")); }}>Open logs folder</MI>
          <MI icon={<FolderOpen size={16} />} onClick={() => { setMenu(""); api.openFolder("data").catch((e) => app.notify(e.message, "error")); }}>Open Kestrel folder</MI>
          <div className="sep" />
          <MI icon={<RotateCcw size={16} />} onClick={() => location.reload()}>Restart Kestrel</MI>
          <MI icon={<Gear size={16} />} onClick={() => go({ name: "settings" })}>Settings</MI>
        </MenuAnchor>
        <div className="histnav">
          <button aria-label="Back" disabled={!app.canBack} onClick={app.goBack}><ChevronLeft size={15} /></button>
          <button aria-label="Forward" disabled={!app.canForward} onClick={app.goForward}><ChevronRight size={15} /></button>
          <span className={"crumb" + (crumbSwap ? " swap" : "")}>{crumb}</span>
        </div>
        <div className="drag" onMouseDown={(e) => { if (e.button === 0 && e.detail === 1) control("startDragging"); }} />
        <MenuAnchor open={menu === "news"} onClose={() => setMenu("")} trigger={
          <button className="newsbtn" aria-label="What's new" aria-expanded={menu === "news"} onClick={() => { setMenu(menu === "news" ? "" : "news"); markNewsRead(); setUnread(0); }}>
            <Bell size={13} /><span className="lbl">What's new</span>{unread > 0 && <span className="ndot" />}
          </button>} style={{ right: 0, top: 34, width: 380 }} raw>
          <div className="newspop">
            <div className="nh"><b className="t-heading">What's new</b><button className="link" onClick={() => { setMenu(""); go({ name: "updates" }); }}>See all</button></div>
            {POSTS.map((p) => (
              <button key={p.title} className="nrow" onClick={() => { setMenu(""); go({ name: "updates" }); }}>
                <span className="thumb" style={{ backgroundImage: `url(${p.art})` }} />
                <span style={{ flex: 1, minWidth: 0 }}><b className="t-strong" style={{ display: "block" }}>{p.title}</b><span className="t-cap">{p.tag} · {p.date}</span></span>
                <ChevronRight size={16} color="var(--text3)" />
              </button>
            ))}
          </div>
        </MenuAnchor>
        <MenuAnchor open={menu === "downloads"} onClose={() => setMenu("")} trigger={
          <button className="dlpill" aria-expanded={menu === "downloads"} onClick={() => setMenu(menu === "downloads" ? "" : "downloads")}>
            {running.length ? <span className="dot" /> : <Download size={13} />}
            {running.length ? `${running.length} downloading` : "Downloads"}
          </button>} style={{ right: 8, top: 34, width: 380 }} raw>
          <DownloadsPopover />
        </MenuAnchor>
        <div className="winctl">
          <button aria-label="Minimize" onClick={() => control("minimize")}><Minus size={14} /></button>
          <button className="close" aria-label="Close" onClick={() => control("close")}><X size={15} /></button>
        </div>
      </header>

      <nav className="rail" aria-label="Sections" ref={railRef}>
        <span className="railpill" style={{ transform: `translateY(${pillY}px)` }} />
        <div className="top">
          {RAIL.map(({ section: sec, label, icon: Icon, route }) => (
            <button key={sec} data-section={sec} className={"rb" + (section === sec ? " on" : "")} aria-label={label} aria-current={section === sec ? "page" : undefined} onClick={() => go(route)}>
              <Icon size={20} /><span className="tip">{label}</span>
            </button>
          ))}
        </div>
        <div className="raildiv" />
        <div className="bottom">
          <MenuAnchor open={menu === "account"} onClose={() => setMenu("")} trigger={
            <button className="rb avatar" aria-label="Account" aria-expanded={menu === "account"} onClick={() => setMenu(menu === "account" ? "" : "account")}>
              <img src={avatar} alt="" /><span className="tip">{app.account?.name ?? "Account"}</span>
            </button>} style={{ left: 50, bottom: 0, width: 260 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px 10px" }}>
              <img src={avatar} alt="" style={{ width: 36, height: 36, borderRadius: 8, imageRendering: "pixelated", filter: app.account ? "none" : "grayscale(.5)" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                <b className="t-strong">{app.account?.name ?? s.offlineName ?? "Player"}</b>
                <span className="t-cap">{app.account ? "Microsoft account" : "Offline · singleplayer only"}</span>
              </div>
            </div>
            <div className="sep" />
            {app.account
              ? <MI icon={<LogOut size={16} />} onClick={() => { setMenu(""); api.signOut().then(() => { app.setAccount(null); app.notify("Signed out."); }).catch((e) => app.notify(String(e.message ?? e), "error")); }}>Sign out</MI>
              : <MI icon={<LogIn size={16} />} onClick={() => { setMenu(""); signInDialog(app); }}>Sign in with Microsoft</MI>}
            <MI icon={<MessageCircle size={16} />} onClick={() => go({ name: "settings", tab: "Account" })}>{app.discordUser ? `Discord: ${app.discordUser.displayName}` : "Sign in with Discord"}</MI>
            <MI icon={<Palette size={16} />} disabled>Skin &amp; cape · planned</MI>
            <MI icon={<Images size={16} />} onClick={() => go({ name: "installations", id: app.selected.id, tab: "Screenshots" })}>Screenshots</MI>
            <MI icon={<User size={16} />} onClick={() => go({ name: "settings", tab: "Account" })}>Account settings</MI>
          </MenuAnchor>
          <button data-section="settings" className={"rb" + (section === "settings" ? " on" : "")} aria-label="Settings" onClick={() => go({ name: "settings" })}>
            <Gear size={20} /><span className="tip">Settings</span>
          </button>
        </div>
      </nav>

      <main className="panel" ref={panel}>
        <div className="page" key={JSON.stringify(shown)}><PageFor route={shown} /></div>
        <div className="sweep" ref={sweepRef} hidden>
          <div className="track"><div className="cars">
            <div className="car c3" /><div className="car body"><div className="mark"><img src="/assets/imgKestrelOriginalWhiteBird.svg" alt="" /><span>KESTREL</span></div></div><div className="car c2" /><div className="car c1" />
          </div></div>
        </div>
      </main>
    </div>
  );
}

function MenuAnchor({ open, onClose, trigger, children, style, raw }: { open: boolean; onClose: () => void; trigger: React.ReactNode; children: React.ReactNode; style: React.CSSProperties; raw?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, onClose, ref);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      {trigger}
      {open && (raw ? <div className="popover" style={style}>{children}</div> : <div className="menu" role="menu" style={style}>{children}</div>)}
    </div>
  );
}

function MI({ icon, children, onClick, disabled }: { icon: React.ReactNode; children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return <button className="mi" role="menuitem" onClick={onClick} disabled={disabled}>{icon}<span>{children}</span></button>;
}

function DownloadsPopover() {
  const app = useApp();
  return (
    <div style={{ padding: "14px 14px 10px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", paddingBottom: 10 }}>
        <b className="t-heading" style={{ flex: 1 }}>Downloads</b>
        {app.jobs.some((j) => j.state !== "running") && <button className="link" onClick={app.clearJobs}>Clear finished</button>}
      </div>
      {!app.jobs.length && <div className="t-cap" style={{ padding: "18px 0 22px", textAlign: "center" }}>{inApp ? "Nothing downloading. Game files, Java and content you install show up here." : "Downloads run in the Kestrel desktop app."}</div>}
      {app.jobs.map((j) => (
        <div key={j.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 0", borderTop: "1px solid var(--divider)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}><b className="t-strong">{j.title}</b><div className="t-cap" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.detail}</div></div>
            {j.state === "running" ? <button className="ibtn sm" aria-label={`Cancel ${j.title}`} onClick={() => api.cancelJob(j.id)}><X size={14} /></button>
              : <span className={"chip " + (j.state === "done" ? "green" : j.state === "failed" ? "red" : "")}>{j.state === "done" ? "Done" : j.state === "failed" ? "Failed" : "Cancelled"}</span>}
          </div>
          {j.state === "running" && <div className="progress"><span style={{ width: j.total ? `${(j.done / j.total) * 100}%` : "6%" }} /></div>}
        </div>
      ))}
    </div>
  );
}

export function signInDialog(app: ReturnType<typeof useApp>) {
  app.openDialog({ title: "Sign in with Microsoft", body: <SignIn app={app} /> });
}

function SignIn({ app }: { app: ReturnType<typeof useApp> }) {
  const [phase, setPhase] = useState<"idle" | "waiting" | "error">("idle");
  const [error, setError] = useState("");
  const start = async () => {
    setPhase("waiting");
    try {
      const a = await api.signIn();
      app.setAccount(a); app.closeDialog(); app.notify(`Signed in as ${a.name}.`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setPhase("error"); }
  };
  const needsId = error.includes("client ID");
  return (
    <>
      <p className="muted" style={{ lineHeight: "20px" }}>Kestrel opens Microsoft's own sign-in page in your browser, so it never sees your password. Use the account that owns Minecraft: Java Edition.</p>
      {phase === "waiting" && <div className="notice"><span className="spinner" /><span>Finish signing in in your browser. This window updates by itself.</span></div>}
      {phase === "error" && <div className="mcrash" style={{ margin: 0 }}><AlertTriangle size={16} /><div>{error}</div></div>}
      <p className="t-cap">Not signed in? You can still launch offline for singleplayer. Online servers like Hypixel need Microsoft sign-in.</p>
      <div className="actions">
        <button className="btn ghost" onClick={app.closeDialog}>{phase === "waiting" ? "Cancel" : "Close"}</button>
        {needsId ? <button className="btn" onClick={() => { app.closeDialog(); app.navigate({ name: "settings", tab: "Account" }); }}>Open settings</button>
          : <button className="btn green" disabled={!inApp || phase === "waiting"} onClick={start}><LogIn size={15} />{phase === "error" ? "Try again" : "Open Microsoft sign-in"}</button>}
      </div>
    </>
  );
}

function aboutDialog(app: ReturnType<typeof useApp>) {
  app.openDialog({ title: "About Kestrel", body: (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <img src="/assets/imgKestrelOriginalWhiteBird.svg" alt="" style={{ width: 44, height: 44 }} />
        <div><b className="t-heading">Kestrel</b><div className="t-cap">Private build 0.1 · Windows</div></div>
      </div>
      <p className="muted" style={{ lineHeight: "20px" }}>A launcher for Minecraft: Java Edition. Game files and Java come straight from Mojang; mods, packs and shaders from Modrinth.</p>
      <p className="t-cap">Not affiliated with Mojang or Microsoft. Minecraft is a trademark of Mojang Synergies AB.</p>
      <div className="actions"><button className="btn" onClick={app.closeDialog}>Close</button></div>
    </>
  ) });
}

function licencesDialog(app: ReturnType<typeof useApp>) {
  app.openDialog({ title: "Licences", body: (
    <>
      <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: "22px" }}>
        <li>Tauri, React, Vite — MIT / Apache-2.0</li>
        <li>Lucide icons — ISC</li>
        <li>Inter typeface — SIL Open Font License</li>
        <li>Project icons, art and text in Explore belong to their Modrinth authors</li>
        <li>Hypixel and OptiFine names and logos belong to their owners</li>
      </ul>
      <div className="actions"><button className="btn" onClick={app.closeDialog}>Close</button></div>
    </>
  ) });
}
