import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AlertTriangle, ArrowDownToLine, Check, Circle, Copy, Download, FileText, FolderOpen, History, Minus, Radio, Search, Square as StopIcon, SkipForward, X } from "lucide-react";
import { api, inApp, onMission, onStats, type LaunchRecord, type MissionEvent } from "../lib/api";
import { useDismiss } from "../components/ui";

type Step = { id: string; label: string; status: string; detail: string };
type Line = { time: string; level: string; text: string };
type Snap = { title: string; state: string; detail: string; steps: Step[]; lines: Line[]; started: number | null; instanceId: string | null };
const STATE_LABEL: Record<string, [string, string]> = {
  idle: ["Waiting for a launch", "var(--text3)"], preparing: ["Preparing", "var(--info)"], running: ["Minecraft running", "var(--accent-text)"],
  blocked: ["Needs sign-in", "var(--warn)"], failed: ["Failed", "var(--danger)"], crashed: ["Crashed", "var(--danger)"], exited: ["Stopped", "var(--text2)"],
};
const EMPTY: Snap = { title: "No launch yet", state: "idle", detail: "Press Launch in Kestrel to start.", steps: [], lines: [], started: null, instanceId: null };

function reduce(s: Snap, e: MissionEvent): Snap {
  switch (e.kind) {
    case "reset": return { ...EMPTY, title: e.label ?? "Launch", state: "preparing", detail: "", started: Date.now() };
    case "step": {
      const st = { id: e.step!, label: e.label ?? "", status: e.status ?? "pending", detail: e.detail ?? "" };
      return { ...s, steps: s.steps.some((x) => x.id === st.id) ? s.steps.map((x) => (x.id === st.id ? st : x)) : [...s.steps, st] };
    }
    case "log": {
      const m = /Game folder: .*instances\\([a-z0-9-]+)/.exec(e.line ?? "");
      return { ...s, lines: [...s.lines.slice(-4000), { time: e.time, level: e.level ?? "info", text: e.line ?? "" }], instanceId: m ? m[1] : s.instanceId };
    }
    case "state": return { ...s, state: e.status ?? "idle", detail: e.detail ?? "" };
  }
  return s;
}

type Sample = { cpu: number; mem: number };
const CORES = Math.max(1, navigator.hardwareConcurrency || 1);

