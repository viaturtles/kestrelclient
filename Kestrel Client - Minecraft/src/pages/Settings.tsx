import { useEffect, useState } from "react";
import { Bell, Download, FileText, FolderOpen, Gamepad2, HardDrive, Lock, LogIn, MessageCircle, RefreshCw, Search, ShieldCheck, SlidersHorizontal, User } from "lucide-react";
import { api, inApp, DESKTOP_ONLY } from "../lib/api";
import { errText, useApp } from "../lib/store";
import { sfx } from "../lib/sfx";
import { Group, Row, Select, Toggle } from "../components/ui";
import { signInDialog } from "../components/Shell";

const CATS = [
  { id: "Game", icon: Gamepad2 }, { id: "General", icon: SlidersHorizontal }, { id: "Account", icon: User }, { id: "Storage", icon: HardDrive },
  { id: "Notifications", icon: Bell }, { id: "Discord", icon: MessageCircle }, { id: "Privacy", icon: Lock },
] as const;
const SUB: Record<string, string> = {
  Game: "Defaults for new installations. Each installation can change these.", General: "How Kestrel looks, moves and sounds.",
  Account: "Sign in with the Microsoft account that owns Minecraft.", Storage: "Where Kestrel keeps game files.",
  Notifications: "Choose when Kestrel lets you know about things.", Discord: "Show what you're playing on your Discord profile.", Privacy: "Kestrel keeps your data on your PC.",
};
const KEYWORDS: Record<string, string> = {
  Game: "memory java resolution fullscreen window runtime", General: "language motion animation sweep transition sound startup update",
  Account: "microsoft sign in skin cape", Storage: "folder logs cache disk", Notifications: "download update error sound", Discord: "rich presence status idle", Privacy: "crash reports analytics data logs",
};

export function SettingsPage({ tab }: { tab?: string }) {
  const app = useApp();
  const cat = CATS.find((c) => c.id === tab)?.id ?? "General";
  const [q, setQ] = useState("");
  const shown = CATS.filter((c) => !q.trim() || (c.id + " " + KEYWORDS[c.id]).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "232px 1px minmax(0, 720px)", gap: 32, padding: 20, minHeight: "100%" }}>
      <nav className="st" style={{ display: "flex", flexDirection: "column", gap: 4 }} aria-label="Settings categories">
        <h1 className="t-display" style={{ marginBottom: 12 }}>Settings</h1>
        <label className="search" style={{ height: 38, marginBottom: 6 }}><Search size={16} /><input placeholder="Search settings" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search settings" /></label>
        {shown.map(({ id, icon: Icon }) => (
          <button key={id} aria-current={id === cat ? "page" : undefined} onClick={() => app.navigate({ name: "settings", tab: id })}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, fontWeight: 600, color: id === cat ? "var(--text)" : "var(--text2)", transition: "background var(--fast), color var(--fast)",
              background: id === cat ? "var(--control)" : "transparent", boxShadow: id === cat ? "inset 0 0 0 1px rgba(255,255,255,.12)" : "none" }}>
            <Icon size={16} />{id}
          </button>
        ))}
        <div style={{ marginTop: "auto", paddingTop: 20 }} className="t-cap">Kestrel · Private build 0.1<br />Not affiliated with Mojang or Microsoft</div>
      </nav>
      <div style={{ background: "var(--divider)" }} />
      <section key={cat} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="st"><h2 className="t-display">{cat}</h2><p className="muted" style={{ marginTop: 4 }}>{SUB[cat]}</p></div>
        <div className="st" style={{ display: "flex", flexDirection: "column", gap: 24, ["--i" as string]: 1 }}>
          {cat === "Game" && <Game />}
          {cat === "General" && <General />}
          {cat === "Account" && <Account />}
          {cat === "Storage" && <Storage />}
          {cat === "Notifications" && <Notifications />}
          {cat === "Discord" && <Discord />}
          {cat === "Privacy" && <Privacy />}
        </div>
      </section>
    </div>
  );
}

