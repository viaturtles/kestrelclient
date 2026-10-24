import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronRight, Clock, Folder, Globe, GripVertical, Image as ImageIcon, Keyboard, List, Newspaper, Play, Plus, Puzzle, SlidersHorizontal, Users, X } from "lucide-react";
import { useApp, type AppState, type HistoryItem, type Route } from "../lib/store";
import { launchInstallation } from "../lib/launch";
import { api, fileUrl, inApp, type ContentFile, type PlayStats, type ServerStatus } from "../lib/api";
import { POSTS } from "./Updates";
import { friendHead, friendStatus, useFriends } from "./Friends";

// ---------------- Home v6 widgets (Figma "Kestrel / Home v6") ----------------

/** Widgets a player can put on Home, in picker order. The tour isn't one: it shows by itself for new players. */
const WIDGETS = [
  { id: "week", title: "This week", detail: "Play time and sessions", icon: Clock },
  { id: "featured", title: "Featured server", detail: "Your top server, live", icon: Globe },
  { id: "news", title: "What's new", detail: "Latest Kestrel news", icon: Newspaper },
  { id: "jump", title: "Jump back in", detail: "Worlds and servers", icon: Play },
  { id: "servers", title: "Your servers", detail: "Live counts for your list", icon: List },
  { id: "shots", title: "Latest screenshots", detail: "Your last few F2 shots", icon: ImageIcon },
  { id: "friends", title: "Friends online", detail: "Who's playing right now", icon: Users },
] as const;
type WidgetId = (typeof WIDGETS)[number]["id"];
const DEFAULT: WidgetId[] = ["week", "featured", "news", "jump", "servers", "shots"];
const MAX = 6;
const KEY = "kestrel.homeWidgets";
const readWidgets = (): WidgetId[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (Array.isArray(v)) return v.filter((x) => WIDGETS.some((w) => w.id === x && !("soon" in w))).slice(0, MAX);
  } catch { /* private mode */ }
  return DEFAULT;
};

/** The "Get to know Kestrel" tour: each step just opens a page. Remembered on this PC. */
const TOUR_KEY = "kestrel.tour";
export const TOUR_HIDDEN = "kestrel.tourHidden";
export const readTour = (): string[] => { try { return JSON.parse(localStorage.getItem(TOUR_KEY) ?? "[]"); } catch { return []; } };
export const tourHidden = () => { try { return localStorage.getItem(TOUR_HIDDEN) === "1"; } catch { return false; } };

/** Hand-picked servers that run well on 1.8.9 (shown until you've added your own). */
const PICKS = [
  { name: "Hypixel", address: "mc.hypixel.net", detail: "Bed Wars, SkyWars, Duels" },
  { name: "Minemen Club", address: "minemen.club", detail: "PvP practice" },
  { name: "PvP Land", address: "pvp.land", detail: "Duels and FFA" },
  { name: "BlocksMC", address: "blocksmc.com", detail: "Bed Wars" },
];
const isHypixel = (a: string) => /(^|\.)hypixel\.net(:\d+)?$/i.test(a);
const TILE = ["#7d4bd1", "#c23b32", "#2a7cc4", "#1f7a63", "#d0661c"];
const tileColor = (s: string) => TILE[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % TILE.length];

