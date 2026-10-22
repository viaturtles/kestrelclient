import { useEffect, useState } from "react";
import { Copy, Plus, RefreshCw, Search, Trash2, Server as ServerIcon } from "lucide-react";
import { api, inApp, type ServerStatus } from "../lib/api";
import { errText, useApp, type AppState } from "../lib/store";
import { launchInstallation } from "../lib/launch";
import { confirmDialog } from "../components/ui";

const isHypixel = (a: string) => /(^|\.)hypixel\.net(:\d+)?$/i.test(a);

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
  const list = app.servers.filter((s) => (s.name + s.address).toLowerCase().includes(q.trim().toLowerCase()));
  const featured = app.servers[0];
  const fs = featured ? status[featured.id] : undefined;
  const play = (address: string) => launchInstallation(app, app.selected, address);
  const copy = (a: string) => navigator.clipboard?.writeText(a).then(() => app.notify("Address copied."), () => {});

  return (
    <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="st" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h1 className="t-display" style={{ flex: 1 }}>Servers</h1>
        <label className="search" style={{ width: 280 }}><Search size={16} /><input placeholder="Search servers" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search servers" /></label>
        <button className="ibtn grey" style={{ width: 40, height: 40 }} aria-label="Refresh status" disabled={!inApp} onClick={pingAll}><RefreshCw size={16} /></button>
        <button className="btn green" style={{ height: 40 }} onClick={() => addServerDialog(app)}><Plus size={16} />Add server</button>
      </div>
      {featured && (
        <section className="cover st" style={{ height: 220, ["--i" as string]: 1 }}>
          <div className="art" style={{ backgroundImage: `url(${isHypixel(featured.address) ? "/assets/imgHypixelBackground1.png" : "/assets/v3/bsl.jpg"})` }} />
          <div className="scrim" />
          <div style={{ position: "absolute", left: 28, bottom: 28, display: "flex", alignItems: "center", gap: 16 }}>
            <ServerLogo address={featured.address} favicon={fs && fs !== "loading" ? fs.favicon : undefined} size={64} />
            <div>
              <h2 className="shadowtext" style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>{featured.name}</h2>
              <div className="t-small shadowtext" style={{ color: "#e3e7ec", marginTop: 4 }}>{featured.address} · {statusText(fs)}</div>
            </div>
          </div>
          <div style={{ position: "absolute", right: 28, bottom: 28, display: "flex", gap: 8 }}>
            <button className="ibtn solid" style={{ width: 40, height: 40 }} aria-label="Copy address" onClick={() => copy(featured.address)}><Copy size={16} /></button>
            <button className="plain" onClick={() => play(featured.address)}>PLAY {featured.name.toUpperCase().slice(0, 9)}</button>
          </div>
        </section>
      )}
      <h2 className="t-title st" style={{ ["--i" as string]: 2 }}>Your servers</h2>
      <div className="st" style={{ ["--i" as string]: 3 }}>
        <div className="srow head t-cap"><span>Server</span><span>Players</span><span>Ping</span><span>Version</span><span /></div>
        {list.map((s) => {
          const st = status[s.id];
          const ok = st && st !== "loading" && st.online ? st : null;
          return (
            <div key={s.id} className="srow">
              <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <ServerLogo address={s.address} favicon={ok?.favicon} size={40} />
                <span style={{ minWidth: 0 }}><b className="t-strong" style={{ display: "block" }}>{s.name}</b><span className="t-cap" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ok?.motd ?? s.address}</span></span>
              </span>
              <span className="muted">{st === "loading" ? <span className="spinner" /> : ok ? `${(ok.playersOnline ?? 0).toLocaleString()} / ${(ok.playersMax ?? 0).toLocaleString()}` : "—"}</span>
              <span className="muted">{ok?.pingMs != null ? `${ok.pingMs} ms` : "—"}</span>
              <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ok?.version ?? (st && st !== "loading" ? <span style={{ color: "var(--warn)" }}>{inApp ? "Offline" : "—"}</span> : "—")}</span>
              <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button className="ibtn sm" aria-label={`Copy ${s.name} address`} onClick={() => copy(s.address)}><Copy size={14} /></button>
                <button className="ibtn sm" aria-label={`Remove ${s.name}`} onClick={() => confirmDialog(app, { title: `Remove ${s.name}?`, text: "It's removed from your saved servers.", confirm: "Remove", danger: true, onConfirm: () => app.removeServer(s.id) })}><Trash2 size={14} /></button>
                <button className="btn sm" onClick={() => play(s.address)}>Play</button>
              </span>
            </div>
          );
        })}
        {!list.length && <div className="empty" style={{ marginTop: 8 }}><ServerIcon size={22} /><b>No servers</b><span>Add a server to see its status and join it in one click.</span></div>}
      </div>
      <span className="t-cap">{inApp ? "Status comes straight from each server. Play starts the selected installation and joins automatically." : "Live status runs in the Kestrel desktop app."}</span>
    </div>
  );
}

function statusText(s: ServerStatus | "loading" | undefined) {
  if (!inApp) return "Status in the desktop app";
  if (!s || s === "loading") return "Checking…";
  if (!s.online) return "Offline";
  return `${(s.playersOnline ?? 0).toLocaleString()} playing${s.pingMs != null ? ` · ${s.pingMs} ms` : ""}`;
}

function ServerLogo({ address, favicon, size }: { address: string; favicon?: string; size: number }) {
  const src = favicon ?? (isHypixel(address) ? "/assets/imgHypixelOfficialLogo.png" : null);
  return src ? <img src={src} alt="" style={{ width: size, height: size, objectFit: "contain", borderRadius: 8, imageRendering: favicon ? "pixelated" : "auto" }} />
    : <span style={{ width: size, height: size, borderRadius: 8, background: "var(--hover)", display: "grid", placeItems: "center", color: "var(--text3)", flex: "none" }}><ServerIcon size={size / 2.4} /></span>;
}

export function addServerDialog(app: AppState) {
  app.openDialog({ title: "Add server", body: <AddServer app={app} /> });
}
function AddServer({ app }: { app: AppState }) {
  const [name, setName] = useState(""), [addr, setAddr] = useState("");
  const clean = addr.trim();
  const valid = /^[a-z0-9.-]+\.[a-z0-9.-]+(:\d{1,5})?$/i.test(clean);
  return (
    <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={(e) => { e.preventDefault(); if (!valid) return; app.addServer({ id: Date.now().toString(36), name: name.trim() || clean, address: clean }); app.closeDialog(); app.notify("Server saved."); }}>
      <label>Name<input className="field on-surface" autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="My server" /></label>
      <label>Address<input className="field on-surface" value={addr} maxLength={120} onChange={(e) => setAddr(e.target.value)} placeholder="play.example.net" />{addr && !valid && <span style={{ color: "var(--danger)" }}>Enter an address like play.example.net or play.example.net:25565</span>}</label>
      <div className="actions"><button type="button" className="btn ghost" onClick={app.closeDialog}>Cancel</button><button className="btn green" disabled={!valid}><Plus size={16} />Save server</button></div>
    </form>
  );
}
