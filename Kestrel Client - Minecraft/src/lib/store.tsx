import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { api, inApp, onJob, onMission, type AccountInfo, type DiscordUser, type Job, type JavaInstall, type Paths, type ServiceMe, type McProfile } from "./api";
import { headFromSkin } from "./skin";

export type Mode = "Standard" | "OptiFine";
export type Installation = {
  id: string; name: string; version: string; mode: Mode; memoryGb: number; cover: string;
  javaPath: string | null; jvmArgs: string; width: number; height: number; fullscreen: boolean;
  createdAt: number; lastPlayed: number | null; optifine?: string | null;
  /** Server to join automatically when launching (QOL "Join on launch"). */
  autoJoin?: string | null;
  /** Saved resource pack sets: name -> packs (top first). */
  packProfiles?: { name: string; packs: string[] }[];
};
export type Server = { id: string; name: string; address: string };
export type HistoryItem = { kind: "server" | "world"; name: string; detail: string; version: string; at: number; serverAddress?: string; installationId?: string; icon?: string; folder?: string };

export type Settings = {
  reducedMotion: boolean; sectionTransitions: boolean;
  language: string; onGameStart: string; startOn: string; updateChannel: string; keepLogs: string;
  notifyMode: "always" | "background" | "never"; notifyDownloads: boolean; notifyUpdates: boolean; notifyErrors: boolean;
  discordPresence: boolean; discordShowServer: boolean; discordHideIdle: boolean; discordInLauncher: boolean; crashReports: boolean;
  offlineName: string; backupBeforeLaunch: boolean;
  defaultMemoryGb: number; defaultWidth: number; defaultHeight: number; defaultFullscreen: boolean;
};

export type Route =
  | { name: "home" }
  | { name: "installations"; id?: string; tab?: string }
  | { name: "explore"; type?: string; target?: string }
  | { name: "project"; id: string; target?: string }
  | { name: "servers" }
  | { name: "friends" }
  | { name: "cosmetics" }
  | { name: "staff"; tab?: string }
  | { name: "settings"; tab?: string }
  | { name: "updates" };

export const SECTION_ORDER = ["home", "installations", "explore", "servers", "friends", "cosmetics", "staff", "settings"] as const;
export const sectionOf = (r: Route) => (r.name === "project" ? "explore" : r.name === "updates" ? "home" : r.name);

/** Newest Minecraft version Kestrel supports; new installations start here. */
export const LATEST_VERSION = "1.8.9";

export const COVERS: Record<string, { label: string; src: string }> = {
  windhover: { label: "Windhover", src: "/assets/art/windhover.jpg" },
  nightwatch: { label: "Night Watch", src: "/assets/art/nightwatch.jpg" },
  firstlight: { label: "First Light", src: "/assets/art/firstlight.jpg" },
  hypixel: { label: "Hypixel", src: "/assets/imgHypixelBackground1.png" },
  cave: { label: "Cave", src: "/assets/imgRectangle.png" },
  sunset: { label: "Sunset lake", src: "/assets/v3/complementary.jpg" },
  meadow: { label: "Meadow", src: "/assets/v3/bsl.jpg" },
  classic: { label: "Classic", src: "/assets/imgMinecraftOfficialPcArtwork.png" },
};

export const defaultSettings: Settings = {
  reducedMotion: false, sectionTransitions: true,
  language: "English", onGameStart: "Minimise Kestrel", startOn: "Home", updateChannel: "Stable", keepLogs: "14 days",
  notifyMode: "background", notifyDownloads: true, notifyUpdates: true, notifyErrors: true,
  discordPresence: true, discordShowServer: false, discordHideIdle: true, discordInLauncher: true, crashReports: false,
  offlineName: "Player", backupBeforeLaunch: false,
  defaultMemoryGb: 3, defaultWidth: 1280, defaultHeight: 720, defaultFullscreen: false,
};

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "installation";
export function makeInstallation(name: string, fields: Partial<Installation>, taken: string[], s: Settings = defaultSettings): Installation {
  let id = slugify(name), n = 2;
  while (taken.includes(id)) id = `${slugify(name)}-${n++}`;
  return { id, name, version: LATEST_VERSION, mode: "Standard", memoryGb: s.defaultMemoryGb, cover: "nightwatch", javaPath: null, jvmArgs: "",
    width: s.defaultWidth, height: s.defaultHeight, fullscreen: s.defaultFullscreen, createdAt: Date.now(), lastPlayed: null, ...fields };
}

