import { useEffect, useRef, useState } from "react";
import { Copy, MoreHorizontal, Plus, RefreshCw, Search, Trash2, Server as ServerIcon } from "lucide-react";
import { api, inApp, type ServerStatus } from "../lib/api";
import { errText, useApp, type AppState, type Server } from "../lib/store";
import { launchInstallation } from "../lib/launch";
import { confirmDialog, useDismiss } from "../components/ui";

const isHypixel = (a: string) => /(^|\.)hypixel\.net(:\d+)?$/i.test(a);
/** The server's own art when Kestrel has it, else Kestrel's default server banner. */
const bannerOf = (a: string) => (isHypixel(a) ? "/assets/imgHypixelBackground1.png" : "/assets/brand/server-banner.png");
const TILE_COLORS = ["#7d4bd1", "#c23b32", "#2a7cc4", "#1f7a63", "#d0661c", "#5a6472"];
const tileColor = (s: string) => TILE_COLORS[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % TILE_COLORS.length];

/** Five bars like the in-game Tab list: green under 100 ms, yellow under 250, red above. */
export function Bars({ ms, big }: { ms: number | null | undefined; big?: boolean }) {
  const on = ms == null ? 0 : ms < 60 ? 5 : ms < 100 ? 4 : ms < 180 ? 3 : ms < 300 ? 2 : 1;
  const tone = ms == null ? "" : ms < 100 ? "g" : ms < 250 ? "y" : "r";
  const h = big ? [6, 10, 14, 18, 22] : [4, 6, 9, 11, 14];
  return <span className={`bars ${tone}${big ? " big" : ""}`} aria-label={ms == null ? "No ping" : `${ms} ms`}>{h.map((x, i) => <i key={i} className={i < on ? "on" : ""} style={{ height: x }} />)}</span>;
}
const quality = (ms: number) => (ms < 60 ? "great connection" : ms < 120 ? "good connection" : ms < 250 ? "okay connection" : "slow connection");

export function Servers() {
  const app = useApp();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Record<string, ServerStatus | "loading">>({});
  const ping = (id: string, address: string) => {
    if (!inApp) return;
    setStatus((s) => ({ ...s, [id]: "loading" }));
    api.pingServer(address).then((r) => setStatus((s) => ({ ...s, [id]: r }))).catch((e) => setStatus((s) => ({ ...s, [id]: { online: false, error: errText(e) } })));
  };
  const pingAll = () => app.servers.forEach((s) => ping(s.id, s.address));
  useEffect(pingAll, [app.servers.length]);
  const [featured, ...rest] = app.servers;
  const list = rest.filter((s) => (s.name + s.address).toLowerCase().includes(q.trim().toLowerCase()));
  const fs = featured ? status[featured.id] : undefined;
  const fok = fs && fs !== "loading" && fs.online ? fs : null;
  const play = (address: string) => launchInstallation(app, app.selected, address);
  const copy = (a: string) => navigator.clipboard?.writeText(a).then(() => app.notify("Address copied."), () => {});

  return (
    <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="st" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h1 className="t-display" style={{ flex: 1 }}>Servers</h1>
        <label className="search" style={{ width: 260 }}><Search size={16} /><input placeholder="Search servers" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search servers" /></label>
        <button className="ibtn grey" style={{ width: 40, height: 40 }} aria-label="Refresh status" disabled={!inApp} onClick={pingAll}><RefreshCw size={16} /></button>
        <button className="btn green" style={{ height: 40 }} onClick={() => addServerDialog(app)}><Plus size={16} />Add server</button>
      </div>
      {featured && (
        <section className="cover st sv-hero" style={{ ["--i" as string]: 1 }}>
          <div className="art" style={{ backgroundImage: `url(${bannerOf(featured.address)})` }} />
          <div className="scrim" />
          <div style={{ position: "absolute", left: 24, top: 24, display: "flex", alignItems: "center", gap: 14 }}>
            <ServerLogo s={featured} favicon={fok?.favicon} size={56} />
            <div>
              <h2 className="shadowtext" style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.4 }}>{featured.name}</h2>
              <div className="t-small shadowtext" style={{ color: "#d7dce3", marginTop: 2 }}>{featured.address}{fok?.version ? ` · ${fok.version}` : ""}</div>
            </div>
          </div>
          <div style={{ position: "absolute", left: 24, bottom: 22, display: "flex", gap: 36 }} className="shadowtext">
            <span className="stat"><b>{!inApp ? "—" : fs === "loading" || !fs ? "…" : fok ? (fok.playersOnline ?? 0).toLocaleString() : "Offline"}</b><span>{fok || !inApp || fs === "loading" ? "playing now" : "not responding"}</span></span>
            {fok?.pingMs != null && <span className="stat"><b style={{ display: "flex", alignItems: "flex-end", gap: 8, color: fok.pingMs < 100 ? "var(--accent-text)" : fok.pingMs < 250 ? "var(--warn)" : "var(--danger)" }}><Bars ms={fok.pingMs} big />{fok.pingMs} ms</b><span>{quality(fok.pingMs)}</span></span>}
          </div>
          <div style={{ position: "absolute", right: 24, bottom: 22, display: "flex", gap: 8 }}>
            <button className="ibtn solid" style={{ width: 40, height: 40 }} aria-label="Copy address" onClick={() => copy(featured.address)}><Copy size={16} /></button>
            <button className="cta" onClick={() => play(featured.address)}>PLAY {featured.name.toUpperCase().slice(0, 12)}</button>
          </div>
        </section>
      )}
      <span className="sec-label st" style={{ ["--i" as string]: 2 }}>Your servers</span>
      <div className="sv-grid st" style={{ ["--i" as string]: 3 }}>
        {list.map((s) => <ServerCard key={s.id} s={s} st={status[s.id]} onPlay={() => play(s.address)} onCopy={() => copy(s.address)} />)}
        <button className="sv-add" onClick={() => addServerDialog(app)}><b style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus size={15} />Add a server</b><span className="t-cap">Paste an address like play.example.net</span></button>
      </div>
      <span className="t-cap">{inApp ? "Status comes straight from each server. Play starts the selected installation and joins automatically." : "Live status runs in the Kestrel desktop app."}</span>
    </div>
  );
}

