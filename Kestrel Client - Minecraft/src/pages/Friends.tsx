import { useEffect, useState } from "react";
import { Check, Play, Search, Trash2, UserPlus, Users, X } from "lucide-react";
import { api, discordAvatar, inApp, type Friend, type FriendsList } from "../lib/api";
import { errText, useApp, type AppState } from "../lib/store";
import { launchInstallation } from "../lib/launch";
import { confirmDialog } from "../components/ui";
import { signInDialog } from "../components/Shell";

/** "2h ago", "yesterday", "Oct 18". */
function seen(s: number) {
  const m = (Date.now() / 1000 - s) / 60;
  if (m < 60) return `${Math.max(1, Math.floor(m))}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  if (m < 2880) return "yesterday";
  return new Date(s * 1000).toLocaleDateString([], { month: "short", day: "numeric" });
}

export const friendHead = (f: Friend) => (f.mcUuid ? `https://mc-heads.net/avatar/${f.mcUuid}/64` : discordAvatar(f.id, f.avatar) ?? "/assets/imgYourMinecraftPfp.png");
export const friendStatus = (f: Friend) => (f.playing ? (f.server ? `Playing on ${f.server}` : "Playing Minecraft") : f.online ? "In the Kestrel launcher" : `Offline · seen ${seen(f.lastSeen)}`);

/** Your friends from Kestrel's service, refreshed every 30 seconds (null while loading or without Discord). */
export function useFriends(): [FriendsList | null, () => void] {
  const app = useApp();
  const [data, setData] = useState<FriendsList | null>(null);
  const load = () => { if (inApp && app.me) api.service<FriendsList>("GET", "/v1/friends").then(setData).catch(() => {}); };
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [!!app.me]);
  return [data, load];
}

export function Friends() {
  const app = useApp();
  const [data, load] = useFriends();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const call = async (method: "POST" | "DELETE", path: string, body: unknown, done: string) => {
    try { await api.service(method, path, body); app.notify(done); load(); } catch (e) { app.notify(errText(e), "error"); }
  };
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const r = await api.service<{ friends?: boolean; sent?: boolean }>("POST", "/v1/friends/requests", { name: n });
      app.notify(r.friends ? `You and ${n} are now friends.` : `Friend request sent to ${n}.`);
      setName("");
      load();
    } catch (e) { app.notify(errText(e), "error"); }
    setBusy(false);
  };
  const online = data?.friends.filter((f) => f.online).length ?? 0;

  return (
    <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 980 }}>
      <div className="st" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 className="t-display">Friends</h1>
          <p className="muted" style={{ marginTop: 4 }}>{data ? `${online} of ${data.friends.length} online` : "See who's playing and join them."}</p>
        </div>
        {app.me && (
          <form className="fr-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <label className="search" style={{ width: 260 }}><Search size={16} /><input placeholder="Add by Minecraft name" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} aria-label="Minecraft name" /></label>
            <button className="btn green" style={{ height: 40 }} disabled={busy || !name.trim()}>{busy ? <span className="spinner" /> : <UserPlus size={16} />}Add friend</button>
          </form>
        )}
      </div>

      {!app.discordUser ? (
        <div className="empty st" style={{ ["--i" as string]: 1 }}><Users size={22} /><b>Link Discord to use friends</b><span>Your friends list lives on your Kestrel account, which uses Discord.</span>
          <button className="btn discord" style={{ marginTop: 6 }} onClick={() => app.navigate({ name: "settings", tab: "Discord" })}>Link Discord</button></div>
      ) : !app.me ? (
        <div className="empty st" style={{ ["--i" as string]: 1 }}><Users size={22} /><b>Connecting to Kestrel…</b><span>{inApp ? "If this stays, check your internet connection." : "Friends work in the Kestrel desktop app."}</span></div>
      ) : (
        <>
          {!app.account && <div className="notice st"><Users size={16} /><span style={{ flex: 1 }}>Sign in with Microsoft so friends can add you by your Minecraft name.</span><button className="btn sm" onClick={() => signInDialog(app)}>Sign in</button></div>}
          {app.account && !app.me.minecraft && <div className="notice st"><Users size={16} /><span style={{ flex: 1 }}>Linking your Minecraft account to Kestrel…</span><span className="spinner" /></div>}
          {data && data.incoming.length > 0 && (
            <section className="st fr-section" style={{ ["--i" as string]: 1 }}>
              <span className="sec-label">Friend requests · {data.incoming.length}</span>
              {data.incoming.map((f) => (
                <FriendRow key={f.id} f={f} sub="Wants to be friends">
                  <button className="btn green sm" onClick={() => call("POST", `/v1/friends/requests/${f.id}/accept`, null, `You and ${f.name} are now friends.`)}><Check size={14} />Accept</button>
                  <button className="btn sm" onClick={() => call("DELETE", `/v1/friends/requests/${f.id}`, null, "Request declined.")}><X size={14} />Decline</button>
                </FriendRow>
              ))}
            </section>
          )}
          <section className="st fr-section" style={{ ["--i" as string]: 2 }}>
            <span className="sec-label">Friends</span>
            {data === null ? <div className="skeleton" style={{ height: 120 }} /> : data.friends.length === 0 ? (
              <div className="empty"><UserPlus size={22} /><b>No friends yet</b><span>Add someone by their Minecraft name. They need Kestrel with Discord linked.</span></div>
            ) : data.friends.map((f) => (
              <FriendRow key={f.id} f={f}>
                {f.server && <button className="btn green sm" onClick={() => launchInstallation(app, app.selected, f.server)}><Play size={12} />Join</button>}
                <button className="ibtn sm" aria-label={`Remove ${f.name}`} onClick={() => removeFriend(app, f, load)}><Trash2 size={15} /></button>
              </FriendRow>
            ))}
          </section>
          {data && data.outgoing.length > 0 && (
            <section className="st fr-section" style={{ ["--i" as string]: 3 }}>
              <span className="sec-label">Sent</span>
              {data.outgoing.map((f) => (
                <FriendRow key={f.id} f={f} sub="Waiting for them to accept">
                  <button className="btn sm" onClick={() => call("DELETE", `/v1/friends/requests/${f.id}`, null, "Request cancelled.")}>Cancel</button>
                </FriendRow>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function removeFriend(app: AppState, f: Friend, done: () => void) {
  confirmDialog(app, { title: `Remove ${f.name}?`, text: "You can add each other again any time.", confirm: "Remove", danger: true,
    onConfirm: () => api.service("DELETE", `/v1/friends/${f.id}`).then(() => { app.notify(`${f.name} removed.`); done(); }).catch((e) => app.notify(errText(e), "error")) });
}

function FriendRow({ f, sub, children }: { f: Friend; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="fr-row">
      <span className="fr-head"><img src={friendHead(f)} alt="" />{!sub && <i className={f.playing ? "play" : f.online ? "on" : ""} />}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b className="t-strong ell">{f.name}</b><span className={"t-cap ell" + (f.playing ? " fr-live" : "")}>{sub ?? friendStatus(f)}</span></span>
      {children}
    </div>
  );
}
