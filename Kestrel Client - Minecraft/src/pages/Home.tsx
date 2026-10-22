import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Cpu, Play, Plus, Settings as Gear } from "lucide-react";
import { COVERS, useApp, type HistoryItem, type Mode } from "../lib/store";
import { launchInstallation } from "../lib/launch";
import { api, inApp, onMission } from "../lib/api";
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
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div className={"launch" + (busy ? " busy" : "")}>
        <span className="shine" />
        <button className="main" aria-label={`Launch ${inst.name}`} onClick={onLaunch}>
          <span className="big">{busy ? "PREPARING…" : "LAUNCH GAME"}</span>
          <span className="sub"><img className="bird" src="/assets/imgKestrelOriginalWhiteBird.svg" alt="" />Kestrel {inst.version} with<img src={modeIcon(inst.mode)} alt="" />{inst.mode}</span>
        </button>
        <button className="chev" aria-label="Choose launch mode" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}><ChevronDown size={18} strokeWidth={2.5} /></button>
      </div>
      {open && (
        <div className="menu" role="menu" style={{ right: 0, bottom: 56, width: 272, transformOrigin: "bottom right" }}>
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
      kind: "world", name: w.name, detail: `Singleplayer · ${i.name}`, version: i.version, at: w.lastPlayed, installationId: i.id, icon: w.icon,
    }))).catch(() => [] as HistoryItem[]))).then((all) => setWorlds(all.flat()));
  }, [app.installations.length, app.history.length]);
  const history = [...app.history.filter((h) => h.kind === "server"), ...worlds].sort((a, b) => b.at - a.at).slice(0, 3);
  const playItem = (h: HistoryItem) => {
    const target = app.installations.find((i) => i.id === h.installationId) ?? inst;
    if (target.id !== inst.id) app.selectInstallation(target.id);
    launchInstallation(app, target, h.kind === "server" ? h.serverAddress ?? null : null);
  };

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
        </div>
        <div style={{ position: "absolute", right: 36, bottom: 36, display: "flex", gap: 10, alignItems: "center" }}>
          <button className="ibtn solid" style={{ width: 48, height: 48, borderRadius: 10 }} aria-label="Installation settings" onClick={() => app.navigate({ name: "installations", id: inst.id, tab: "Settings" })}><Gear size={18} className="spin" /></button>
          <LaunchButton onLaunch={() => launchInstallation(app, inst)} />
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 20, alignItems: "start", flex: 1 }}>
      <div className="st" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignContent: "flex-start", ["--i" as string]: 1 }}>
        {app.installations.map((i) => {
          const on = i.id === inst.id;
          return (
            <button key={i.id} onClick={() => app.selectInstallation(i.id)} aria-pressed={on} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px 8px 8px", borderRadius: 10, textAlign: "left", transition: "background var(--base)",
              background: on ? "var(--control)" : "var(--surface)", boxShadow: on ? "inset 0 0 0 1px rgba(255,255,255,.14), 0 2px 4px rgba(0,0,0,.2)" : "none" }}>
              <img src={(COVERS[i.cover] ?? COVERS.hypixel).src} alt="" style={{ width: 36, height: 36, borderRadius: 7, objectFit: "cover" }} />
              <span><b className="t-strong" style={{ display: "block", color: on ? "var(--text)" : "var(--text2)" }}>{i.name}</b><span className="t-cap">{i.version} · {i.mode}</span></span>
            </button>
          );
        })}
        <button onClick={() => newInstallationDialog(app)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px 8px 12px", borderRadius: 10, color: "var(--text2)", fontWeight: 600, boxShadow: "inset 0 0 0 1px var(--divider)" }}><Plus size={16} />New installation</button>
      </div>

        <section className="st jumpback" style={{ ["--i" as string]: 2 }}>
          <div className="jh"><span>Jump back in</span><button className="link" onClick={() => app.navigate({ name: "servers" })}>Servers<ChevronRight size={14} /></button></div>
          {history.length === 0 ? (
            <div className="t-cap" style={{ padding: "6px 0 10px" }}>Servers and worlds you play from Kestrel show up here.</div>
          ) : history.map((h, n) => (
            <div key={n} className="jrow">
              <span className="jthumb" style={{ imageRendering: h.icon ? "pixelated" : undefined, backgroundImage: `url(${h.icon ? h.icon : h.kind === "server" && /hypixel/i.test(h.serverAddress ?? "") ? COVERS.hypixel.src : h.kind === "server" ? COVERS.classic.src : COVERS.sunset.src})` }} />
              <span style={{ flex: 1, minWidth: 0 }}><b className="t-strong" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</b><span className="t-cap">{h.detail} · {h.version}</span></span>
              <button className="ibtn grey sm" aria-label={`Play ${h.name}`} onClick={() => playItem(h)}><Play size={13} /></button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