function Game() {
  const app = useApp(), s = app.settings, set = app.setSettings;
  const max = app.paths ? Math.max(2, Math.floor(app.paths.totalMemoryMb / 1024) - 2) : 16;
  const [mem, setMem] = useState(s.defaultMemoryGb);
  const [searching, setSearching] = useState(false);
  const javaJob = app.jobs.find((j) => j.id === "runtime-jre-legacy");
  useEffect(() => { if (inApp && !app.javas) app.refreshJava().catch(() => {}); }, []);
  useEffect(() => { if (javaJob?.state === "done") app.refreshJava().catch(() => {}); }, [javaJob?.state]);
  return (
    <>
      <Group title="Defaults for new installations">
        <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div className="tx"><b>Memory</b><span>{app.paths ? `This PC has ${Math.round(app.paths.totalMemoryMb / 1024)} GB. ` : ""}1.8.9 runs best with 2–4 GB.</span></div>
            <span className="t-strong" style={{ background: "var(--window)", padding: "6px 12px", borderRadius: 8 }}>{mem} GB</span>
          </div>
          <input className="slider" type="range" min={1} max={max} value={mem} aria-label="Default memory in GB" style={{ ["--fill" as string]: `${((mem - 1) / (max - 1)) * 100}%` }} onChange={(e) => setMem(+e.target.value)} onMouseUp={() => set({ defaultMemoryGb: mem })} onKeyUp={() => set({ defaultMemoryGb: mem })} />
        </div>
        <Row title="Window size" detail={`${s.defaultWidth} × ${s.defaultHeight}`}>
          <Select label="Default window size" width={150} value={`${s.defaultWidth}x${s.defaultHeight}`} options={["854x480", "1280x720", "1600x900", "1920x1080"].map((v) => ({ value: v, label: v.replace("x", " × ") }))} onChange={(v) => { const [w, h] = v.split("x").map(Number); set({ defaultWidth: w, defaultHeight: h }); }} />
        </Row>
        <Row title="Start in fullscreen"><Toggle label="Start in fullscreen" checked={s.defaultFullscreen} onChange={(v) => set({ defaultFullscreen: v })} /></Row>
        <Row title="When Minecraft starts" detail="What Kestrel does while you play.">
          <Select label="When Minecraft starts" width={190} value={s.onGameStart} options={["Minimise Kestrel", "Keep Kestrel open", "Close Kestrel"].map((v) => ({ value: v, label: v }))} onChange={(v) => set({ onGameStart: v })} />
        </Row>
      </Group>
      <Group title="Java on this PC">
        {!inApp ? <Row title="Java" detail={DESKTOP_ONLY} /> : app.javas === null ? <Row title="Searching…"><span className="spinner" /></Row> : app.javas.length === 0 ? <Row title="No Java found" detail="Kestrel downloads Java 8 automatically when you launch, or you can get it now." /> :
          app.javas.map((j) => (
            <Row key={j.path} title={`Java ${j.version}${j.major === 8 ? " · works with 1.8.9" : ""}`} detail={`${j.source} · ${j.arch} · ${j.path}`}>
              {j.major === 8 && j.arch.includes("64") ? <span className="chip green">Compatible</span> : <span className="chip">Java {j.major}</span>}
            </Row>
          ))}
        <Row title="Mojang's Java 8 runtime" detail={javaJob?.state === "running" ? javaJob.detail : "The same Java the official launcher uses for 1.8.9. Stored in Kestrel's folder."}>
          <button className="btn sm" disabled={!inApp || searching} onClick={() => { setSearching(true); app.refreshJava().catch(() => {}).finally(() => setSearching(false)); }}>{searching ? <span className="spinner" /> : <RefreshCw size={14} />}Search again</button>
          <button className="btn green sm" disabled={!inApp || javaJob?.state === "running"} onClick={() => api.installJava().catch((e) => app.notify(errText(e), "error"))}><Download size={14} />{javaJob?.state === "done" ? "Reinstall" : "Download"}</button>
        </Row>
      </Group>
    </>
  );
}

function General() {
  const app = useApp(), s = app.settings, set = app.setSettings;
  return (
    <>
      <Group title="Appearance">
        <Row title="Language"><Select label="Language" width={160} value={s.language} options={[{ value: "English", label: "English" }]} onChange={(v) => set({ language: v })} /></Row>
        <Row title="Reduce motion" detail="Shorter transitions, no sweep and no decorative animation."><Toggle label="Reduce motion" checked={s.reducedMotion} onChange={(v) => set({ reducedMotion: v })} /></Row>
        <Row title="Section sweep" detail="The Kestrel sweep when you move between sidebar sections."><Toggle label="Section sweep" checked={s.sectionTransitions} disabled={s.reducedMotion} onChange={(v) => set({ sectionTransitions: v })} /></Row>
      </Group>
      <Group title="Sounds">
        <Row title="Interface sounds" detail="Only for Launch, finished downloads and errors. Never for clicks."><Toggle label="Interface sounds" checked={s.interfaceSounds} onChange={(v) => { set({ interfaceSounds: v }); if (v) sfx.done(s.soundVolume); }} /></Row>
        <Row title="Volume">
          <input className="slider" type="range" min={0} max={100} value={Math.round(s.soundVolume * 100)} aria-label="Sound volume" disabled={!s.interfaceSounds} style={{ width: 200, ["--fill" as string]: `${s.soundVolume * 100}%` }}
            onChange={(e) => set({ soundVolume: +e.target.value / 100 })} onMouseUp={() => sfx.done(s.soundVolume)} />
        </Row>
      </Group>
      <Group title="Startup">
        <Row title="Start on"><Select label="Start on" width={160} value={s.startOn} options={["Home", "Installations", "Explore", "Servers"].map((v) => ({ value: v, label: v }))} onChange={(v) => set({ startOn: v })} /></Row>
        <Row title="Open Kestrel when Windows starts" detail="Coming in a later update."><Toggle label="Open with Windows" checked={false} disabled onChange={() => {}} /></Row>
      </Group>
    </>
  );
}