type Saved = { settings: Settings; installations: Installation[]; selectedId: string; servers: Server[]; history: HistoryItem[] };
const KEY = "kestrel.v3";

function load(): Saved {
  // First run: one blank installation on the newest supported version.
  const def = makeInstallation("Default", {}, []);
  const fallback: Saved = { settings: { ...defaultSettings, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches },
    installations: [def], selectedId: def.id, servers: [{ id: "hypixel", name: "Hypixel", address: "mc.hypixel.net" }], history: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Saved>;
      const installations = s.installations?.length ? s.installations : fallback.installations;
      const settings = { ...fallback.settings, ...s.settings }; if (settings.onGameStart === "Close Kestrel") settings.onGameStart = "Hide Kestrel";
      return { settings, installations,
        selectedId: installations.some((i) => i.id === s.selectedId) ? s.selectedId! : installations[0].id,
        servers: s.servers ?? fallback.servers, history: s.history ?? [] };
    }
    // Carry over installations and servers from the previous launcher build.
    const old = localStorage.getItem("kestrel.launcher.v1");
    if (old) {
      const o = JSON.parse(old);
      const taken: string[] = [];
      const installations: Installation[] = (o.installations ?? []).map((i: any) => {
        const inst = makeInstallation(i.name ?? "Installation", { version: "1.8.9", mode: i.mode === "Standard" ? "Standard" : "OptiFine", memoryGb: i.memoryGb ?? 3, jvmArgs: i.jvmArgs ?? "", fullscreen: !!i.fullscreen, cover: "hypixel" }, taken);
        taken.push(inst.id); return inst;
      });
      if (installations.length) return { ...fallback, installations, selectedId: installations[0].id, servers: o.servers ?? fallback.servers };
    }
  } catch { /* storage unavailable: start fresh */ }
  return fallback;
}

/** sub: one line under the title. icon: shown in the tile left of the title. tone "danger" tints the tile red. */
export type Dialog = { title: string; body: React.ReactNode; wide?: boolean; sub?: React.ReactNode; icon?: React.ReactNode; tone?: "danger" };

