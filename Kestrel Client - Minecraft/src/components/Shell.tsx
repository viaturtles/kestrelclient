import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDownToLine, Bell,ChevronDown, ChevronLeft, ChevronRight, Download, Folder, FolderOpen, Gamepad2, Globe, House, Images, Info, LogIn, LogOut, MessageCircle, Minus, Palette, Puzzle, RefreshCw, RotateCcw, Settings as Gear, Square, User, X, FileText, MonitorPlay, Server as ServerIcon, Shirt, ShieldCheck, Ban, Users } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { api, inApp, onJob, onMission } from "../lib/api";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForUpdate, installUpdate } from "../lib/updates";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { openMissionControl } from "../lib/launch";
import { MICROSOFT_SIGN_IN_OPEN } from "../lib/config";
import { SECTION_ORDER, sectionOf, useApp, type Route } from "../lib/store";
import { windowAction, type WindowAction } from "../native";
import { useDismiss } from "./ui";
import { Home } from "../pages/Home";
import { Installations } from "../pages/Installations";
import { Explore, ProjectPage } from "../pages/Explore";
import { Servers } from "../pages/Servers";
import { Cosmetics } from "../pages/Cosmetics";
import { Friends } from "../pages/Friends";
import { Staff } from "../pages/Staff";
import { SettingsPage } from "../pages/Settings";
import { Updates, POSTS, unreadNews, markNewsRead } from "../pages/Updates";

const RAIL = [
  { section: "home", label: "Home", icon: House, route: { name: "home" } as Route },
  { section: "installations", label: "Installations", icon: Folder, route: { name: "installations" } as Route },
  { section: "explore", label: "Explore", icon: Puzzle, route: { name: "explore" } as Route },
  { section: "servers", label: "Servers", icon: ServerIcon, route: { name: "servers" } as Route },
  { section: "friends", label: "Friends", icon: Users, route: { name: "friends" } as Route },
  { section: "cosmetics", label: "Cosmetics", icon: Shirt, route: { name: "cosmetics" } as Route },
];

const PRESENCE: Record<string, string> = {
  home: "On the home screen", installations: "Setting up installations", explore: "Browsing mods and packs", servers: "Picking a server", friends: "Checking on friends", cosmetics: "Looking at cosmetics", settings: "Changing settings",
};

