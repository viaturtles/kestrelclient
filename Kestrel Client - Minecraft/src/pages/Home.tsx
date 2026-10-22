import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Cpu, Play, Plus, RotateCcw, Settings as Gear, UserPlus, Users } from "lucide-react";
import { COVERS, errText, useApp, type HistoryItem, type Mode } from "../lib/store";
import { sfx } from "../lib/sfx";
import { launchInstallation } from "../lib/launch";
import { api, inApp, onMission, type ServerStatus } from "../lib/api";
import { signInDialog } from "../components/Shell";
import { useDismiss } from "../components/ui";
import { newInstallationDialog } from "./Installations";

export const modeIcon = (m: Mode) => (m === "OptiFine" ? "/assets/imgOptiFineIcon.png" : "/assets/v3/mc.png");

export function LaunchButton({ onLaunch }: { onLaunch: () => void }) {
  const app = useApp();
  const inst = app.selected;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  useEffect(() => {
    const un = onMission((e) => { if (e.kind === "state") setBusy(e.status === "preparing"); });
    return () => { un.then((f) => f()); };
  }, []);
  // Install first: until Java 8 and every game file are ready, the button says INSTALL.
  const [gameReady, setGameReady] = useState<boolean | null>(inApp ? null : true);
  const [installing, setInstalling] = useState(false);
  useEffect(() => { if (inApp && !app.javas) app.refreshJava().catch(() => {}); }, []);
  const doneJobs = app.jobs.filter((j) => j.state === "done").length;
  useEffect(() => { if (inApp) api.gameStatus(inst.version).then((s) => setGameReady(s.installed)).catch(() => setGameReady(false)); }, [inst.version, doneJobs]);
  const javaReady = !inApp || app.javas === null || app.javas.some((j) => j.major === 8 && /64/.test(j.arch));
  const ready = gameReady !== false && javaReady;
  const job = app.jobs.find((j) => j.state === "running" && (j.id === `game-${inst.version}` || j.id === "runtime-jre-legacy"));
  const pct = job && job.total ? Math.round((job.done / job.total) * 100) : null;
  const install = async () => {
    setInstalling(true);
    try {
      if (!javaReady) { await api.installJava(); await app.refreshJava(); }
      if (gameReady === false) await api.installGame(inst.version);
      setGameReady(true);
      if (app.settings.interfaceSounds) sfx.done(app.settings.soundVolume);
      app.notify(`Minecraft ${inst.version} is installed. Press Launch Game to play.`);
    } catch (e) {
      if (app.settings.interfaceSounds) sfx.error(app.settings.soundVolume);
      app.notify(errText(e), "error");
    } finally { setInstalling(false); }
  };
  const label = busy ? "PREPARING…" : installing || job ? `INSTALLING${pct !== null ? ` ${pct}%` : "…"}` : ready ? "LAUNCH GAME" : "INSTALL";
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div className={"launch" + (busy || installing ? " busy" : "")} title={!ready && !installing ? `Downloads ${javaReady ? "" : "Java 8 and "}Minecraft ${inst.version} from Mojang` : undefined}>
        <span className="shine" />
        {(installing || job) && <span className="prog" style={{ width: `${pct ?? 4}%` }} />}
        <button className="main" aria-label={ready ? `Launch ${inst.name}` : `Install Minecraft ${inst.version}`} disabled={installing || !!job} onClick={ready ? onLaunch : install}>
          <span className="big">{label}</span>
        </button>
        <button className="chev" aria-label="Choose installation and launch mode" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}><ChevronDown size={18} strokeWidth={2.5} /></button>
      </div>
      {open && (
        <div className="menu" role="menu" style={{ right: 0, bottom: 56, width: 292, transformOrigin: "bottom right", maxHeight: 520, overflowY: "auto" }}>
          <div className="mh">Installation</div>
          {app.installations.map((i) => (
            <button key={i.id} role="menuitemradio" aria-checked={i.id === inst.id} className={"mi" + (i.id === inst.id ? " active" : "")} onClick={() => { app.selectInstallation(i.id); setOpen(false); }}>
              <img src={(COVERS[i.cover] ?? COVERS.hypixel).src} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 6 }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}><span>{i.name}</span><span className="t-cap" style={{ fontWeight: 400 }}>{i.version} · {i.mode}</span></span>
              {i.id === inst.id && <Check size={16} className="check" />}
            </button>
          ))}
          <button role="menuitem" className="mi" onClick={() => { setOpen(false); newInstallationDialog(app); }}>
            <span style={{ width: 28, height: 28, display: "grid", placeItems: "center", borderRadius: 6, boxShadow: "inset 0 0 0 1px var(--divider)" }}><Plus size={15} /></span>
            <span>New installation</span>
          </button>
          <div className="sep" />
          <div className="mh">Launch mode</div>
          {(["OptiFine", "Standard"] as Mode[]).map((m) => (
            <button key={m} role="menuitemradio" aria-checked={inst.mode === m} className={"mi" + (inst.mode === m ? " active" : "")} onClick={() => { app.updateInstallation(inst.id, { mode: m }); setOpen(false); }}>
              <img src={modeIcon(m)} alt="" style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 5 }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 1 }}><span>{m}</span><span className="t-cap" style={{ fontWeight: 400 }}>{m === "OptiFine" ? "Zoom, shaders, smoother frames" : "Plain Minecraft, nothing added"}</span></span>
              {inst.mode === m && <Check size={16} className="check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "2h ago", "Yesterday", "Oct 18". */
function ago(ms: number) {
  if (!ms) return "Never played";
  const m = (Date.now() - ms) / 60000;
  if (m < 1) return "Just now";
  if (m < 60) return `${Math.floor(m)}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  if (m < 2880) return "Yesterday";
  return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Saved servers with live player counts and ping. */
function ServersPanel() {
  const app = useApp();
  const [status, setStatus] = useState<Record<string, ServerStatus | null>>({});
  useEffect(() => {
    if (!inApp) return;
    const ping = () => app.servers.forEach((s) => api.pingServer(s.address).then((r) => setStatus((x) => ({ ...x, [s.id]: r }))).catch(() => setStatus((x) => ({ ...x, [s.id]: { online: false } }))));
    ping();
    const t = setInterval(ping, 60000);
    return () => clearInterval(t);
  }, [app.servers.map((s) => s.address).join()]);
  const list = [...app.servers].sort((a, b) => Number(!!status[b.id]?.online) - Number(!!status[a.id]?.online)).slice(0, 4);
  return (
    <section className="st hpanel" style={{ gridArea: "servers", ["--i" as string]: 3 }}>
      <div className="jh"><span>Your servers</span><button className="link" onClick={() => app.navigate({ name: "servers" })}>Servers<ChevronRight size={14} /></button></div>
      {list.length === 0 && <div className="hempty">Add servers on the Servers page to see who's online.</div>}
      {list.map((s) => {
        const st = status[s.id], on = !!st?.online;
        return (
          <div key={s.id} className="jrow" style={{ opacity: st && !on ? 0.55 : 1 }}>
            <span className="jthumb" style={{ imageRendering: "pixelated", backgroundImage: `url(${st?.favicon ?? (/hypixel/i.test(s.address) ? COVERS.hypixel.src : COVERS.classic.src)})` }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <b className="t-strong ell">{s.name}</b>
              <span className="t-cap" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="sdot" style={{ background: st === undefined ? "var(--text3)" : on ? "var(--accent-text)" : "var(--text3)" }} />
                {!inApp ? s.address : st === undefined ? "Checking…" : on ? `${(st.playersOnline ?? 0).toLocaleString()} online${st.pingMs != null ? ` · ${st.pingMs} ms` : ""}` : "Offline"}
              </span>
            </span>
            {on && <button className="btn grey sm" onClick={() => launchInstallation(app, app.selected, s.address)}><Play size={12} />Join</button>}
          </div>
        );
      })}
    </section>
  );
}

/** Friends: needs Microsoft sign-in; adding friends arrives with Kestrel's online service. */
function FriendsPanel() {
  const app = useApp();
  return (
    <section className="st hpanel friends" style={{ gridArea: "friends", ["--i" as string]: 2 }}>
      <div className="fh">
        <b>Friends</b>
        <button className="ibtn grey sm" aria-label="Add friend" disabled={!app.account} title={app.account ? "Adding friends arrives in an upcoming update" : "Sign in with Microsoft first"}><UserPlus size={15} /></button>
      </div>
      <div className="fempty">
        <span className="ficon"><Users size={22} /></span>
        {app.account ? (
          <>
            <b>Add friends by their Minecraft name</b>
            <span>See what your friends are playing and join them in one click. Friends arrive in an upcoming update.</span>
          </>
        ) : (
          <>
            <b>Sign in to add friends</b>
            <span>Friends use your Minecraft account, so sign in with Microsoft to add players by their Minecraft name.</span>
            <button className="btn grey sm" style={{ marginTop: 6 }} onClick={() => signInDialog(app)}>Sign in with Microsoft</button>
          </>
        )}
      </div>
    </section>
  );
}

export function Home() {
  const app = useApp();
  const inst = app.selected;
  const cover = COVERS[inst.cover] ?? COVERS.hypixel;
  const [artKey, setArtKey] = useState(0);
  useEffect(() => setArtKey((k) => k + 1), [inst.id]);
  // Jump back in: servers you joined + worlds found in every installation's saves folder, newest first.
  const [worlds, setWorlds] = useState<HistoryItem[]>([]);
  useEffect(() => {
    if (!inApp) return;
    Promise.all(app.installations.map((i) => api.listWorlds(i.id).then((ws) => ws.map((w): HistoryItem => ({
      kind: "world", name: w.name, detail: `Singleplayer · ${i.name}`, version: i.version, at: w.lastPlayed, installationId: i.id, icon: w.icon, folder: w.folder,
    }))).catch(() => [] as HistoryItem[]))).then((all) => setWorlds(all.flat()));
  }, [app.installations.length, app.history.length]);
  const history = [...app.history.filter((h) => h.kind === "server"), ...worlds].sort((a, b) => b.at - a.at).slice(0, 4);
  const playItem = (h: HistoryItem) => {
    const target = app.installations.find((i) => i.id === h.installationId) ?? inst;
    if (target.id !== inst.id) app.selectInstallation(target.id);
    if (h.kind === "server") launchInstallation(app, target, h.serverAddress ?? null);
    else launchInstallation(app, target, null, h.folder ?? h.name);
  };
  // Pick up where you left off: the last server played on this installation.
  const lastServer = app.history.find((h) => h.kind === "server" && h.installationId === inst.id && h.serverAddress);
  // Enter launches from Home (when you aren't typing or in a dialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || app.dialog) return;
      const t = e.target as HTMLElement;
      if (t && (t.closest("input, textarea, select, button, [role=menu]") || t.isContentEditable)) return;
      e.preventDefault(); launchInstallation(app, inst);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inst.id, app.dialog]);

  return (
    <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: "100%" }}>
      <section className="cover st" style={{ height: 372, flex: "none", ["--i" as string]: 0 }}>
        <div className={"art" + (artKey > 1 ? " enter" : "")} key={artKey} style={{ backgroundImage: `url(${cover.src})` }} />
        <div className="scrim" />
        <div style={{ position: "absolute", left: 36, bottom: 36, display: "flex", flexDirection: "column", gap: 10 }} key={"t" + artKey}>
          <span className="t-small shadowtext st" style={{ color: "#d7dce3", display: "flex", alignItems: "center", gap: 8 }}>
            <img src={inst.cover === "hypixel" ? "/assets/imgHypixelOfficialLogo.png" : "/assets/v3/mc.png"} alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />Selected installation
          </span>
          <h1 className="shadowtext st" style={{ fontSize: 40, lineHeight: "44px", fontWeight: 700, letterSpacing: -0.8, ["--i" as string]: 1 }}>{inst.name}</h1>
          <div className="t-small shadowtext st" style={{ display: "flex", gap: 16, color: "#e3e7ec", ["--i" as string]: 2 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><img src="/assets/v3/mc.png" alt="" style={{ width: 16, height: 16 }} />Minecraft {inst.version}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><img src={modeIcon(inst.mode)} alt="" style={{ width: 16, height: 16, borderRadius: 3 }} />{inst.mode}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Cpu size={15} color="#c9ced6" />{inst.memoryGb} GB memory</span>
          </div>
          {lastServer && (
            <button className="rejoin st" style={{ ["--i" as string]: 3 }} onClick={() => launchInstallation(app, inst, lastServer.serverAddress!)}>
              <RotateCcw size={13} />Rejoin {lastServer.name}<span>· {ago(lastServer.at)}</span>
            </button>
          )}
        </div>
        <div style={{ position: "absolute", right: 36, bottom: 36, display: "flex", gap: 10, alignItems: "center" }}>
          <button className="ibtn solid" style={{ width: 48, height: 48, borderRadius: 10 }} aria-label="Installation settings" onClick={() => app.navigate({ name: "installations", id: inst.id, tab: "Settings" })}><Gear size={18} className="spin" /></button>
          <LaunchButton onLaunch={() => launchInstallation(app, inst)} />
        </div>
      </section>

      <div className="home-grid">

        <section className="st hpanel" style={{ gridArea: "jump", ["--i" as string]: 2 }}>
          <div className="jh"><span>Jump back in</span><button className="link" onClick={() => app.navigate({ name: "installations", id: inst.id, tab: "Worlds" })}>Worlds<ChevronRight size={14} /></button></div>
          {history.length === 0 ? (
            <div className="hempty">Worlds and servers you play show up here.</div>
          ) : history.map((h, n) => (
            <div key={n} className="jrow">
              <span className="jthumb" style={{ imageRendering: h.icon ? "pixelated" : undefined, backgroundImage: `url(${h.icon ? h.icon : h.kind === "server" && /hypixel/i.test(h.serverAddress ?? "") ? COVERS.hypixel.src : h.kind === "server" ? COVERS.classic.src : COVERS.sunset.src})` }} />
              <span style={{ flex: 1, minWidth: 0 }}><b className="t-strong ell">{h.name}</b><span className="t-cap ell">{h.detail} · {ago(h.at)}</span></span>
              <button className="ibtn grey sm" aria-label={`Play ${h.name}`} onClick={() => playItem(h)}><Play size={13} /></button>
            </div>
          ))}
        </section>
        <ServersPanel />
        <FriendsPanel />
      </div>
    </div>
  );
}
