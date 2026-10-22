// Typed wrappers around Kestrel's Rust commands and events.
import { invoke, isTauri, convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const inApp = isTauri();
export const DESKTOP_ONLY = "Available in the Kestrel desktop app.";

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inApp) throw new Error(DESKTOP_ONLY);
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw new Error(typeof e === "string" ? e : e instanceof Error ? e.message : "Something went wrong.");
  }
}

export type Paths = { data: string; instances: string; logs: string; totalMemoryMb: number };
export type JavaInstall = { path: string; version: string; major: number; arch: string; vendor: string; source: string };
export type VersionSummary = { id: string; kind: string; releaseTime: string };
export type ContentFile = { file: string; name: string; size: number; enabled: boolean; modified: number };
export type ServerStatus = { online: boolean; playersOnline?: number; playersMax?: number; version?: string; motd?: string; favicon?: string; pingMs?: number; error?: string };
export type Job = { id: string; title: string; detail: string; state: "running" | "done" | "failed" | "cancelled"; done: number; total: number; error?: string };
export type MissionEvent = { kind: "reset" | "step" | "log" | "state"; step?: string; status?: string; label?: string; detail?: string; level?: string; line?: string; time: string };
export type ContentKind = "mods" | "resourcepacks" | "shaderpacks" | "screenshots" | "saves";

export type LaunchRequest = {
  instanceId: string; name: string; version: string; mode: string; memoryGb: number;
  javaPath: string | null; jvmArgs: string; width: number; height: number; fullscreen: boolean; server: string | null; optifine: string | null; offlineName: string | null; world?: string | null; backupWorlds?: boolean;
};
export type AccountInfo = { name: string; uuid: string };
export type DiscordUser = { id: string; username: string; displayName: string; avatarUrl?: string; linkedAt: number };
export type Presence = { details: string; state: string; startMs?: number };
export type PackEntry = { file: string; name: string; size: number };
export type ImportScan = { found: boolean; path: string; options: boolean; servers: { name: string; address: string }[]; resourcepacks: PackEntry[]; shaderpacks: PackEntry[]; optifine: string[] };
export type UpdateFile = { url: string; filename: string; sha1?: string; sha512?: string; size?: number; versionNumber: string };
export type Identified = { file: string; sha1: string; projectId?: string; slug?: string; title?: string; iconUrl?: string; versionNumber?: string; versionId?: string; url?: string; update?: UpdateFile };
export type World = { folder: string; name: string; lastPlayed: number; size: number; icon?: string; mode?: string };
export type LaunchRecord = { file: string; title: string; time: number; outcome: string; status: string };
export type Stats = { cpu: number; memoryMb: number };

export const api = {
  paths: () => call<Paths>("app_paths"),
  prepareInstance: (id: string) => call<string>("prepare_instance", { id }),
  listContent: (id: string, kind: ContentKind) => call<ContentFile[]>("list_content", { id, kind }),
  setContentEnabled: (id: string, kind: ContentKind, file: string, enabled: boolean) => call<string>("set_content_enabled", { id, kind, file, enabled }),
  deleteContent: (id: string, kind: ContentKind, file: string) => call<void>("delete_content", { id, kind, file }),
  openFolder: (target: "data" | "logs" | "instance" | "content" | "backups", id?: string, kind?: ContentKind) => call<void>("open_folder", { target, id, kind }),
  importScan: () => call<ImportScan>("import_scan"),
  importInto: (args: { instanceId: string; options: boolean; servers: boolean; resourcepacks: string[]; shaderpacks: string[] }) => call<number>("import_into", { args }),
  optifineList: () => call<string[]>("optifine_list"),
  optifineRunInstaller: (path: string) => call<void>("optifine_run_installer", { path }),
  optifineImport: (id: string) => call<string>("optifine_import", { id }),
  identifyContent: (id: string, kind: ContentKind, gameVersion: string) => call<Identified[]>("identify_content", { id, kind, gameVersion }),
  importFiles: (id: string, paths: string[]) => call<{ file: string; kind?: string; error?: string }[]>("import_files", { id, paths }),
  listWorlds: (id: string) => call<World[]>("list_worlds", { id }),
  backupWorld: (id: string, folder: string) => call<string>("backup_world", { id, folder }),
  exportInstallation: (path: string, id: string, installation: unknown) => call<number>("export_installation", { args: { path, id, installation } }),
  readInstallationFile: (path: string) => call<any>("read_installation_file", { path }),
  accountStatus: () => call<AccountInfo | null>("account_status"),
  signIn: () => call<AccountInfo>("account_sign_in"),
  signOut: () => call<void>("account_sign_out"),
  discordUser: () => call<DiscordUser | null>("discord_user"),
  discordLink: () => call<DiscordUser>("discord_link"),
  discordUnlink: () => call<void>("discord_unlink"),
  discordPrefs: (enabled: boolean, showServer: boolean, inLauncher: boolean) => call<void>("discord_prefs", { enabled, showServer, inLauncher }),
  discordLauncher: (presence: Presence | null) => call<void>("discord_launcher", { presence }),
  listLaunches: () => call<LaunchRecord[]>("list_launches"),
  readLaunch: (file: string) => call<MissionEvent[]>("read_launch", { file }),
  revealFile: (id: string, kind: ContentKind, file: string) => call<void>("reveal_file", { id, kind, file }),
  openLink: (url: string) => (inApp ? call<void>("open_link", { url }) : Promise.resolve(void window.open(url, "_blank", "noopener"))),
  detectJava: () => call<JavaInstall[]>("detect_java"),
  installJava: () => call<string>("install_java_runtime"),
  mcVersions: () => call<VersionSummary[]>("mc_versions"),
  installGame: (version: string) => call<void>("install_game", { version }),
  gameStatus: (version: string) => call<{ id: string; installed: boolean; path: string }>("game_status", { version }),
  cancelJob: (id: string) => call<void>("cancel_job", { id }),
  pingServer: (address: string) => call<ServerStatus>("ping_server", { address }),
  launch: (req: LaunchRequest) => call<void>("launch_game", { req }),
  stopGame: () => call<void>("stop_game"),
  relaunchLast: (standard: boolean) => call<void>("relaunch_last", { standard }),
  getActivePacks: (id: string) => call<string[]>("get_active_packs", { id }),
  setActivePacks: (id: string, packs: string[]) => call<void>("set_active_packs", { id, packs }),
  missionSnapshot: () => call<MissionEvent[]>("mission_snapshot"),
  installContent: (args: { instanceId: string; kind: ContentKind; url: string; filename: string; sha1?: string; sha512?: string; size?: number; title: string }) =>
    call<string>("install_content", { args }),
};