function crumbFor(r: Route, app: ReturnType<typeof useApp>) {
  switch (r.name) {
    case "home": return "Home";
    case "updates": return "Home / What's new";
    case "installations": { const i = app.installations.find((x) => x.id === r.id) ?? app.selected; return `Installations / ${i.name}${r.tab && r.tab !== "Overview" ? " / " + r.tab : ""}`; }
    case "explore": return "Explore";
    case "project": return "Explore / Project";
    case "servers": return "Servers";
    case "friends": return "Friends";
    case "cosmetics": return "Cosmetics";
    case "staff": return `Staff / ${r.tab ?? "Players"}`;
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
    case "friends": return <Friends />;
    case "cosmetics": return <Cosmetics />;
    case "staff": return <Staff tab={route.tab} />;
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
  // When Minecraft starts: minimise or hide Kestrel (setting), and bring it back when the game closes.
  useEffect(() => {
    if (!inApp) return;
    let tucked = false;
    const un = onMission(async (e) => {
      if (e.kind !== "state") return;
      const w = getCurrentWindow(), mode = app.settings.onGameStart;
      if (e.status === "running" && !tucked) {
        if (mode === "Minimise Kestrel") { tucked = true; await w.minimize(); }
        else if (mode === "Hide Kestrel") { tucked = true; await w.hide(); }
      } else if (tucked && (e.status === "exited" || e.status === "crashed" || e.status === "failed")) {
        tucked = false; await w.show(); await w.unminimize(); await w.setFocus();
      }
    });
    return () => { un.then((f) => f()); };
  }, [app.settings.onGameStart]);
  // Auto-update: check now and every 30 minutes. A new version sends a Windows notification;
  // coming back to Kestrel (or clicking it) opens the update prompt. Ignored updates install on next start.
  const [update, setUpdate] = useState<Update | null>(null);
  const announced = useRef<string | null>(null), promptPending = useRef(false);
  const openUpdatePrompt = (u: Update) => { promptPending.current = false; updateDialog(app, u); };
  const runUpdateCheck = (manual: boolean) => checkForUpdate().then(async (u) => {
    setUpdate(u);
    if (manual) { if (u) openUpdatePrompt(u); else app.notify("You're on the latest version of Kestrel."); return; }
    if (!u || announced.current === u.version) return;
    announced.current = u.version;
    if (await getCurrentWindow().isFocused()) { openUpdatePrompt(u); return; }
    promptPending.current = true;
    if (settingsRef.current.notifyUpdates) notifyIfWanted(settingsRef.current.notifyMode, "Kestrel update available", `Version ${u.version} is ready. Open Kestrel to update.`);
  }).catch(() => { if (manual) app.notify("Couldn't check for updates. Check your internet connection.", "error"); });
  useEffect(() => {
    if (!inApp) return;
    const first = setTimeout(() => runUpdateCheck(false), 4000), every = setInterval(() => runUpdateCheck(false), 30 * 60 * 1000);
    const onCheck = () => runUpdateCheck(true);
    window.addEventListener("kestrel:check-updates", onCheck);
    const unFocus = getCurrentWindow().onFocusChanged(({ payload: focused }) => { if (focused && promptPending.current && updateRef.current) openUpdatePrompt(updateRef.current); });
    return () => { clearTimeout(first); clearInterval(every); window.removeEventListener("kestrel:check-updates", onCheck); unFocus.then((f) => f()); };
  }, []);
  const updateRef = useRef<Update | null>(null); updateRef.current = update;
  const settingsRef = useRef(app.settings); settingsRef.current = app.settings;
  // Windows notifications for finished downloads and for errors (Settings → Notifications).
  useEffect(() => {
    if (!inApp) return;
    const said = new Set<string>();
    const unJob = onJob((j) => {
      const st = settingsRef.current;
      if (j.state === "running" || said.has(j.id + j.state)) return;
      said.add(j.id + j.state);
      if (j.state === "done" && st.notifyDownloads) notifyIfWanted(st.notifyMode, "Download finished", j.title);
      if (j.state === "failed" && st.notifyErrors) notifyIfWanted(st.notifyMode, `Couldn't finish: ${j.title}`, j.detail || "Open Kestrel to see what happened.");
    });
    const unMission = onMission((e) => {
      const st = settingsRef.current;
      if (e.kind !== "state" || !st.notifyErrors) return;
      if (e.status === "failed") notifyIfWanted(st.notifyMode, "Minecraft couldn't start", e.detail ?? "Open Launch Control to see why.");
      if (e.status === "crashed") notifyIfWanted(st.notifyMode, "Minecraft crashed", e.detail ?? "Open Launch Control to see why.");
    });
    return () => { unJob.then((f) => f()); unMission.then((f) => f()); };
  }, []);
  // Ctrl+1 / 2 / 3 jump between sections.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey) return;
      const i = ["1", "2", "3", "4", "5", "6"].indexOf(e.key); if (i < 0) return;
      e.preventDefault(); go(RAIL[i].route);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => { if (inApp) api.discordPrefs(s.discordPresence, s.discordShowServer, s.discordInLauncher).catch(() => {}); }, [s.discordPresence, s.discordShowServer, s.discordInLauncher]);
  useEffect(() => {
    if (inApp) api.discordLauncher({ details: "In the Kestrel launcher", state: PRESENCE[section] ?? "", startMs: openedAt.current }).catch(() => {});
  }, [section]);
  // Your real head from your Mojang skin once it's loaded.
  const avatar = app.head ?? (app.account ? `https://mc-heads.net/avatar/${app.account.uuid}/64` : "/assets/imgYourMinecraftPfp.png");

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


  const control = (a: WindowAction) => void windowAction(a).catch((e) => app.notify(e instanceof Error ? e.message : "Window action failed.", "error"));
  const running = app.jobs.filter((j) => j.state === "running");

  // Status box in the top bar: only while something is happening (game starting/running, downloads).
  const [game, setGame] = useState<{ state: string; detail: string; since: number }>({ state: "idle", detail: "", since: 0 });
  useEffect(() => {
    const un = onMission((e) => { if (e.kind === "state") setGame((g) => ({ state: e.status ?? "idle", detail: e.detail ?? "", since: g.state === e.status ? g.since : Date.now() })); });
    return () => { un.then((f) => f()); };
  }, []);
  const [, tick] = useState(0);
  useEffect(() => { if (game.state !== "running") return; const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, [game.state]);
  const mins = Math.floor((Date.now() - game.since) / 60000);
  const dl = running[0];
  const status: { title: string; detail?: string; pct?: number; hint?: string; onClick: () => void } | null =
    game.state === "running" ? { title: "Minecraft running", detail: `${app.selected.name} · ${mins < 1 ? "just started" : `${mins} min`}`, hint: "Open Launch Control", onClick: () => void openMissionControl() }
    : game.state === "preparing" ? { title: "Starting Minecraft", detail: game.detail, hint: "Open Launch Control", onClick: () => void openMissionControl() }
    : dl ? { title: `Downloading · ${dl.title}`, detail: running.length > 1 ? `+${running.length - 1} more` : dl.total ? `${Math.round((dl.done / dl.total) * 100)}%` : undefined,
        pct: dl.total ? (dl.done / dl.total) * 100 : undefined, hint: "Open Downloads", onClick: () => setMenu("downloads") }
    : null;
  const go = (r: Route) => { setMenu(""); app.navigate(r); };

  return (
    <div className={"app" + (s.reducedMotion ? " reduced" : "")}>
      <header className="titlebar">
        <MenuAnchor open={menu === "app"} onClose={() => setMenu("")} trigger={
          <button className="brand" aria-haspopup="menu" aria-expanded={menu === "app"} onClick={() => setMenu(menu === "app" ? "" : "app")}>
            <img src="/assets/imgKestrelOriginalWhiteBird.svg" alt="" />KESTREL<ChevronDown size={12} color="var(--text3)" />
          </button>} style={{ left: 0, top: 34, width: 240 }}>
          <MI icon={<Info size={16} />} onClick={() => { setMenu(""); aboutDialog(app); }}>About Kestrel</MI>
          <MI icon={<RefreshCw size={16} />} onClick={() => { setMenu(""); runUpdateCheck(true); }}>Check for updates</MI>
          <div className="sep" />
          <MI icon={<MonitorPlay size={16} />} onClick={() => { setMenu(""); void openMissionControl(); }}>Launch Control</MI>
          <MI icon={<FileText size={16} />} onClick={() => { setMenu(""); api.openFolder("logs").catch((e) => app.notify(e.message, "error")); }}>Open logs folder</MI>
          <MI icon={<FolderOpen size={16} />} onClick={() => { setMenu(""); api.openFolder("data").catch((e) => app.notify(e.message, "error")); }}>Open Kestrel folder</MI>
          <div className="sep" />
          <MI icon={<RotateCcw size={16} />} onClick={() => location.reload()}>Restart Kestrel</MI>
          <MI icon={<Gear size={16} />} onClick={() => go({ name: "settings" })}>Settings</MI>
        </MenuAnchor>
        {status && (
          <button className="statusbox" title={status.hint} onClick={status.onClick}>
            <b>{status.title}</b>{status.detail && <span>{status.detail}</span>}
            {status.pct !== undefined && <i style={{ width: `${Math.max(3, status.pct)}%` }} />}
          </button>
        )}
        <div className="drag" onMouseDown={(e) => { if (e.button === 0 && e.detail === 1) control("startDragging"); }} />
        {update && (
          <button className="updbtn" aria-label={`Update Kestrel to ${update.version}`} title={`Update to ${update.version}`} onClick={() => openUpdatePrompt(update)}>
            <ArrowDownToLine size={14} strokeWidth={2.4} />
          </button>
        )}
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
          {[...RAIL, ...(app.me?.role ? [{ section: "staff", label: "Staff", icon: ShieldCheck, route: { name: "staff" } as Route }] : [])].map(({ section: sec, label, icon: Icon, route }) => (
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
        {app.me?.ban && (
          // Kestrel ban (from the staff panel): the launcher stays closed to this account until it ends.
          <div className="banned">
            <div>
              <span className="dtile danger" style={{ width: 52, height: 52, borderRadius: 12 }}><Ban size={24} /></span>
              <h2>You're banned from Kestrel</h2>
              <p>{app.me.ban.reason}</p>
              <span className="t-cap">{app.me.ban.until === null ? "This ban is permanent." : `Ends ${new Date(app.me.ban.until * 1000).toLocaleString()}.`} If you think it's a mistake, ask in the Kestrel Discord.</span>
              <button className="btn" onClick={() => app.refreshMe()}><RefreshCw size={14} />Check again</button>
            </div>
          </div>
        )}
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

/** "Update available" prompt: new version, what's new, Relaunch and update. */
function UpdatePrompt({ update }: { update: Update }) {
  const app = useApp();
  const [progress, setProgress] = useState<number | null>(null);
  const notes = (update.body ?? "").replace(/\r/g, "").trim();
  const go = () => {
    setProgress(0);
    installUpdate(update, setProgress).catch((e) => { setProgress(null); app.notify(`Update failed: ${e instanceof Error ? e.message : e}`, "error"); });
  };
  const items = notes.split("\n").map((l) => l.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean);
  return (
    <>
      {items.length > 0 && (
        <div className="inset" style={{ maxHeight: 220, overflowY: "auto" }}>
          <span className="gt" style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", color: "var(--text3)" }}>WHAT'S NEW</span>
          <ul className="bullets" style={{ margin: 0, padding: 0 }}>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      {progress !== null && <div className="progress"><span style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }} /></div>}
      <div className="actions">
        {progress !== null && <span className="t-cap" style={{ flex: 1 }}>Downloading… {Math.round(progress * 100)}%</span>}
        <button className="btn ghost" disabled={progress !== null} onClick={app.closeDialog}>Later</button>
        <button className="btn green" disabled={progress !== null} onClick={go}><RefreshCw size={15} />Restart and update</button>
      </div>
    </>
  );
}

export function updateDialog(app: ReturnType<typeof useApp>, u: Update) {
  app.openDialog({ title: `Kestrel ${u.version} is ready`, sub: `You have ${u.currentVersion}. Kestrel restarts to finish.`, icon: <ArrowDownToLine size={18} />, body: <UpdatePrompt update={u} /> });
}

/** Sends a Windows notification if Settings → Notifications allows it right now ("background" = only while Kestrel isn't focused). */
async function notifyIfWanted(mode: "always" | "background" | "never", title: string, body: string) {
  if (mode === "never") return;
  if (mode === "background" && (await getCurrentWindow().isFocused().catch(() => false))) return;
  await notifyWindows(title, body);
}

/** Windows notification (asks for permission the first time). Returns false if Windows won't allow it. */
export async function notifyWindows(title: string, body: string): Promise<boolean> {
  try {
    let ok = await isPermissionGranted();
    if (!ok) ok = (await requestPermission()) === "granted";
    if (ok) sendNotification({ title, body });
    return ok;
  } catch { return false; /* notifications off: the title-bar button still shows the update */ }
}

const SIGN_IN = { title: "Sign in with Microsoft", sub: "Use the account that owns Minecraft: Java Edition.", icon: <LogIn size={18} /> };

export function signInDialog(app: ReturnType<typeof useApp>) {
  if (!MICROSOFT_SIGN_IN_OPEN) {
    app.openDialog({ title: "Microsoft sign-in is almost here", sub: "Kestrel is waiting for Mojang to approve it.", icon: <LogIn size={18} />, body: (
      <>
        <div className="inset"><p className="note" style={{ color: "var(--text2)", fontSize: 13, lineHeight: "18px" }}>Until then you can play singleplayer offline with the name in Settings → Account. Online servers like Hypixel, and Friends, need sign-in.</p></div>
        <div className="actions"><button className="btn" onClick={app.closeDialog}>Got it</button></div>
      </>
    ) });
    return;
  }
  app.openDialog({ ...SIGN_IN, body: <SignIn app={app} /> });
}

function SignIn({ app }: { app: ReturnType<typeof useApp> }) {
  const [phase, setPhase] = useState<"idle" | "waiting" | "error">("idle");
  const [error, setError] = useState("");
  // Same body element each time, so React keeps this component's state while the header changes.
  const header = (h: typeof SIGN_IN) => app.openDialog({ ...h, body: <SignIn app={app} /> });
  const start = async () => {
    setPhase("waiting");
    header({ title: "Waiting for your browser", sub: "Finish signing in there. This updates by itself.", icon: <Globe size={18} /> });
    try {
      const a = await api.signIn();
      app.setAccount(a); app.closeDialog(); app.notify(`Signed in as ${a.name}.`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setPhase("error"); header(SIGN_IN); }
  };
  const needsId = error.includes("client ID");
  return (
    <>
      {phase === "waiting" ? <div className="indet" />
        : <div className="inset"><p className="note" style={{ color: "var(--text2)", fontSize: 13, lineHeight: "18px" }}>Your password goes to Microsoft in your browser, never to Kestrel. Without signing in you can still play singleplayer offline.</p></div>}
      {phase === "error" && <div className="mcrash" style={{ margin: 0 }}><AlertTriangle size={16} /><div>{error}</div></div>}
      <div className="actions">
        {phase === "waiting" ? <button className="btn ghost" onClick={app.closeDialog}>Cancel</button>
          : <button className="btn ghost" onClick={app.closeDialog}>Play offline</button>}
        {phase !== "waiting" && (needsId ? <button className="btn" onClick={() => { app.closeDialog(); app.navigate({ name: "settings", tab: "Account" }); }}>Open settings</button>
          : <button className="btn green" disabled={!inApp} onClick={start}><LogIn size={15} />{phase === "error" ? "Try again" : "Continue in browser"}</button>)}
      </div>
    </>
  );
}

function About() {
  const app = useApp();
  return (
    <>
      <div className="inset rows">
        <div><span>Game files and Java</span><span>Mojang</span></div>
        <div><span>Mods, packs and shaders</span><span>Modrinth</span></div>
        <div><span>Built with</span><span>Tauri, React, Lucide, Inter</span></div>
        <div><span>Licences</span><span>MIT · Apache-2.0 · ISC · OFL</span></div>
      </div>
      <p className="note">Not affiliated with Mojang or Microsoft. Minecraft is a trademark of Mojang Synergies AB. Hypixel, OptiFine and Modrinth project names and art belong to their owners.</p>
      <div className="actions"><button className="btn" onClick={app.closeDialog}>Close</button></div>
    </>
  );
}

async function aboutDialog(app: ReturnType<typeof useApp>) {
  const v = inApp ? await getVersion().catch(() => "") : "";
  app.openDialog({ title: v ? `Kestrel ${v}` : "Kestrel", sub: "Minecraft launcher for Windows", icon: <img src="/assets/imgKestrelOriginalWhiteBird.svg" alt="" style={{ width: 22, height: 22 }} />, body: <About /> });
}
