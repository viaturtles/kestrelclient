// Kestrel online service (Cloudflare Worker + D1).
// Players are identified by their Discord sign-in: the launcher sends the Discord access token,
// this service asks Discord who it belongs to, and never stores the token itself.
// Staff rights are decided here, never by the launcher.

export interface Env {
  DB: D1Database;
  /** Turtles' Discord user ID: always the owner. Set in wrangler.toml [vars]. */
  OWNER_DISCORD_ID: string;
}

type Role = "mod" | "admin" | "owner";
const RANK: Record<Role, number> = { mod: 1, admin: 2, owner: 3 };

/**
 * Every cape. `texture` is a Minecraft cape sheet in public/capes (64x32 scaled up, frames stacked top to
 * bottom for animated ones; make them with tools/make-cape.ps1). `free` capes belong to every linked player;
 * the rest are given by staff. Capes without a texture are listed but can't be worn yet.
 */
// Turtles' two Kestrel capes (sold later; until there's a shop, staff give them from the Staff tab).
const CAPES: { id: string; name: string; texture?: string; frames?: number; fps?: number; free?: boolean }[] = [
  { id: "kestrel-dark", name: "Kestrel Dark", texture: "/capes/kestrel-dark.png" },
  { id: "kestrel-light", name: "Kestrel Light", texture: "/capes/kestrel-light.png" },
];
/** Cosmetics staff can give (everything that isn't free). */
const CATALOG = CAPES.filter((c) => !c.free).map(({ id, name }) => ({ id, name }));
const capeInfo = (c: (typeof CAPES)[number], base: string) => ({ id: c.id, name: c.name, url: c.texture ? base + c.texture : null, frames: c.frames ?? 1, fps: c.fps ?? 0 });

const now = () => Math.floor(Date.now() / 1000);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const fail = (status: number, error: string, message: string) => json({ error, message }, status);
const isId = (s: unknown): s is string => typeof s === "string" && /^\d{5,25}$/.test(s);

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Me = { id: string; username: string; global_name: string | null; avatar: string | null };

/** Who is calling: checks the Discord token with Discord (cached for 10 minutes by its hash). */
async function identify(req: Request, env: Env): Promise<Me | Response> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token.length > 200) return fail(401, "no_token", "Link your Discord account in Kestrel first.");
  const hash = await sha256(token);
  const cached = await env.DB.prepare("SELECT s.discord_id, p.username, p.global_name, p.avatar FROM sessions s JOIN players p ON p.discord_id = s.discord_id WHERE s.token_hash = ? AND s.expires > ?")
    .bind(hash, now()).first<{ discord_id: string; username: string; global_name: string | null; avatar: string | null }>();
  if (cached) return { id: cached.discord_id, username: cached.username, global_name: cached.global_name, avatar: cached.avatar };
  const r = await fetch("https://discord.com/api/v10/users/@me", { headers: { authorization: `Bearer ${token}` } });
  if (r.status === 401) return fail(401, "discord_expired", "Your Discord sign-in expired.");
  if (!r.ok) return fail(502, "discord_down", "Couldn't reach Discord. Try again in a minute.");
  const u = (await r.json()) as Me;
  if (!isId(u.id)) return fail(502, "discord_down", "Discord sent something unexpected.");
  const t = now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO players (discord_id, username, global_name, avatar, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username, global_name = excluded.global_name, avatar = excluded.avatar, last_seen = excluded.last_seen")
      .bind(u.id, u.username, u.global_name ?? null, u.avatar ?? null, t, t),
    env.DB.prepare("INSERT OR REPLACE INTO sessions (token_hash, discord_id, expires) VALUES (?, ?, ?)").bind(hash, u.id, t + 600),
    env.DB.prepare("DELETE FROM sessions WHERE expires < ?").bind(t),
  ]);
  return u;
}

async function roleOf(env: Env, id: string): Promise<Role | null> {
  if (id === env.OWNER_DISCORD_ID) return "owner";
  const r = await env.DB.prepare("SELECT role FROM staff WHERE discord_id = ?").bind(id).first<{ role: Role }>();
  return r?.role ?? null;
}