/** "Sign in with Discord": links the player's Discord account (for perks like capes later). */
function DiscordAccount() {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const link = async () => {
    setBusy(true);
    try { const u = await api.discordLink(); app.setDiscordUser(u); app.notify(`Discord linked: ${u.displayName}.`); }
    catch (e) { app.notify(errText(e), "error"); }
    setBusy(false);
  };
  const u = app.discordUser;
  return (
    <Group title="Discord account">
      {u ? (
        <Row title={u.displayName} detail={`@${u.username} · Linked. Free cosmetics like capes will show up here when they launch.`}>
          {u.avatarUrl && <img src={u.avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: "50%" }} />}
          <button className="btn sm" onClick={() => api.discordUnlink().then(() => { app.setDiscordUser(null); app.notify("Discord unlinked."); }).catch((e) => app.notify(errText(e), "error"))}>Unlink</button>
        </Row>
      ) : (
        <Row title="Not linked" detail="Link Discord to get free Kestrel cosmetics, like a cape, when they launch.">
          <button disabled={!inApp || busy} onClick={link} style={{ display: "flex", alignItems: "center", gap: 10, height: 36, padding: "0 14px 0 12px", borderRadius: 8, background: "#5865F2", color: "#fff", fontWeight: 600 }}>
            {busy ? <span className="spinner" /> : <svg width="18" height="14" viewBox="0 0 127 96" aria-hidden="true"><path fill="#fff" d="M107.7 8.07A105 105 0 0 0 81.47 0a72 72 0 0 0-3.36 6.83 97.7 97.7 0 0 0-29.11 0A72 72 0 0 0 45.64 0a105.9 105.9 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.7 105.7 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.4 68.4 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.6 75.6 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.7 68.7 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.3 105.3 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" /></svg>}
            {busy ? "Waiting for browser…" : "Sign in with Discord"}
          </button>
        </Row>
      )}
    </Group>
  );
}

function Account() {
  const app = useApp(), s = app.settings, set = app.setSettings;
  const [name, setName] = useState(s.offlineName);
  const nameOk = /^[A-Za-z0-9_]{3,16}$/.test(name);
  return (
    <>
      <Group title="Microsoft account">
        {app.account ? (
          <Row title={app.account.name} detail="Signed in. Online servers like Hypixel work.">
            <img src={`https://mc-heads.net/avatar/${app.account.uuid}/64`} alt="" style={{ width: 32, height: 32, borderRadius: 6, imageRendering: "pixelated" }} />
            <button className="btn sm" onClick={() => api.signOut().then(() => { app.setAccount(null); app.notify("Signed out."); }).catch((e) => app.notify(errText(e), "error"))}>Sign out</button>
          </Row>
        ) : (
          <Row title="Not signed in" detail="Needed for online servers. Singleplayer works offline.">
            <button onClick={() => signInDialog(app)} style={{ display: "flex", alignItems: "center", gap: 10, height: 36, padding: "0 14px 0 12px", borderRadius: 8, background: "#2f2f2f", color: "#fff", fontWeight: 600, boxShadow: "inset 0 0 0 1px rgba(140,140,140,.5)" }}>
              <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true"><rect width="10" height="10" fill="#f25022" /><rect x="11" width="10" height="10" fill="#7fba00" /><rect y="11" width="10" height="10" fill="#00a4ef" /><rect x="11" y="11" width="10" height="10" fill="#ffb900" /></svg>
              Sign in with Microsoft
            </button>
          </Row>
        )}
      </Group>
      <p className="t-cap" style={{ display: "flex", gap: 8, alignItems: "center" }}><ShieldCheck size={14} />Kestrel opens Microsoft's own sign-in page and never sees your password. Your sign-in is encrypted for your Windows account only.</p>
      <Group title="Offline play">
        <Row title="Offline name" detail={nameOk ? "Used when you launch without signing in. Singleplayer only." : "3–16 letters, numbers or _"}>
          <input className="field on-surface" style={{ width: 180 }} value={name} maxLength={16} onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
            onBlur={() => { if (nameOk) set({ offlineName: name }); else setName(s.offlineName); }} aria-label="Offline name" />
        </Row>
      </Group>
      <DiscordAccount />
      <Group title="Skin & cape"><Row title="Change skin and cape" detail="Coming in a later update."><span className="t-cap">Planned</span></Row></Group>
    </>
  );
}