function ServerCard({ s, st, onPlay, onCopy }: { s: Server; st: ServerStatus | "loading" | undefined; onPlay: () => void; onCopy: () => void }) {
  const app = useApp();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(menu, () => setMenu(false), ref);
  const ok = st && st !== "loading" && st.online ? st : null;
  const offline = inApp && st && st !== "loading" && !st.online;
  return (
    <div className="sv-card">
      <div className="sv-banner" style={{ backgroundImage: `url(${bannerOf(s.address)})` }} />
      <div className="sv-more" ref={ref}>
        <button className="ibtn solid sm" aria-label={`More for ${s.name}`} aria-expanded={menu} onClick={() => setMenu((m) => !m)}><MoreHorizontal size={15} /></button>
        {menu && (
          <div className="menu" role="menu" style={{ right: 0, top: 36 }}>
            <button className="mi" role="menuitem" onClick={() => { onCopy(); setMenu(false); }}><Copy size={15} />Copy address</button>
            <button className="mi danger" role="menuitem" onClick={() => { setMenu(false); confirmDialog(app, { title: `Remove ${s.name}?`, text: "It disappears from your saved servers and Home.", confirm: "Remove", danger: true, onConfirm: () => app.removeServer(s.id) }); }}><Trash2 size={15} />Remove</button>
          </div>
        )}
      </div>
      <div className="sv-head">
        <ServerLogo s={s} favicon={ok?.favicon} size={44} />
        <span style={{ minWidth: 0, paddingBottom: 1 }}><b className="t-heading" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</b><span className="t-cap" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.address}</span></span>
      </div>
      <div className="sv-foot">
        {offline ? <span><b style={{ color: "var(--warn)" }}>Offline</b><span className="lab">Not responding right now</span></span> : <>
          <span><b>{!inApp ? "—" : st === "loading" || !st ? <span className="spinner" style={{ display: "inline-block" }} /> : (ok?.playersOnline ?? 0).toLocaleString()}</b><span className="lab">playing</span></span>
          <span><b style={{ display: "flex", alignItems: "flex-end", gap: 6, fontSize: 13, lineHeight: "24px", color: ok?.pingMs == null ? "var(--text3)" : ok.pingMs < 100 ? "var(--accent-text)" : ok.pingMs < 250 ? "var(--warn)" : "var(--danger)" }}><Bars ms={ok?.pingMs} />{ok?.pingMs != null ? `${ok.pingMs} ms` : "—"}</b><span className="lab">ping</span></span>
        </>}
        <button className="btn green sm" style={{ marginLeft: "auto" }} disabled={!!offline} onClick={onPlay}>Play</button>
      </div>
    </div>
  );
}

function ServerLogo({ s, favicon, size }: { s: Server; favicon?: string; size: number }) {
  const src = favicon ?? (isHypixel(s.address) ? "/assets/imgHypixelOfficialLogo.png" : null);
  if (src) return <span className="sv-tile" style={{ width: size, height: size, backgroundImage: `url(${src})`, backgroundSize: favicon ? "cover" : "contain", backgroundRepeat: "no-repeat", backgroundColor: favicon ? undefined : "transparent", boxShadow: favicon ? undefined : "none", imageRendering: favicon ? "pixelated" : "auto" }} />;
  return <span className="sv-tile" style={{ width: size, height: size, background: tileColor(s.name) }}>{s.name.trim()[0]?.toUpperCase() ?? <ServerIcon size={18} />}</span>;
}

export function addServerDialog(app: AppState) {
  app.openDialog({ title: "Add server", sub: "Shows on Home with live player counts.", icon: <ServerIcon size={18} />, body: <AddServer app={app} /> });
}
function AddServer({ app }: { app: AppState }) {
  const [name, setName] = useState(""), [addr, setAddr] = useState("");
  const clean = addr.trim();
  const valid = /^[a-z0-9.-]+\.[a-z0-9.-]+(:\d{1,5})?$/i.test(clean);
  return (
    <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={(e) => { e.preventDefault(); if (!valid) return; app.addServer({ id: Date.now().toString(36), name: name.trim() || clean, address: clean }); app.closeDialog(); app.notify("Server saved."); }}>
      <label>Address<input className="field on-surface" autoFocus value={addr} maxLength={120} onChange={(e) => setAddr(e.target.value)} placeholder="play.example.net" />{addr && !valid && <span style={{ color: "var(--danger)", fontWeight: 400 }}>Enter an address like play.example.net or play.example.net:25565</span>}</label>
      <label><span>Name <span style={{ color: "var(--text3)", fontWeight: 400 }}>(optional)</span></span><input className="field on-surface" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={clean || "My server"} /></label>
      <div className="actions" style={{ marginTop: 6 }}><button type="button" className="btn ghost" onClick={app.closeDialog}>Cancel</button><button className="btn green" disabled={!valid}><Plus size={16} />Add server</button></div>
    </form>
  );
}
