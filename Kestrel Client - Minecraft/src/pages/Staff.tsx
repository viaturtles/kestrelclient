import { useEffect, useState } from "react";
import { Ban, Copy, Crown, RefreshCw, Search, Shield, ShieldCheck, Sparkles, Trash2, UserPlus, Users } from "lucide-react";
import { api, discordAvatar, type LogRow, type StaffMember, type StaffPlayer, type StaffPlayerRow, type StaffRole } from "../lib/api";
import { errText, useApp } from "../lib/store";
import { confirmDialog, Group, Row, Seg, Select } from "../components/ui";

/** Staff tools (Figma: to design). Only shown to staff; every action is checked again by Kestrel's service. */
const RANK: Record<StaffRole, number> = { mod: 1, admin: 2, owner: 3 };
const ROLE_LABEL: Record<StaffRole, string> = { mod: "Moderator", admin: "Admin", owner: "Owner" };
const date = (s: number) => new Date(s * 1000).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
const when = (s: number) => new Date(s * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const untilText = (u: number | null) => (u === null ? "forever" : `until ${date(u)}`);
const name = (p: { global_name?: string | null; username?: string | null; discord_id: string }) => p.global_name || p.username || p.discord_id;

function Avatar({ id, avatar, size = 36 }: { id: string; avatar?: string | null; size?: number }) {
  const src = discordAvatar(id, avatar);
  return src ? <img src={src} alt="" style={{ width: size, height: size, borderRadius: size / 4, flex: "none" }} />
    : <span style={{ width: size, height: size, borderRadius: size / 4, flex: "none", background: "var(--hover)", display: "grid", placeItems: "center", color: "var(--text3)" }}><Users size={size / 2.4} /></span>;
}

export function Staff({ tab }: { tab?: string }) {
  const app = useApp();
  const role = app.me?.role;
  const current = tab === "Staff" || tab === "Log" ? tab : "Players";
  if (!role) return <div className="pad"><div className="empty"><Shield size={22} /><b>Staff only</b><span>This page is for Kestrel staff.</span></div></div>;
  return (
    <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: "100%" }}>
      <div className="st" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 className="t-display">Staff</h1>
        <span className="chip">{role === "owner" ? <Crown size={12} /> : <ShieldCheck size={12} />}{ROLE_LABEL[role]}</span>
        <span style={{ flex: 1 }} />
        <Seg label="Staff sections" value={current} onChange={(t) => app.navigate({ name: "staff", tab: t })} items={[{ value: "Players", label: "Players" }, { value: "Staff", label: "Staff" }, { value: "Log", label: "Log" }]} />
      </div>
      <div key={current} className="st" style={{ ["--i" as string]: 1, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {current === "Players" && <Players role={role} />}
        {current === "Staff" && <Members role={role} />}
        {current === "Log" && <Log />}
      </div>
    </div>
  );
}

function Players({ role }: { role: StaffRole }) {
  const app = useApp();
  const [q, setQ] = useState("");
  const [list, setList] = useState<StaffPlayerRow[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => api.service<{ players: StaffPlayerRow[] }>("GET", `/v1/staff/players?q=${encodeURIComponent(q.trim())}`).then((r) => setList(r.players)).catch((e) => { app.notify(errText(e), "error"); setList([]); }), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: 16, flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
        <label className="search"><Search size={16} /><input placeholder="Name or Discord ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" /></label>
        <div className="staff-list">
          {list === null ? <div className="skeleton" style={{ height: 120 }} /> : list.length === 0 ? <p className="t-cap" style={{ padding: 12 }}>{q ? "No players match." : "No players yet. Players appear once they open Kestrel with Discord linked."}</p> :
            list.map((p) => (
              <button key={p.discord_id} className={"staff-row" + (sel === p.discord_id ? " on" : "")} onClick={() => setSel(p.discord_id)}>
                <Avatar id={p.discord_id} avatar={p.avatar} />
                <span style={{ flex: 1, minWidth: 0 }}><b className="t-strong ell">{name(p)}</b><span className="t-cap ell">@{p.username} · seen {date(p.last_seen)}</span></span>
              </button>
            ))}
        </div>
      </div>
      {sel ? <PlayerDetail key={sel} id={sel} role={role} /> : <div className="empty"><Users size={22} /><b>Pick a player</b><span>Search by name, or paste a Discord user ID.</span></div>}
    </div>
  );
}

function PlayerDetail({ id, role }: { id: string; role: StaffRole }) {
  const app = useApp();
  const [p, setP] = useState<StaffPlayer | null>(null);
  const [catalog, setCatalog] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [length, setLength] = useState("7");
  const load = () => api.service<StaffPlayer>("GET", `/v1/staff/players/${id}`).then(setP).catch((e) => app.notify(errText(e), "error"));
  useEffect(() => { load(); api.service<{ cosmetics: { id: string; name: string }[] }>("GET", "/v1/staff/catalog").then((r) => setCatalog(r.cosmetics)).catch(() => {}); }, [id]);
  const act = async (method: "POST" | "DELETE", path: string, done: string, body?: unknown) => {
    setBusy(true);
    try { setP(await api.service<StaffPlayer>(method, `/v1/staff/players/${id}${path}`, body)); app.notify(done); }
    catch (e) { app.notify(errText(e), "error"); }
    setBusy(false);
  };
  if (!p) return <div className="skeleton" style={{ height: 320 }} />;
  const admin = RANK[role] >= RANK.admin;
  const canBan = !p.role || RANK[p.role] < RANK[role];
  const days = (v: string) => (v === "forever" ? null : Number(v));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", minHeight: 0 }}>
      <div className="ocard" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar id={p.discord_id} avatar={p.avatar} size={56} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <b style={{ fontSize: 18 }}>{name(p)}</b>
          <span className="t-cap">@{p.username} · {p.discord_id} · first seen {date(p.first_seen)} · last seen {date(p.last_seen)}</span>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            {p.role && <span className="chip">{p.role === "owner" ? <Crown size={11} /> : <ShieldCheck size={11} />}{ROLE_LABEL[p.role]}</span>}
            {p.plus && <span className="chip green"><Sparkles size={11} />Plus {untilText(p.plus.until)}</span>}
            {p.ban && <span className="chip red"><Ban size={11} />Banned {untilText(p.ban.until)}</span>}
          </div>
        </div>
        <button className="ibtn grey" aria-label="Copy Discord ID" title="Copy Discord ID" onClick={() => navigator.clipboard?.writeText(p.discord_id).then(() => app.notify("Discord ID copied."))}><Copy size={15} /></button>
        <button className="ibtn grey" aria-label="Refresh" onClick={load}><RefreshCw size={15} /></button>
      </div>

      <Group title="Capes">
        {catalog.map((c) => {
          const has = p.cosmetics.includes(c.id);
          return (
            <Row key={c.id} title={c.name} detail={has ? "Given" : "Not given"}>
              {admin && <button className={"btn sm" + (has ? " danger" : " green")} disabled={busy} onClick={() => act(has ? "DELETE" : "POST", `/cosmetics/${c.id}`, has ? `${c.name} taken from ${name(p)}.` : `${c.name} given to ${name(p)}.`)}>{has ? "Take away" : "Give"}</button>}
            </Row>
          );
        })}
      </Group>

      <Group title="Ban from Kestrel">
        {p.ban ? (
          <Row title={`Banned ${untilText(p.ban.until)}`} detail={`Reason: ${p.ban.reason} · since ${date(p.ban.at)}`}>
            {canBan && <button className="btn sm" disabled={busy} onClick={() => act("DELETE", "/ban", `${name(p)} unbanned.`)}>Unban</button>}
          </Row>
        ) : canBan ? (
          <div className="row" style={{ gap: 10 }}>
            <input className="field on-surface" style={{ flex: 1 }} placeholder="Reason (players see this)" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Ban reason" />
            <Select label="Ban length" width={140} value={length} onChange={setLength} options={[{ value: "1", label: "1 day" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "365", label: "1 year" }, { value: "forever", label: "Permanent" }]} />
            <button className="btn danger" disabled={busy || !reason.trim()} onClick={() => confirmDialog(app, {
              title: `Ban ${name(p)}?`, text: `${length === "forever" ? "Permanently" : `For ${length} day${length === "1" ? "" : "s"}`}. They can't use Kestrel while banned.`, confirm: "Ban", danger: true, icon: <Ban size={18} />,
              onConfirm: () => act("POST", "/ban", `${name(p)} banned.`, { reason: reason.trim(), days: days(length) }).then(() => setReason("")),
            })}><Ban size={14} />Ban</button>
          </div>
        ) : <Row title="Can't ban this player" detail="They're staff at your level or above." />}
        {p.bans.length > 0 && p.bans.map((b) => (
          <Row key={b.id} title={`${date(b.at)} · ${b.until === null ? "permanent" : `until ${date(b.until)}`}`} detail={`${b.reason}${b.lifted_at ? ` · lifted ${date(b.lifted_at)}` : ""}`} />
        ))}
      </Group>
      <p className="t-cap">A Kestrel ban blocks the launcher and Kestrel's online features. It can't stop someone playing Minecraft with another launcher.</p>
    </div>
  );
}