const activeBan = (env: Env, id: string) =>
  env.DB.prepare("SELECT id, reason, until, at FROM bans WHERE discord_id = ? AND lifted_at IS NULL AND (until IS NULL OR until > ?) ORDER BY at DESC LIMIT 1").bind(id, now()).first<{ id: number; reason: string; until: number | null; at: number }>();
const activePlus = (env: Env, id: string) =>
  env.DB.prepare("SELECT until, at FROM plus WHERE discord_id = ? AND (until IS NULL OR until > ?)").bind(id, now()).first<{ until: number | null; at: number }>();

async function cosmeticsOf(env: Env, id: string) {
  const r = await env.DB.prepare("SELECT cosmetic FROM cosmetics WHERE discord_id = ?").bind(id).all<{ cosmetic: string }>();
  return [...CAPES.filter((c) => c.free).map((c) => c.id), ...r.results.map((x) => x.cosmetic).filter((id) => CAPES.some((c) => c.id === id))];
}

const equippedOf = async (env: Env, id: string) =>
  (await env.DB.prepare("SELECT cape FROM equipped WHERE discord_id = ?").bind(id).first<{ cape: string }>())?.cape ?? null;

const log = (env: Env, actor: string, action: string, target: string | null, detail: string | null) =>
  env.DB.prepare("INSERT INTO log (at, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)").bind(now(), actor, action, target, detail).run();

async function body(req: Request): Promise<Record<string, unknown>> {
  try { const b = await req.json(); return b && typeof b === "object" ? (b as Record<string, unknown>) : {}; } catch { return {}; }
}
/** Days → end time; null/absent = permanent. Allowed: 1 to 3650 days. */
function until(days: unknown): number | null | "bad" {
  if (days === null || days === undefined) return null;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 3650) return "bad";
  return now() + days * 86400;
}