function useAppState() {
  const [saved, setSaved] = useState<Saved>(load);
  const [route, setRoute] = useState<Route>({ name: "home" });
  const back = useRef<Route[]>([]), fwd = useRef<Route[]>([]);
  const [navTick, setNavTick] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; tone?: "error" } | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [paths, setPaths] = useState<Paths | null>(null);
  const [javas, setJavas] = useState<JavaInstall[] | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [discordUser, setDiscordUser] = useState<DiscordUser | null>(null);
  useEffect(() => {
    if (!inApp) return;
    api.accountStatus().then(setAccount).catch(() => {});
    api.discordUser().then(setDiscordUser).catch(() => {});
  }, []);
  // Your Minecraft skin and capes from Mojang (signed-in players), plus your head cut from the skin.
  const [mcProfile, setMcProfile] = useState<McProfile | null>(null);
  const [head, setHead] = useState<string | null>(null);
  const refreshMcProfile = useCallback(async () => {
    if (!inApp || !account) { setMcProfile(null); setHead(null); return; }
    try {
      const p = await api.minecraftProfile();
      setMcProfile(p);
      setHead(p?.skin ? await headFromSkin(p.skin) : null);
    } catch { setMcProfile(null); }
  }, [account?.uuid]);
  useEffect(() => { refreshMcProfile(); }, [refreshMcProfile]);
  // Kestrel's online service: staff role, ban, Plus and given cosmetics for the linked Discord account.
  const [me, setMe] = useState<ServiceMe | null>(null);
  const refreshMe = useCallback(async () => {
    if (!inApp || !discordUser || !(await api.serviceReady().catch(() => false))) { setMe(null); return; }
    const v = await getVersion().catch(() => "");
    api.service<ServiceMe>("GET", `/v1/me?v=${encodeURIComponent(v)}`).then(setMe).catch(() => setMe(null));
  }, [discordUser?.id]);
  useEffect(() => {
    refreshMe();
    const t = setInterval(refreshMe, 10 * 60000);
    // A cape picked in game (and friends news) arrive with kestrel://me.
    const un = inApp ? listen("kestrel://me", () => refreshMe()) : null;
    return () => { clearInterval(t); un?.then((f) => f()); };
  }, [refreshMe]);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* ignore */ } }, [saved]);

  const notify = useCallback((text: string, tone?: "error") => {
    setToast({ id: Date.now(), text, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3800);
  }, []);

  useEffect(() => {
    const un = onJob((j) => setJobs((all) => {
      const i = all.findIndex((x) => x.id === j.id);
      const next = i >= 0 ? all.map((x) => (x.id === j.id ? j : x)) : [j, ...all];
      return next.slice(0, 30);
    }));
    return () => { un.then((f) => f()); };
  }, []);

  // Servers joined from inside Minecraft (read from the game log by the backend).
  useEffect(() => {
    if (!inApp) return;
    const un = listen<{ host: string; instanceId: string; version: string }>("kestrel://joined", (e) => {
      const { host, instanceId, version } = e.payload;
      setSaved((s) => {
        const known = s.servers.find((x) => x.address.toLowerCase() === host.toLowerCase() || x.address.toLowerCase().startsWith(host.toLowerCase() + ":"));
        const h: HistoryItem = { kind: "server", name: known?.name ?? host, detail: host, version, at: Date.now(), serverAddress: host, installationId: instanceId };
        return { ...s, history: [h, ...s.history.filter((x) => (x.serverAddress ?? "").toLowerCase() !== host.toLowerCase())].slice(0, 20) };
      });
    });
    // A one-click crash fix from Launch Control (more memory, no Java arguments, automatic Java) is kept.
    const unFix = listen<{ instanceId: string; memoryGb?: number; jvmArgs?: string; javaPath?: null }>("kestrel://fix", (e) => {
      const { instanceId, ...patch } = e.payload;
      setSaved((s) => ({ ...s, installations: s.installations.map((i) => (i.id === instanceId ? { ...i, ...patch } : i)) }));
    });
    return () => { un.then((f) => f()); unFix.then((f) => f()); };
  }, []);

  // Link your Minecraft account to Kestrel once (needs Microsoft + Discord): friends find you by your
  // Minecraft name, and other Kestrel players see your cape.
  const linkTried = useRef("");
  useEffect(() => {
    if (!inApp || !me || !account) return;
    const want = account.uuid.replace(/-/g, "").toLowerCase();
    if (me.minecraft?.uuid?.toLowerCase() === want || linkTried.current === want) return;
    linkTried.current = want;
    api.linkMinecraft().then(() => refreshMe()).catch(() => {});
  }, [me?.minecraft?.uuid, account?.uuid]);

  // Presence for friends: in the launcher, or playing (and on which server), about once a minute.
  const [playing, setPlaying] = useState<{ on: boolean; server: string | null }>({ on: false, server: null });
  useEffect(() => {
    if (!inApp) return;
    const un = onMission((e) => {
      if (e.kind !== "state") return;
      if (e.status === "running") setPlaying((p) => ({ ...p, on: true }));
      if (e.status === "exited" || e.status === "crashed") setPlaying({ on: false, server: null });
    });
    const unJoin = listen<{ host: string }>("kestrel://joined", (e) => setPlaying({ on: true, server: e.payload.host }));
    return () => { un.then((f) => f()); unJoin.then((f) => f()); };
  }, []);
  useEffect(() => {
    if (!inApp || !me) return;
    const send = () => api.service("POST", "/v1/me/presence", { state: playing.on ? "playing" : "launcher", server: playing.server ?? "" }).catch(() => {});
    send();
    const t = setInterval(send, 60000);
    return () => clearInterval(t);
  }, [!!me, playing.on, playing.server]);

  // Settings → Storage → "Keep logs for": clean up at start and whenever it changes.
  useEffect(() => {
    if (!inApp) return;
    const days = parseInt(saved.settings.keepLogs, 10);
    api.cleanupLogs(Number.isFinite(days) ? days : null).catch(() => {});
  }, [saved.settings.keepLogs]);

  const navigate = useCallback((r: Route) => {
    setRoute((cur) => { if (JSON.stringify(cur) !== JSON.stringify(r)) { back.current.push(cur); fwd.current = []; } return r; });
    setNavTick((t) => t + 1);
  }, []);
  const goBack = useCallback(() => { const r = back.current.pop(); if (!r) return; setRoute((cur) => { fwd.current.push(cur); return r; }); setNavTick((t) => t + 1); }, []);
  const goForward = useCallback(() => { const r = fwd.current.pop(); if (!r) return; setRoute((cur) => { back.current.push(cur); return r; }); setNavTick((t) => t + 1); }, []);

  const setSettings = useCallback((p: Partial<Settings>) => setSaved((s) => ({ ...s, settings: { ...s.settings, ...p } })), []);
  const updateInstallation = useCallback((id: string, p: Partial<Installation>) =>
    setSaved((s) => ({ ...s, installations: s.installations.map((i) => (i.id === id ? { ...i, ...p } : i)) })), []);
  const addInstallation = useCallback((i: Installation) => setSaved((s) => ({ ...s, installations: [...s.installations, i], selectedId: i.id })), []);
  const removeInstallation = useCallback((id: string) => setSaved((s) => {
    const left = s.installations.filter((i) => i.id !== id);
    if (!left.length) return s;
    return { ...s, installations: left, selectedId: s.selectedId === id ? left[0].id : s.selectedId };
  }), []);
  const selectInstallation = useCallback((id: string) => setSaved((s) => ({ ...s, selectedId: id })), []);
  /** Remembers a server you launched into (newest first, one entry per address). */
  const addHistory = useCallback((h: HistoryItem) => setSaved((s) => ({ ...s, history: [h, ...s.history.filter((x) => !(x.kind === h.kind && (x.serverAddress ?? x.name) === (h.serverAddress ?? h.name)))].slice(0, 20) })), []);
  const addServer = useCallback((sv: Server) => setSaved((s) => ({ ...s, servers: [...s.servers, sv] })), []);
  const removeServer = useCallback((id: string) => setSaved((s) => ({ ...s, servers: s.servers.filter((x) => x.id !== id) })), []);
  const clearJobs = useCallback(() => setJobs((j) => j.filter((x) => x.state === "running")), []);
  const refreshJava = useCallback(async () => { if (!inApp) { setJavas([]); return []; } const j = await api.detectJava(); setJavas(j); return j; }, []);

  const selected = saved.installations.find((i) => i.id === saved.selectedId) ?? saved.installations[0];

  return useMemo(() => ({
    ...saved, selected, route, navigate, goBack, goForward, canBack: back.current.length > 0, canForward: fwd.current.length > 0, navTick,
    dialog, openDialog: setDialog, closeDialog: () => setDialog(null), toast, notify, jobs, clearJobs,
    paths, setPaths, javas, setJavas, refreshJava, account, setAccount, discordUser, setDiscordUser, me, refreshMe, mcProfile, head, refreshMcProfile,
    setSettings, updateInstallation, addInstallation, removeInstallation, selectInstallation, addServer, removeServer, addHistory,
  }), [addHistory,saved, selected, route, navigate, goBack, goForward, navTick, dialog, toast, notify, jobs, clearJobs, paths, javas, refreshJava, account, discordUser, me, refreshMe, mcProfile, head, refreshMcProfile,
    setSettings, updateInstallation, addInstallation, removeInstallation, selectInstallation, addServer, removeServer]);
}

export type AppState = ReturnType<typeof useAppState>;
const Ctx = createContext<AppState | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
  const v = useAppState();
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}
export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