function Members({ role }: { role: StaffRole }) {
  const app = useApp();
  const [data, setData] = useState<{ owner: StaffMember & { discord_id: string }; staff: StaffMember[] } | null>(null);
  const [newId, setNewId] = useState("");
  const [newRole, setNewRole] = useState<"mod" | "admin">("mod");
  const load = () => api.service<{ owner: StaffMember; staff: StaffMember[] }>("GET", "/v1/staff/members").then((d) => setData(d as never)).catch((e) => app.notify(errText(e), "error"));
  useEffect(() => { load(); }, []);
  const admin = RANK[role] >= RANK.admin;
  const add = () => api.service("POST", "/v1/staff/members", { discordId: newId.trim(), role: newRole }).then(() => { app.notify("Staff member added."); setNewId(""); load(); }).catch((e) => app.notify(errText(e), "error"));
  if (!data) return <div className="skeleton" style={{ height: 200 }} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 820 }}>
      <Group title="Staff">
        <Row title={<span style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar id={data.owner.discord_id} avatar={data.owner.avatar} size={28} />{name(data.owner)}</span>} detail="Owner"><span className="chip"><Crown size={11} />Owner</span></Row>
        {data.staff.map((s) => (
          <Row key={s.discord_id} title={<span style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar id={s.discord_id} avatar={s.avatar} size={28} />{name(s)}</span>} detail={`${ROLE_LABEL[s.role]}${s.added_at ? ` · added ${date(s.added_at)}` : ""}`}>
            {admin && RANK[s.role] < RANK[role] && <button className="ibtn sm" aria-label={`Remove ${name(s)} from staff`} onClick={() => confirmDialog(app, { title: `Remove ${name(s)} from staff?`, text: "They lose access to the Staff tab.", confirm: "Remove", danger: true,
              onConfirm: () => api.service("DELETE", `/v1/staff/members/${s.discord_id}`).then(() => { app.notify("Removed from staff."); load(); }).catch((e) => app.notify(errText(e), "error")) })}><Trash2 size={15} /></button>}
          </Row>
        ))}
        {data.staff.length === 0 && <Row title="No other staff yet" />}
      </Group>
      {admin && (
        <Group title="Add staff">
          <div className="row" style={{ gap: 10 }}>
            <input className="field on-surface" style={{ flex: 1 }} placeholder="Discord user ID" value={newId} onChange={(e) => setNewId(e.target.value.replace(/\D/g, ""))} aria-label="Discord user ID" />
            <Select label="Role" width={150} value={newRole} onChange={(v) => setNewRole(v as "mod" | "admin")} options={[{ value: "mod", label: "Moderator", hint: "Bans and viewing" }, ...(role === "owner" ? [{ value: "admin", label: "Admin", hint: "Everything but the owner" }] : [])]} />
            <button className="btn green" disabled={newId.length < 5} onClick={add}><UserPlus size={15} />Add</button>
          </div>
        </Group>
      )}
      <p className="t-cap">Moderators can view players and ban. Admins can also give capes and add moderators. Only the owner can add admins.</p>
    </div>
  );
}

const ACTION: Record<string, string> = { ban: "banned", unban: "unbanned", give_plus: "gave Plus to", remove_plus: "removed Plus from", give_cosmetic: "gave a cosmetic to", remove_cosmetic: "took a cosmetic from", add_staff: "added to staff", remove_staff: "removed from staff" };

function Log() {
  const app = useApp();
  const [log, setLog] = useState<LogRow[] | null>(null);
  useEffect(() => { api.service<{ log: LogRow[] }>("GET", "/v1/staff/log").then((r) => setLog(r.log)).catch((e) => { app.notify(errText(e), "error"); setLog([]); }); }, []);
  if (!log) return <div className="skeleton" style={{ height: 200 }} />;
  return (
    <div className="rows" style={{ maxWidth: 920 }}>
      {log.length === 0 && <Row title="Nothing yet" detail="Every staff action shows up here." />}
      {log.map((l) => (
        <Row key={l.id} title={<>{l.actor_name ?? l.actor} <span className="muted" style={{ fontWeight: 500 }}>{ACTION[l.action] ?? l.action}</span> {l.target_name ?? l.target ?? ""}</>} detail={`${when(l.at)}${l.detail ? ` · ${l.detail}` : ""}`} />
      ))}
    </div>
  );
}