export function Mission() {
  const [live, dispatch] = useReducer(reduce, EMPTY);
  const [hist, setHist] = useState<{ rec: LaunchRecord; snap: Snap } | null>(null);
  const [filter, setFilter] = useState<"all" | "warn" | "error">("all");
  const [q, setQ] = useState("");
  const [follow, setFollow] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const v = hist?.snap ?? live;

  useEffect(() => {
    document.title = "Kestrel · Launch Control";
    if (!inApp) { dispatch({ kind: "log", level: "warn", line: "Launch Control runs in the Kestrel desktop app.", time: "" }); return; }
    let un: (() => void) | undefined, unStats: (() => void) | undefined;
    api.missionSnapshot().then((evs) => evs.forEach(dispatch)).finally(() => {
      onMission((e) => { if (e.kind === "reset") { setSamples([]); setHist(null); } dispatch(e); }).then((f) => (un = f));
    });
    onStats((s) => setSamples((l) => [...l.slice(-89), { cpu: Math.min(100, s.cpu / CORES), mem: s.memoryMb }])).then((f) => (unStats = f));
    return () => { un?.(); unStats?.(); };
  }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (follow && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [v.lines, follow, filter, q]);

  const shown = useMemo(() => v.lines.filter((l) => (filter === "all" || l.level === filter || (filter === "warn" && l.level === "error")) && (!q || l.text.toLowerCase().includes(q.toLowerCase()))), [v.lines, filter, q]);
  const counts = useMemo(() => ({ warn: v.lines.filter((l) => l.level === "warn").length, error: v.lines.filter((l) => l.level === "error").length }), [v.lines]);
  const elapsed = !hist && v.started && (v.state === "running" || v.state === "preparing") ? Math.floor((now - v.started) / 1000) : null;
  const [label, color] = STATE_LABEL[v.state] ?? STATE_LABEL.idle;
  const win = inApp ? getCurrentWindow() : null;
  const javaFailed = !hist && v.steps.some((s) => s.id === "java" && s.status === "failed");
  const openPast = async (rec: LaunchRecord) => {
    try { const evs = await api.readLaunch(rec.file); setHist({ rec, snap: evs.reduce(reduce, EMPTY) }); setFollow(true); } catch { /* file was cleaned up */ }
  };

  return (
    <div className="app mission">
      <header className="titlebar">
        <div className="brand" style={{ pointerEvents: "none" }}><img src="/assets/imgKestrelOriginalWhiteBird.svg" alt="" />{!hist && live.state === "running" ? "MINECRAFT RUNNING" : "LAUNCH CONTROL"}</div>
        <div className="drag" onMouseDown={(e) => { if (e.button === 0 && e.detail === 1) win?.startDragging(); }} />
        <div className="winctl">
          <button aria-label="Minimize" onClick={() => win?.minimize()}><Minus size={14} /></button>
          <button className="close" aria-label="Close Launch Control" onClick={() => (win ? win.close() : window.close())}><X size={15} /></button>
        </div>
      </header>
      <main className="mpanel">
        <section className="mhead">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="t-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title}</h1>
            <div className="t-small" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, minWidth: 0 }}>
              <span className="statedot" style={{ background: color, boxShadow: !hist && (v.state === "running" || v.state === "preparing") ? `0 0 0 4px color-mix(in srgb, ${color} 25%, transparent)` : "none" }} />
              <span style={{ color, flex: "none" }}>{label}</span>
              <span className="faint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {hist ? `· ${new Date(hist.rec.time * 1000).toLocaleString()}` : `· ${v.state === "crashed" ? "See below" : v.detail}${elapsed != null ? ` · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}` : ""}`}
              </span>
            </div>
          </div>
          {hist && <button className="btn" onClick={() => setHist(null)}><Radio size={15} />Back to live</button>}
          <HistoryMenu onPick={openPast} current={hist?.rec.file} />
          {javaFailed && <button className="btn green" disabled={busy} onClick={() => { setBusy(true); api.installJava().finally(() => setBusy(false)); }}><Download size={15} />Get Java 8</button>}
          <button className="btn" disabled={!v.instanceId} onClick={() => v.instanceId && api.openFolder("instance", v.instanceId)}><FolderOpen size={15} />Game folder</button>
          {!hist && <button className="btn danger" disabled={live.state !== "running"} onClick={() => api.stopGame()}><StopIcon size={13} />Stop</button>}
        </section>
        <div className="mbody">
          <aside className="msteps">
            <span className="t-cap" style={{ fontWeight: 500 }}>Launch steps</span>
            {v.steps.length === 0 && <span className="t-cap">Steps appear when a launch starts.</span>}
            {v.steps.map((s, i) => (
              <div key={s.id} className={"mstep " + s.status}>
                <span className="micon">{s.status === "done" ? <Check size={13} /> : s.status === "failed" ? <X size={13} /> : s.status === "skipped" ? <SkipForward size={12} /> : s.status === "running" ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Circle size={8} />}</span>
                <div style={{ minWidth: 0 }}><b className="t-strong">{i + 1}. {s.label}</b>{s.detail && <p className="t-cap" style={{ overflowWrap: "anywhere" }}>{s.detail}</p>}</div>
              </div>
            ))}
            {!hist && samples.length > 1 && <Usage samples={samples} />}
          </aside>
          <section className="mconsole">
            <div className="mtools">
              <div className="seg">
                {([["all", "All"], ["warn", `Warnings${counts.warn + counts.error ? ` ${counts.warn + counts.error}` : ""}`], ["error", `Errors${counts.error ? ` ${counts.error}` : ""}`]] as const).map(([val, l]) => (
                  <button key={val} className={filter === val ? "on" : ""} style={filter === val ? { background: "var(--control)" } : undefined} onClick={() => setFilter(val)}>{l}</button>
                ))}
              </div>
              <label className="search" style={{ flex: 1, height: 34 }}><Search size={15} /><input placeholder="Filter output" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter output" /></label>
              <button className={"ibtn sm" + (follow ? " grey" : "")} aria-pressed={follow} aria-label="Follow output" title="Follow output" onClick={() => setFollow((f) => !f)}><ArrowDownToLine size={15} /></button>
              <button className="ibtn sm" aria-label="Copy output" title="Copy output" onClick={() => navigator.clipboard?.writeText(shown.map((l) => `[${l.time}] ${l.text}`).join("\n"))}><Copy size={15} /></button>
              <button className="ibtn sm" aria-label="Open logs folder" title="Open logs folder" disabled={!inApp} onClick={() => api.openFolder("logs")}><FileText size={15} /></button>
            </div>
            {v.state === "crashed" && (
              <div className="mcrash" role="alert"><AlertTriangle size={16} /><div><b>Minecraft crashed.</b> {v.detail}</div></div>
            )}
            <div className="mlog mono" ref={logRef} onScroll={(e) => { const el = e.currentTarget; const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24; if (!atBottom && follow) setFollow(false); }}>
              {shown.length === 0 && <span className="faint">{v.lines.length ? "Nothing matches the filter." : "Console output appears here."}</span>}
              {shown.map((l, i) => (
                <div key={i} className={"ml " + l.level}>
                  <span className="faint">{l.time}</span>
                  {l.level === "warn" || l.level === "error" ? <AlertTriangle size={12} /> : <span style={{ width: 12 }} />}
                  <span className="mt">{l.text}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/** Live memory and CPU of the running game, last 90 seconds. */
function Usage({ samples }: { samples: Sample[] }) {
  const last = samples[samples.length - 1];
  const memMax = Math.max(512, ...samples.map((s) => s.mem)) * 1.15;
  const path = (vals: number[], max: number) => vals.map((x, i) => `${(i / (vals.length - 1)) * 100},${40 - (x / max) * 38}`).join(" ");
  const Graph = ({ vals, max, stroke }: { vals: number[]; max: number; stroke: string }) => (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
      <polyline points={`0,40 ${path(vals, max)} 100,40`} fill={stroke} fillOpacity=".12" stroke="none" />
      <polyline points={path(vals, max)} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
  return (
    <div className="mgraph">
      <div className="mg-row"><span className="t-cap">Memory</span><b className="t-small">{last.mem >= 1024 ? `${(last.mem / 1024).toFixed(2)} GB` : `${last.mem} MB`}</b></div>
      <Graph vals={samples.map((s) => s.mem)} max={memMax} stroke="#8FC9FF" />
      <div className="mg-row" style={{ marginTop: 6 }}><span className="t-cap">CPU</span><b className="t-small">{Math.round(last.cpu)}%</b></div>
      <Graph vals={samples.map((s) => s.cpu)} max={100} stroke="#50D581" />
    </div>
  );
}

function HistoryMenu({ onPick, current }: { onPick: (r: LaunchRecord) => void; current?: string }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<LaunchRecord[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  useEffect(() => { if (open && inApp) api.listLaunches().then(setList).catch(() => setList([])); }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn" aria-haspopup="menu" aria-expanded={open} disabled={!inApp} onClick={() => setOpen((o) => !o)}><History size={15} />History</button>
      {open && (
        <div className="menu" role="menu" style={{ top: 44, right: 0, width: 340, maxHeight: 380, overflowY: "auto" }}>
          {list === null && <span className="t-cap" style={{ padding: 10 }}>Loading…</span>}
          {list?.length === 0 && <span className="t-cap" style={{ padding: 10, display: "block" }}>No launches yet. The last 30 are kept.</span>}
          {list?.map((r) => {
            const [l, c] = STATE_LABEL[r.status] ?? STATE_LABEL.idle;
            return (
              <button key={r.file} role="menuitem" className={"mi" + (current === r.file ? " active" : "")} style={{ alignItems: "flex-start" }} onClick={() => { onPick(r); setOpen(false); }}>
                <span className="statedot" style={{ background: c, marginTop: 6 }} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title || "Launch"}</span>
                  <span className="t-cap" style={{ fontWeight: 400 }}>{new Date(r.time * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {l}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