async function player(env: Env, id: string) {
  const p = await env.DB.prepare("SELECT discord_id, username, global_name, avatar, first_seen, last_seen FROM players WHERE discord_id = ?").bind(id).first();
  if (!p) return null;
  const [role, ban, plusRow, cosmetics, bans] = await Promise.all([
    roleOf(env, id), activeBan(env, id), activePlus(env, id), cosmeticsOf(env, id),
    env.DB.prepare("SELECT id, reason, until, by, at, lifted_by, lifted_at FROM bans WHERE discord_id = ? ORDER BY at DESC LIMIT 20").bind(id).all(),
  ]);
  return { ...p, role, ban, plus: plusRow, cosmetics, bans: bans.results };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "");
    const m = req.method;
    if (path === "" || path === "/v1/health") return json({ ok: true, service: "kestrel" });
    const base = url.origin;
    // The cape list is public (textures are served as static files from /capes/).
    if (m === "GET" && path === "/v1/capes") {
      const r = json({ capes: CAPES.map((c) => ({ ...capeInfo(c, base), free: !!c.free })) });
      r.headers.set("access-control-allow-origin", "*"); // read straight from the launcher page
      return r;
    }

    // Public: which of these Minecraft players use Kestrel, and the cape each one wears (for the Tab list
    // bird and capes in game). Only players who linked their Minecraft account with Mojang's check appear.
    if (m === "GET" && path === "/v1/players/kestrel") {
      const ids = (url.searchParams.get("uuids") ?? "").toLowerCase().replace(/-/g, "").split(",").filter((u) => /^[0-9a-f]{32}$/.test(u)).slice(0, 100);
      if (!ids.length) return json({ players: [] });
      const r = await env.DB.prepare(`SELECT p.mc_uuid, e.cape FROM players p LEFT JOIN equipped e ON e.discord_id = p.discord_id WHERE p.mc_uuid IN (${ids.map(() => "?").join(",")})`)
        .bind(...ids).all<{ mc_uuid: string; cape: string | null }>();
      const out = [];
      for (const row of r.results) {
        // A cape only counts while it's still owned.
        const owned = row.cape ? await env.DB.prepare("SELECT 1 FROM cosmetics c JOIN players p ON p.discord_id = c.discord_id WHERE p.mc_uuid = ? AND c.cosmetic = ?").bind(row.mc_uuid, row.cape).first() : null;
        const cape = owned ? CAPES.find((c) => c.id === row.cape && c.texture) : undefined;
        out.push({ uuid: row.mc_uuid, cape: cape ? capeInfo(cape, base) : null });
      }
      return json({ players: out });
    }

    const who = await identify(req, env);
    if (who instanceof Response) return who;
    const me = who.id;

    // ---- every player ----
    if (m === "GET" && path === "/v1/me") {
      const [role, ban, plusRow, cosmetics, equipped] = await Promise.all([roleOf(env, me), activeBan(env, me), activePlus(env, me), cosmeticsOf(env, me), equippedOf(env, me)]);
      const v = url.searchParams.get("v");
      if (v && v.length < 20) await env.DB.prepare("UPDATE players SET version = ? WHERE discord_id = ?").bind(v, me).run();
      // The worn cape only counts while the player still owns it and it has a texture.
      const cape = CAPES.find((c) => c.id === equipped && c.texture && cosmetics.includes(c.id));
      const mcRow = await env.DB.prepare("SELECT mc_uuid, mc_name FROM players WHERE discord_id = ?").bind(me).first<{ mc_uuid: string | null; mc_name: string | null }>();
      return json({ id: me, role, ban: ban ? { reason: ban.reason, until: ban.until } : null, plus: plusRow ? { until: plusRow.until } : null, cosmetics, cape: cape ? capeInfo(cape, base) : null,
        minecraft: mcRow?.mc_uuid ? { uuid: mcRow.mc_uuid, name: mcRow.mc_name } : null });
    }

    // Wear a cape you own (null takes it off).
    if (m === "POST" && path === "/v1/me/cape") {
      const id = (await body(req)).cape;
      if (id === null) {
        await env.DB.prepare("DELETE FROM equipped WHERE discord_id = ?").bind(me).run();
        return json({ cape: null });
      }
      const cape = CAPES.find((c) => c.id === id);
      if (!cape || !cape.texture) return fail(400, "bad_request", "That cape can't be worn yet.");
      if (!(await cosmeticsOf(env, me)).includes(cape.id)) return fail(403, "not_owned", "You don't own that cape.");
      await env.DB.prepare("INSERT OR REPLACE INTO equipped (discord_id, cape, at) VALUES (?, ?, ?)").bind(me, cape.id, now()).run();
      return json({ cape: capeInfo(cape, base) });
    }

    // ---- Minecraft account link (Mojang's join / hasJoined check, like servers do) ----
    if (m === "POST" && path === "/v1/me/minecraft/start") {
      const sid = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
      await env.DB.prepare("INSERT OR REPLACE INTO mc_link (discord_id, server_id, expires) VALUES (?, ?, ?)").bind(me, sid, now() + 120).run();
      return json({ serverId: sid });
    }
    if (m === "POST" && path === "/v1/me/minecraft/finish") {
      const name = (await body(req)).name;
      if (typeof name !== "string" || !/^[A-Za-z0-9_]{1,16}$/.test(name)) return fail(400, "bad_request", "Bad Minecraft name.");
      const link = await env.DB.prepare("SELECT server_id FROM mc_link WHERE discord_id = ? AND expires > ?").bind(me, now()).first<{ server_id: string }>();
      if (!link) return fail(400, "expired", "Linking took too long. Try again.");
      await env.DB.prepare("DELETE FROM mc_link WHERE discord_id = ?").bind(me).run();
      const r = await fetch(`https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${encodeURIComponent(name)}&serverId=${link.server_id}`);
      if (r.status !== 200) return fail(403, "not_verified", "Mojang couldn't confirm that Minecraft account.");
      const prof = (await r.json()) as { id: string; name: string };
      // One Minecraft account belongs to one Kestrel account: the newest link wins.
      await env.DB.batch([
        env.DB.prepare("UPDATE players SET mc_uuid = NULL, mc_name = NULL WHERE mc_uuid = ? AND discord_id != ?").bind(prof.id, me),
        env.DB.prepare("UPDATE players SET mc_uuid = ?, mc_name = ? WHERE discord_id = ?").bind(prof.id, prof.name, me),
      ]);
      return json({ uuid: prof.id, name: prof.name });
    }

    // ---- presence (sent by the launcher about once a minute) ----
    if (m === "POST" && path === "/v1/me/presence") {
      const b = await body(req);
      const state = b.state === "playing" ? "playing" : "launcher";
      const server = typeof b.server === "string" && /^[A-Za-z0-9.-]{1,80}(:\d{1,5})?$/.test(b.server) ? b.server : "";
      await env.DB.prepare("UPDATE players SET presence = ?, presence_at = ? WHERE discord_id = ?").bind(state + (server ? "|" + server : ""), now(), me).run();
      return json({ ok: true });
    }

    // ---- friends ----
    const pair = (x: string, y: string) => (x < y ? [x, y] : [y, x]);
    const card = (p: { discord_id: string; username: string; global_name: string | null; avatar: string | null; mc_uuid: string | null; mc_name: string | null; presence: string | null; presence_at: number | null; last_seen: number }) => {
      const online = !!p.presence_at && p.presence_at > now() - 150;
      const [state, server] = (p.presence ?? "").split("|");
      return { id: p.discord_id, name: p.mc_name ?? p.global_name ?? p.username, mcUuid: p.mc_uuid, avatar: p.avatar, online, playing: online && state === "playing", server: online && server ? server : null, lastSeen: p.presence_at ?? p.last_seen };
    };
    const COLS = "p.discord_id, p.username, p.global_name, p.avatar, p.mc_uuid, p.mc_name, p.presence, p.presence_at, p.last_seen";
    if (m === "GET" && path === "/v1/friends") {
      const [f, inc, out] = await Promise.all([
        env.DB.prepare(`SELECT ${COLS} FROM friends f JOIN players p ON p.discord_id = CASE WHEN f.a = ? THEN f.b ELSE f.a END WHERE f.a = ? OR f.b = ?`).bind(me, me, me).all(),
        env.DB.prepare(`SELECT ${COLS} FROM friend_requests r JOIN players p ON p.discord_id = r.from_id WHERE r.to_id = ? ORDER BY r.at DESC`).bind(me).all(),
        env.DB.prepare(`SELECT ${COLS} FROM friend_requests r JOIN players p ON p.discord_id = r.to_id WHERE r.from_id = ? ORDER BY r.at DESC`).bind(me).all(),
      ]);
      // deno-lint-ignore no-explicit-any
      const list = (f.results as any[]).map(card).sort((x, y) => Number(y.online) - Number(x.online) || x.name.localeCompare(y.name));
      // deno-lint-ignore no-explicit-any
      return json({ friends: list, incoming: (inc.results as any[]).map(card), outgoing: (out.results as any[]).map(card) });
    }
    if (m === "POST" && path === "/v1/friends/requests") {
      const name = (await body(req)).name;
      if (typeof name !== "string" || !name.trim() || name.length > 40) return fail(400, "bad_request", "Type a Minecraft name.");
      const t = await env.DB.prepare("SELECT discord_id FROM players WHERE lower(mc_name) = lower(?) OR lower(username) = lower(?) LIMIT 1").bind(name.trim(), name.trim()).first<{ discord_id: string }>();
      if (!t) return fail(404, "no_player", `${name.trim()} isn't on Kestrel yet (or hasn't linked Discord and Minecraft).`);
      if (t.discord_id === me) return fail(400, "bad_request", "That's you.");
      const [a, bb] = pair(me, t.discord_id);
      if (await env.DB.prepare("SELECT 1 FROM friends WHERE a = ? AND b = ?").bind(a, bb).first()) return fail(400, "already", "You're already friends.");
      // They already asked you: that makes you friends.
      if (await env.DB.prepare("SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?").bind(t.discord_id, me).first()) {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?").bind(t.discord_id, me),
          env.DB.prepare("INSERT OR IGNORE INTO friends (a, b, since) VALUES (?, ?, ?)").bind(a, bb, now()),
        ]);
        return json({ friends: true });
      }
      await env.DB.prepare("INSERT OR IGNORE INTO friend_requests (from_id, to_id, at) VALUES (?, ?, ?)").bind(me, t.discord_id, now()).run();
      return json({ sent: true });
    }
    const fr = path.match(/^\/v1\/friends\/requests\/(\d{5,25})(\/accept)?$/);
    if (fr) {
      const other = fr[1];
      if (m === "POST" && fr[2]) {
        const r = await env.DB.prepare("DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?").bind(other, me).run();
        if (!r.meta.changes) return fail(404, "no_request", "That request is gone.");
        const [a, bb] = pair(me, other);
        await env.DB.prepare("INSERT OR IGNORE INTO friends (a, b, since) VALUES (?, ?, ?)").bind(a, bb, now()).run();
        return json({ friends: true });
      }
      if (m === "DELETE") {
        // Decline theirs or cancel yours.
        await env.DB.prepare("DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)").bind(other, me, me, other).run();
        return json({ ok: true });
      }
    }
    const fd = path.match(/^\/v1\/friends\/(\d{5,25})$/);
    if (fd && m === "DELETE") {
      const [a, bb] = pair(me, fd[1]);
      await env.DB.prepare("DELETE FROM friends WHERE a = ? AND b = ?").bind(a, bb).run();
      return json({ ok: true });
    }

    // ---- staff only ----
    if (!path.startsWith("/v1/staff/")) return fail(404, "not_found", "Not found.");
    const role = await roleOf(env, me);
    if (!role) return fail(403, "not_staff", "You're not Kestrel staff.");
    const rank = RANK[role];
    const need = (r: Role) => (rank >= RANK[r] ? null : fail(403, "no_permission", `Needs ${r} or higher.`));

    if (m === "GET" && path === "/v1/staff/catalog") return json({ cosmetics: CATALOG });

    if (m === "GET" && path === "/v1/staff/players") {
      const q = (url.searchParams.get("q") ?? "").trim().slice(0, 40);
      const like = `%${q.replace(/[%_]/g, "")}%`;
      const r = await env.DB.prepare("SELECT discord_id, username, global_name, avatar, last_seen FROM players WHERE ? = '' OR discord_id = ? OR username LIKE ? OR global_name LIKE ? ORDER BY last_seen DESC LIMIT 50")
        .bind(q, q, like, like).all();
      return json({ players: r.results });
    }

    const pm = path.match(/^\/v1\/staff\/players\/(\d{5,25})(?:\/(ban|plus|cosmetics)(?:\/([a-z0-9-]{1,32}))?)?$/);
    if (pm) {
      const [, target, what, item] = pm;
      if (m === "GET" && !what) {
        const p = await player(env, target);
        return p ? json(p) : fail(404, "no_player", "That player hasn't opened Kestrel with Discord linked yet.");
      }
      const exists = await env.DB.prepare("SELECT 1 FROM players WHERE discord_id = ?").bind(target).first();
      if (!exists) return fail(404, "no_player", "That player hasn't opened Kestrel with Discord linked yet.");

      if (what === "ban") {
        const deny = need("mod"); if (deny) return deny;
        const theirs = await roleOf(env, target);
        if (theirs && RANK[theirs] >= rank) return fail(403, "no_permission", "You can't ban staff at your level or above.");
        if (m === "POST") {
          const b = await body(req);
          const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 200) : "";
          const end = until(b.days);
          if (!reason) return fail(400, "bad_request", "Give a reason.");
          if (end === "bad") return fail(400, "bad_request", "Ban length must be 1 to 3650 days, or permanent.");
          await env.DB.prepare("UPDATE bans SET lifted_by = ?, lifted_at = ? WHERE discord_id = ? AND lifted_at IS NULL").bind(me, now(), target).run();
          await env.DB.prepare("INSERT INTO bans (discord_id, reason, until, by, at) VALUES (?, ?, ?, ?, ?)").bind(target, reason, end, me, now()).run();
          await log(env, me, "ban", target, `${end ? `until ${new Date(end * 1000).toISOString().slice(0, 10)}` : "permanent"}: ${reason}`);
          return json(await player(env, target));
        }
        if (m === "DELETE") {
          await env.DB.prepare("UPDATE bans SET lifted_by = ?, lifted_at = ? WHERE discord_id = ? AND lifted_at IS NULL").bind(me, now(), target).run();
          await log(env, me, "unban", target, null);
          return json(await player(env, target));
        }
      }
      if (what === "plus") {
        const deny = need("admin"); if (deny) return deny;
        if (m === "POST") {
          const end = until((await body(req)).days);
          if (end === "bad") return fail(400, "bad_request", "Plus length must be 1 to 3650 days, or forever.");
          await env.DB.prepare("INSERT OR REPLACE INTO plus (discord_id, until, by, at) VALUES (?, ?, ?, ?)").bind(target, end, me, now()).run();
          await log(env, me, "give_plus", target, end ? `until ${new Date(end * 1000).toISOString().slice(0, 10)}` : "forever");
          return json(await player(env, target));
        }
        if (m === "DELETE") {
          await env.DB.prepare("DELETE FROM plus WHERE discord_id = ?").bind(target).run();
          await log(env, me, "remove_plus", target, null);
          return json(await player(env, target));
        }
      }
      if (what === "cosmetics" && item) {
        const deny = need("admin"); if (deny) return deny;
        if (!CATALOG.some((c) => c.id === item)) return fail(400, "bad_request", "Unknown cosmetic.");
        if (m === "POST") {
          await env.DB.prepare("INSERT OR IGNORE INTO cosmetics (discord_id, cosmetic, by, at) VALUES (?, ?, ?, ?)").bind(target, item, me, now()).run();
          await log(env, me, "give_cosmetic", target, item);
          return json(await player(env, target));
        }
        if (m === "DELETE") {
          await env.DB.prepare("DELETE FROM cosmetics WHERE discord_id = ? AND cosmetic = ?").bind(target, item).run();
          await log(env, me, "remove_cosmetic", target, item);
          return json(await player(env, target));
        }
      }
      return fail(405, "bad_request", "Not allowed.");
    }

    if (path === "/v1/staff/members") {
      if (m === "GET") {
        const r = await env.DB.prepare("SELECT s.discord_id, s.role, s.added_by, s.added_at, p.username, p.global_name, p.avatar FROM staff s LEFT JOIN players p ON p.discord_id = s.discord_id ORDER BY s.role DESC, s.added_at").all();
        const owner = await env.DB.prepare("SELECT discord_id, username, global_name, avatar FROM players WHERE discord_id = ?").bind(env.OWNER_DISCORD_ID).first();
        return json({ owner: owner ?? { discord_id: env.OWNER_DISCORD_ID }, staff: r.results });
      }
      if (m === "POST") {
        const deny = need("admin"); if (deny) return deny;
        const b = await body(req);
        const target = b.discordId, newRole = b.role;
        if (!isId(target) || (newRole !== "mod" && newRole !== "admin")) return fail(400, "bad_request", "Give a Discord user ID and a role (mod or admin).");
        if (target === env.OWNER_DISCORD_ID || target === me) return fail(400, "bad_request", "You can't change that account's role.");
        if (RANK[newRole] >= rank) return fail(403, "no_permission", "Only the owner can add admins.");
        const theirs = await roleOf(env, target);
        if (theirs && RANK[theirs] >= rank) return fail(403, "no_permission", "You can't change staff at your level or above.");
        await env.DB.prepare("INSERT OR REPLACE INTO staff (discord_id, role, added_by, added_at) VALUES (?, ?, ?, ?)").bind(target, newRole, me, now()).run();
        await log(env, me, "add_staff", target, newRole);
        return json({ ok: true });
      }
    }
    const sm = path.match(/^\/v1\/staff\/members\/(\d{5,25})$/);
    if (sm && m === "DELETE") {
      const deny = need("admin"); if (deny) return deny;
      const target = sm[1];
      const theirs = await roleOf(env, target);
      if (!theirs || theirs === "owner") return fail(400, "bad_request", "That account isn't removable staff.");
      if (RANK[theirs] >= rank) return fail(403, "no_permission", "You can't remove staff at your level or above.");
      await env.DB.prepare("DELETE FROM staff WHERE discord_id = ?").bind(target).run();
      await log(env, me, "remove_staff", target, theirs);
      return json({ ok: true });
    }

    if (m === "GET" && path === "/v1/staff/log") {
      const r = await env.DB.prepare("SELECT l.id, l.at, l.actor, l.action, l.target, l.detail, a.username AS actor_name, t.username AS target_name FROM log l LEFT JOIN players a ON a.discord_id = l.actor LEFT JOIN players t ON t.discord_id = l.target ORDER BY l.id DESC LIMIT 100").all();
      return json({ log: r.results });
    }

    return fail(404, "not_found", "Not found.");
  },
};