function Storage() {
  const app = useApp(), s = app.settings, set = app.setSettings;
  const open = (t: "data" | "logs") => api.openFolder(t).catch((e) => app.notify(errText(e), "error"));
  return (
    <>
      <Group title="Folders">
        <Row title="Kestrel folder" detail={app.paths?.data ?? "%APPDATA%\\Kestrel"}><button className="btn sm" disabled={!inApp} onClick={() => open("data")}><FolderOpen size={14} />Open</button></Row>
        <Row title="Logs" detail={app.paths?.logs ?? "%APPDATA%\\Kestrel\\logs"}><button className="btn sm" disabled={!inApp} onClick={() => open("logs")}><FileText size={14} />Open</button></Row>
      </Group>
      <Group title="Shared game files">
        <Row title="Versions, libraries and assets" detail="Downloaded once and shared by every installation, so new installations take seconds." />
      </Group>
      <Group title="Clean up">
        <Row title="Keep logs for"><Select label="Keep logs for" width={150} value={s.keepLogs} options={["7 days", "14 days", "30 days", "Forever"].map((v) => ({ value: v, label: v }))} onChange={(v) => set({ keepLogs: v })} /></Row>
      </Group>
    </>
  );
}

function Notifications() {
  const app = useApp(), s = app.settings, set = app.setSettings;
  const opts = [["always", "Always", "Even when Kestrel is in front."], ["background", "Only in the background", "Recommended. When Kestrel is minimised or behind other windows."], ["never", "Never", ""]] as const;
  return (
    <>
      <Group title="Desktop notifications">
        {opts.map(([v, t, d]) => (
          <button key={v} className="row" style={{ width: "100%", textAlign: "left" }} role="radio" aria-checked={s.notifyMode === v} onClick={() => set({ notifyMode: v })}>
            <span className={"radio" + (s.notifyMode === v ? " on" : "")} /><span className="tx"><b>{t}</b>{d && <span>{d}</span>}</span>
          </button>
        ))}
      </Group>
      <Group title="Tell me about">
        <Row title="Finished downloads"><Toggle label="Finished downloads" checked={s.notifyDownloads} onChange={(v) => set({ notifyDownloads: v })} /></Row>
        <Row title="Launcher updates"><Toggle label="Launcher updates" checked={s.notifyUpdates} onChange={(v) => set({ notifyUpdates: v })} /></Row>
        <Row title="Errors while installing or launching"><Toggle label="Errors" checked={s.notifyErrors} onChange={(v) => set({ notifyErrors: v })} /></Row>
      </Group>
    </>
  );
}

function Discord() {
  const app = useApp(), s = app.settings, set = app.setSettings;
  return (
    <>
      <Group>
        <Row title="Rich Presence" detail="Shows Kestrel and what you're playing on your Discord profile."><Toggle label="Rich Presence" checked={s.discordPresence} onChange={(v) => set({ discordPresence: v })} /></Row>
        <Row title="Show while in the launcher" detail="“In the Kestrel launcher” when the game isn't running."><Toggle label="Show while in the launcher" checked={s.discordInLauncher} disabled={!s.discordPresence} onChange={(v) => set({ discordInLauncher: v })} /></Row>
        <Row title="Show server name" detail="“On mc.hypixel.net” instead of “In multiplayer”."><Toggle label="Show server name" checked={s.discordShowServer} disabled={!s.discordPresence} onChange={(v) => set({ discordShowServer: v })} /></Row>
      </Group>
      <DiscordAccount />
      <p className="t-cap">Your status shows while the Discord app is open on this PC.</p>
    </>
  );
}

function Privacy() {
  const app = useApp(), s = app.settings, set = app.setSettings;
  return (
    <>
      <div style={{ display: "flex", gap: 12, padding: 16, borderRadius: 12, background: "var(--surface)" }}>
        <ShieldCheck size={20} color="var(--accent-text)" />
        <div><b className="t-strong">No analytics, no ads</b><p className="t-cap" style={{ marginTop: 2, lineHeight: "18px" }}>Kestrel doesn't track how you use it. It only talks to Mojang, Microsoft, Modrinth and the servers you add.</p></div>
      </div>
      <Group title="Diagnostics">
        <Row title="Send crash reports" detail="Off. Crash reporting isn't built yet; when it is, you'll review every report first."><Toggle label="Send crash reports" checked={s.crashReports} disabled onChange={(v) => set({ crashReports: v })} /></Row>
        <Row title="Logs" detail="Sign-in tokens are never written to logs."><button className="btn sm" disabled={!inApp} onClick={() => api.openFolder("logs").catch((e) => app.notify(errText(e), "error"))}><FileText size={14} />Open logs</button></Row>
      </Group>
    </>
  );
}