/** "2h ago", "Yesterday", "Oct 18". */
function ago(ms: number) {
  const m = (Date.now() - ms) / 60000;
  if (m < 1) return "just now";
  if (m < 60) return `${Math.floor(m)}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  if (m < 2880) return "yesterday";
  return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Live status for a few addresses, refreshed every minute. */
function usePings(addresses: string[]) {
  const [status, setStatus] = useState<Record<string, ServerStatus | null>>({});
  const key = addresses.join();
  useEffect(() => {
    if (!inApp || !addresses.length) return;
    const ping = () => addresses.forEach((a) => api.pingServer(a).then((r) => setStatus((x) => ({ ...x, [a]: r }))).catch(() => setStatus((x) => ({ ...x, [a]: { online: false } }))));
    ping();
    const t = setInterval(ping, 60000);
    return () => clearInterval(t);
  }, [key]);
  return status;
}
const line = (st: ServerStatus | null | undefined, fallback: string) =>
  !inApp ? fallback : st === undefined ? "Checking…" : st?.online ? `${(st.playersOnline ?? 0).toLocaleString()} playing${st.pingMs != null ? ` · ${st.pingMs} ms` : ""}` : "Offline";

function Head({ title, right }: { title: string; right?: React.ReactNode }) {
  return <div className="w-head"><span>{title}</span>{right}</div>;
}

// ---------------- the widgets ----------------

function Week() {
  const app = useApp();
  const [stats, setStats] = useState<Record<string, PlayStats> | null>(null);
  useEffect(() => { if (inApp) api.playStats().then(setStats).catch(() => setStats({})); else setStats({}); }, []);
  const today = Math.floor(Date.now() / 86_400_000);
  const all = Object.values(stats ?? {});
  const day = (d: number) => all.reduce((n, s) => n + (s.days?.[String(d)] ?? 0), 0);
  const week = Array.from({ length: 7 }, (_, i) => day(today - 6 + i));
  const total = week.reduce((a, b) => a + b, 0), before = Array.from({ length: 7 }, (_, i) => day(today - 13 + i)).reduce((a, b) => a + b, 0);
  const max = Math.max(...week, 1);
  const fmt = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };
  const most = Object.entries(stats ?? {}).sort((a, b) => b[1].seconds - a[1].seconds)[0];
  const mostName = most ? app.installations.find((i) => i.id === most[0])?.name : undefined;
  const letters = ["S", "M", "T", "W", "T", "F", "S"];
  const sessions = all.reduce((n, s) => n + s.sessions, 0);
  return (
    <>
      <Head title="This week" />
      <div style={{ display: "flex", gap: 12, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b className="w-big">{stats === null ? "…" : fmt(total)}</b>
          <span className={"w-diff" + (total > 0 && total >= before ? " up" : "")}>
            {stats === null ? "" : total === 0 ? "Play a game to start your week" : total >= before ? `▲ ${fmt(total - before)} more than last week` : `${fmt(before - total)} less than last week`}
          </span>
        </div>
        <div className="w-bars">
          {week.map((v, i) => (
            <div key={i} title={fmt(v)}>
              <span className="w-track"><i className={i === 6 ? "today" : ""} style={{ height: `${Math.max(v ? 8 : 0, (v / max) * 100)}%` }} /></span>
              <em className={i === 6 ? "today" : ""}>{letters[new Date((today - 6 + i) * 86_400_000).getUTCDay()]}</em>
            </div>
          ))}
        </div>
      </div>
      <div className="w-foot ell"><b>{sessions} session{sessions === 1 ? "" : "s"}</b>{mostName ? `  ·  ${mostName} most played` : ""}{all.length ? `  ·  ${fmt(Math.max(0, ...all.map((s) => s.longest)))} longest` : ""}</div>
    </>
  );
}

function Featured() {
  const app = useApp();
  const s = app.servers[0] ?? PICKS[0];
  const st = usePings([s.address])[s.address];
  const fav = st?.favicon ?? (isHypixel(s.address) ? "/assets/imgHypixelOfficialLogo.png" : null);
  return (
    <div className="w-art" style={{ backgroundImage: `url(${isHypixel(s.address) ? "/assets/imgHypixelBackground1.png" : "/assets/brand/server-banner.png"})` }}>
      <Head title="Featured server" />
      <div className="w-feat-row">
        {fav ? <span className="w-logo" style={{ backgroundImage: `url(${fav})`, imageRendering: st?.favicon ? "pixelated" : undefined }} />
          : <span className="w-logo letter" style={{ background: tileColor(s.name) }}>{s.name[0]}</span>}
        <span style={{ flex: 1, minWidth: 0 }}><b className="ell" style={{ fontSize: 16 }}>{s.name}</b><span className={"ell t-small" + (st?.online ? " live" : "")}>{line(st, s.address)}</span></span>
        <button className="btn green sm" disabled={inApp && st !== undefined && !st?.online} onClick={() => launchInstallation(app, app.selected, s.address)}><Play size={12} />Join</button>
      </div>
    </div>
  );
}

function News() {
  const app = useApp();
  const post = POSTS[0];
  return (
    <button className="w-news" onClick={() => app.navigate({ name: "updates" })}>
      <span className="w-news-art" style={{ backgroundImage: `url(${post.art})` }} />
      <span className="w-news-tx">
        <span className="w-kick">{post.tag} · {post.date}</span>
        <b>{post.title}</b>
        <span className="w-clamp">{post.body}</span>
        <span className="w-more">Read more <ChevronRight size={13} /></span>
      </span>
    </button>
  );
}

function Jump({ history, onPlay }: { history: HistoryItem[]; onPlay: (h: HistoryItem) => void }) {
  return (
    <>
      <Head title="Jump back in" />
      {history.length === 0 ? <p className="w-empty">Worlds and servers you play show up here.</p> : (
        <div className="w-rows">
          {history.slice(0, 2).map((h) => (
            <div key={h.kind + (h.serverAddress ?? h.folder ?? h.name)} className="w-row boxed">
              <span className="w-thumb" style={{ backgroundImage: `url(${h.icon ?? (isHypixel(h.serverAddress ?? "") ? "/assets/imgHypixelOfficialLogo.png" : "/assets/brand/ph-saves.png")})`, imageRendering: h.icon ? "pixelated" : undefined, backgroundSize: !h.icon && isHypixel(h.serverAddress ?? "") ? "contain" : "cover" }} />
              <span style={{ flex: 1, minWidth: 0 }}><b className="t-strong ell">{h.name}</b><span className="t-cap ell">{h.kind === "world" ? h.detail : h.serverAddress} · {ago(h.at)}</span></span>
              <button className="btn green sm" onClick={() => onPlay(h)}><Play size={12} />Play</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ServerList() {
  const app = useApp();
  const mine = app.servers.slice(1, 4);
  const picks = mine.length === 0;
  const list = picks ? PICKS.filter((p) => !app.servers.some((s) => s.address.toLowerCase() === p.address)).slice(0, 3) : mine;
  const status = usePings(list.map((s) => s.address));
  return (
    <>
      <Head title={picks ? "Popular on 1.8.9" : "Your servers"} right={<button className="link" onClick={() => app.navigate({ name: "servers" })}>All servers<ChevronRight size={13} /></button>} />
      <div className="w-rows">
        {list.map((s) => {
          const st = status[s.address];
          return (
            <div key={s.address} className="w-row">
              {st?.favicon ? <span className="w-tile" style={{ backgroundImage: `url(${st.favicon})` }} /> : <span className="w-tile letter" style={{ background: tileColor(s.name) }}>{s.name[0]}</span>}
              <span style={{ flex: 1, minWidth: 0 }}><b className="t-strong ell">{s.name}</b><span className="t-cap ell" style={{ color: inApp && st && !st.online ? "var(--warn)" : undefined }}>{line(st, s.address)}</span></span>
              {picks ? <button className="btn sm" onClick={() => { app.addServer({ id: Date.now().toString(36), name: s.name, address: s.address }); app.notify(`${s.name} added to your servers.`); }}><Plus size={13} />Add</button>
                : <button className="btn sm" disabled={inApp && !!st && !st.online} onClick={() => launchInstallation(app, app.selected, s.address)}>Join</button>}
            </div>
          );
        })}
        {list.length === 0 && <p className="w-empty">Add servers on the Servers page.</p>}
      </div>
    </>
  );
}

function Shots() {
  const app = useApp();
  const inst = app.selected;
  const [files, setFiles] = useState<ContentFile[] | null>(null);
  useEffect(() => { if (!inApp) { setFiles([]); return; } api.listContent(inst.id, "screenshots").then((l) => setFiles([...l].sort((a, b) => b.modified - a.modified))).catch(() => setFiles([])); }, [inst.id]);
  const base = app.paths ? `${app.paths.instances}\\${inst.id}\\screenshots\\` : "";
  return (
    <>
      <Head title="Latest screenshots" right={<button className="link" onClick={() => app.navigate({ name: "installations", id: inst.id, tab: "Screenshots" })}>All<ChevronRight size={13} /></button>} />
      {files && files.length > 0 && base ? (
        <div className="w-shots">{files.slice(0, 3).map((f) => <span key={f.file} style={{ backgroundImage: `url("${fileUrl(base + f.file)}")` }} />)}</div>
      ) : <p className="w-empty">{files === null ? "…" : <>Press <kbd className="keycap">F2</kbd>in game. Shots from {inst.name} show up here.</>}</p>}
    </>
  );
}

function FriendsOnline() {
  const app = useApp();
  const [data] = useFriends();
  const on = (data?.friends ?? []).filter((f) => f.online).sort((a, b) => Number(b.playing) - Number(a.playing));
  return (
    <>
      <Head title="Friends online" right={<button className="link" onClick={() => app.navigate({ name: "friends" })}>{data?.incoming.length ? `${data.incoming.length} request${data.incoming.length === 1 ? "" : "s"}` : "All"}<ChevronRight size={13} /></button>} />
      {!app.me ? <p className="w-empty">Link Discord in Settings to see your friends here.</p>
        : data === null ? <p className="w-empty">…</p>
        : on.length === 0 ? <p className="w-empty">{data.friends.length ? "None of your friends are on right now." : "Add friends on the Friends page."}</p> : (
          <div className="w-rows">
            {on.slice(0, 3).map((f) => (
              <div key={f.id} className="w-row">
                <span className="w-tile" style={{ backgroundImage: `url(${friendHead(f)})`, imageRendering: "pixelated" }} />
                <span style={{ flex: 1, minWidth: 0 }}><b className="t-strong ell">{f.name}</b><span className={"t-cap ell" + (f.playing ? " live" : "")}>{friendStatus(f)}</span></span>
                {f.server && <button className="btn sm" onClick={() => launchInstallation(app, app.selected, f.server)}>Join</button>}
              </div>
            ))}
          </div>
        )}
    </>
  );
}

/** New players: the tour, compact, as the first widget until it's done or hidden. */
function Tour({ onHide }: { onHide: () => void }) {
  const app = useApp();
  const [seen, setSeen] = useState<string[]>(readTour);
  const steps: { id: string; icon: React.ReactNode; title: string; route: Route }[] = [
    { id: "installation", icon: <Folder size={15} />, title: "Your installation", route: { name: "installations", id: app.selected.id } },
    { id: "packs", icon: <Puzzle size={15} />, title: "Find resource packs", route: { name: "explore", type: "resourcepack" } },
    { id: "servers", icon: <Globe size={15} />, title: "Add your servers", route: { name: "servers" } },
    { id: "settings", icon: <SlidersHorizontal size={15} />, title: "Make Kestrel yours", route: { name: "settings", tab: "General" } },
    { id: "ingame", icon: <Keyboard size={15} />, title: "What Kestrel adds in game", route: { name: "updates" } },
  ];
  const done = steps.filter((s) => seen.includes(s.id)).length;
  const next = steps.filter((s) => !seen.includes(s.id)).slice(0, 2);
  const open = (s: typeof steps[number]) => {
    const n = seen.includes(s.id) ? seen : [...seen, s.id];
    try { localStorage.setItem(TOUR_KEY, JSON.stringify(n)); } catch { /* private mode */ }
    setSeen(n); app.navigate(s.route);
  };
  const r = 15, c = 2 * Math.PI * r;
  return (
    <>
      <Head title="Get to know Kestrel" right={<span className="hc-right">{done} of {steps.length}<button className="ibtn sm" aria-label="Hide the tour" title="Hide" onClick={onHide}><X size={13} /></button></span>} />
      <div className="w-rows">
        {next.map((s) => (
          <button key={s.id} className="w-row boxed" onClick={() => open(s)} style={{ textAlign: "left" }}>
            <span className="w-tile">{s.icon}</span><b className="t-strong" style={{ flex: 1 }}>{s.title}</b><ChevronRight size={15} color="var(--text3)" />
          </button>
        ))}
      </div>
      <svg className="w-ring" width="38" height="38" viewBox="0 0 38 38" aria-hidden="true">
        <circle cx="19" cy="19" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="4" />
        <circle cx="19" cy="19" r={r} fill="none" stroke="var(--accent)" strokeWidth="4" strokeDasharray={`${(done / steps.length) * c} ${c}`} transform="rotate(-90 19 19)" />
      </svg>
    </>
  );
}

// ---------------- grid + customize ----------------

export function HomeWidgets({ returning, onHideTour, history, onPlay }: { returning: boolean; onHideTour: () => void; history: HistoryItem[]; onPlay: (h: HistoryItem) => void }) {
  const app = useApp();
  const [chosen, setChosen] = useState<WidgetId[]>(readWidgets);
  const save = (w: WidgetId[]) => { setChosen(w); try { localStorage.setItem(KEY, JSON.stringify(w)); } catch { /* private mode */ } };
  // New players see the tour in the first slot until they finish or hide it.
  const shown: (WidgetId | "tour")[] = returning ? chosen : ["tour", ...chosen.slice(0, MAX - 1)];
  const body = (id: WidgetId | "tour") => {
    switch (id) {
      case "tour": return <Tour onHide={onHideTour} />;
      case "week": return <Week />;
      case "featured": return <Featured />;
      case "news": return <News />;
      case "jump": return <Jump history={history} onPlay={onPlay} />;
      case "servers": return <ServerList />;
      case "shots": return <Shots />;
      case "friends": return <FriendsOnline />;
      default: return null;
    }
  };
  // The grid has 6 columns; widths depend on how many widgets there are, so there are never gaps:
  // 6 → 3+3, 5 → 3+2 (the last two wider), 4 → 2+2, 3 or fewer → one row.
  const n = shown.length;
  const span = (i: number) => (n >= 6 ? 2 : n === 5 ? (i < 3 ? 2 : 3) : n === 4 ? 3 : 6 / Math.max(1, n));
  // Cards glide to their new spots when the layout changes (FLIP).
  const els = useRef(new Map<string, HTMLElement>());
  const last = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const reduce = document.documentElement.classList.contains("reduced") || app.settings.reducedMotion;
    els.current.forEach((el, id) => {
      const now = el.getBoundingClientRect(), before = last.current.get(id);
      if (before && !reduce && (before.left !== now.left || before.top !== now.top || before.width !== now.width)) {
        el.animate([{ transform: `translate(${before.left - now.left}px, ${before.top - now.top}px)` }, { transform: "none" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
      last.current.set(id, now);
    });
  }, [shown.join()]);
  return (
    <>
      <div className="st w-top" style={{ ["--i" as string]: 1 }}>
        <span className="sec-label">Your home</span>
        <button className="btn sm" onClick={() => customizeDialog(app, chosen, save)}><SlidersHorizontal size={13} />Customize</button>
      </div>
      <div className="w-grid" style={{ gridTemplateRows: n > 3 ? "1fr 1fr" : "1fr" }}>
        {shown.map((id, i) => (
          <section key={id} ref={(el) => { if (el) els.current.set(id, el); else els.current.delete(id); }} className={"st wcard wid-" + id}
            style={{ ["--i" as string]: i + 2, gridColumn: `span ${span(i)}` }}>{body(id)}</section>
        ))}
        {shown.length === 0 && <div className="w-none">Nothing on Home yet. Press Customize to add widgets.</div>}
      </div>
    </>
  );
}

function customizeDialog(app: AppState, chosen: WidgetId[], onSave: (w: WidgetId[]) => void) {
  app.openDialog({ title: "Customize Home", sub: `Pick up to ${MAX} widgets. Drag to change the order.`, icon: <SlidersHorizontal size={18} />, wide: true,
    body: <Customize initial={chosen} onCancel={app.closeDialog} onSave={(w) => { onSave(w); app.closeDialog(); }} /> });
}

function Customize({ initial, onCancel, onSave }: { initial: WidgetId[]; onCancel: () => void; onSave: (w: WidgetId[]) => void }) {
  const [order, setOrder] = useState<WidgetId[]>(initial);
  const [drag, setDrag] = useState<WidgetId | null>(null);
  const full = order.length >= MAX;
  // A widget turned (back) on goes first: top-left on Home, as the newest one.
  const toggle = (id: WidgetId) => setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : o.length >= MAX ? o : [id, ...o]));
  // Chosen widgets first, in their Home order (drag to reorder), then the rest.
  const rest = WIDGETS.filter((w) => !order.includes(w.id));
  const list = [...order.map((id) => WIDGETS.find((w) => w.id === id)!), ...rest];
  const over = (id: WidgetId) => {
    if (!drag || drag === id || !order.includes(id)) return;
    setOrder((o) => { const n = o.filter((x) => x !== drag); n.splice(n.indexOf(id) + (o.indexOf(drag) < o.indexOf(id) ? 1 : 0), 0, drag); return n; });
  };
  return (
    <>
      <div className="inset w-pick">
        {list.map((w) => {
          const on = order.includes(w.id), soon = "soon" in w;
          const Icon = w.icon;
          return (
            <button key={w.id} type="button" className={"w-opt" + (on ? " on" : "") + (drag === w.id ? " dragging" : "")} disabled={soon || (!on && full)}
              draggable={on} onDragStart={() => setDrag(w.id)} onDragEnd={() => setDrag(null)} onDragOver={(e) => { e.preventDefault(); over(w.id); }}
              onClick={() => toggle(w.id)}>
              {on ? <GripVertical size={14} className="w-grip" /> : <span style={{ width: 14 }} />}
              <span className="w-tile">{<Icon size={16} />}</span>
              <span style={{ flex: 1, minWidth: 0 }}><b className="t-strong ell">{w.title}</b><span className="t-cap ell">{w.detail}</span></span>
              <span className={"w-check" + (on ? " on" : "")}>{on && <Check size={12} strokeWidth={3} />}</span>
            </button>
          );
        })}
      </div>
      <p className="note">{order.length} of {MAX} chosen{full ? " · Turn one off to add another" : ""}</p>
      <div className="actions">
        <button type="button" className="link" onClick={() => setOrder(DEFAULT)}>Reset to default</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn green" onClick={() => onSave(order)}><Check size={15} />Save</button>
      </div>
    </>
  );
}