export function fileUrl(absPath: string) {
  return inApp ? convertFileSrc(absPath) : "";
}

export function onJob(fn: (j: Job) => void): Promise<UnlistenFn> {
  return inApp ? listen<Job>("kestrel://job", (e) => fn(e.payload)) : Promise.resolve(() => {});
}
export function onStats(fn: (s: Stats) => void): Promise<UnlistenFn> {
  return inApp ? listen<Stats>("kestrel://stats", (e) => fn(e.payload)) : Promise.resolve(() => {});
}
export function onMission(fn: (m: MissionEvent) => void): Promise<UnlistenFn> {
  return inApp ? listen<MissionEvent>("kestrel://mission", (e) => fn(e.payload)) : Promise.resolve(() => {});
}

// ---------------- Modrinth ----------------
export type ProjectType = "mod" | "resourcepack" | "shader" | "modpack";
export type SearchHit = {
  project_id: string; slug: string; title: string; description: string; author: string; icon_url: string | null;
  downloads: number; follows: number; categories: string[]; display_categories?: string[]; versions: string[]; project_type: string; gallery?: string[]; featured_gallery?: string | null;
};
export type SearchResult = { hits: SearchHit[]; offset: number; limit: number; total_hits: number };
export type SearchArgs = { query: string; projectType: ProjectType; sort: string; gameVersion?: string | null; loader?: string | null; offset: number; limit: number };
export type Project = {
  id: string; slug: string; title: string; description: string; body: string; icon_url: string | null; downloads: number; followers: number;
  project_type: string; loaders: string[]; game_versions: string[]; categories: string[]; client_side: string; server_side: string;
  license?: { id: string; name: string }; gallery: { url: string; title?: string | null; featured: boolean }[]; source_url?: string | null; team: string;
};
export type ModrinthVersion = {
  id: string; name: string; version_number: string; game_versions: string[]; loaders: string[]; date_published: string; downloads: number;
  files: { url: string; filename: string; primary: boolean; size: number; hashes: { sha1?: string; sha512?: string } }[];
};

const MR = "https://api.modrinth.com/v2";
async function mrFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const r = await fetch(`${MR}${path}?${new URLSearchParams(params)}`);
  if (!r.ok) throw new Error(`Modrinth returned ${r.status}`);
  return r.json();
}

export const modrinth = {
  search(a: SearchArgs): Promise<SearchResult> {
    if (inApp) return call("modrinth_search", { args: { ...a, gameVersion: a.gameVersion ?? null, loader: a.loader ?? null } });
    const facets: string[][] = [[`project_type:${a.projectType}`]];
    if (a.gameVersion) facets.push([`versions:${a.gameVersion}`]);
    if (a.loader) facets.push([`categories:${a.loader}`]);
    return mrFetch("/search", { query: a.query, facets: JSON.stringify(facets), index: a.sort, offset: String(a.offset), limit: String(a.limit) });
  },
  project(id: string): Promise<Project> {
    return inApp ? call("modrinth_project", { id }) : mrFetch(`/project/${id}`, {});
  },
  versions(id: string, gameVersion?: string | null, loaders?: string[] | null): Promise<ModrinthVersion[]> {
    if (inApp) return call("modrinth_versions", { id, gameVersion: gameVersion ?? null, loaders: loaders ?? null });
    const p: Record<string, string> = {};
    if (gameVersion) p.game_versions = JSON.stringify([gameVersion]);
    if (loaders) p.loaders = JSON.stringify(loaders);
    return mrFetch(`/project/${id}/version`, p);
  },
};

export const formatCount = (n: number) =>
  n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "K" : String(n);
export const formatBytes = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : n >= 1024 ? Math.round(n / 1024) + " KB" : n + " B");
