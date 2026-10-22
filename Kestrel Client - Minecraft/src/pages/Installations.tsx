import { useEffect, useMemo, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ArchiveRestore, ArrowUpCircle, Clock, Copy, Download, FileDown, FileUp, FolderOpen, Image as ImageIcon, Info, Package, Plus, Search, SlidersHorizontal, Sparkles, Trash2, Globe, Puzzle, Eye, Upload } from "lucide-react";
import { api, fileUrl, formatBytes, inApp, DESKTOP_ONLY, type ContentFile, type ContentKind, type Identified, type World } from "../lib/api";
import { COVERS, errText, makeInstallation, useApp, type AppState, type Installation, type Mode } from "../lib/store";
import { launchInstallation } from "../lib/launch";
import { confirmDialog, Group, Row, Seg, Select, Toggle } from "../components/ui";
import { exportInstallation, importInstallationFile, importSetupDialog, OptiFineGroup } from "../components/Extras";
import { modeIcon } from "./Home";

const TABS = ["Overview", "Content", "Worlds", "Screenshots", "Settings"] as const;
type Tab = (typeof TABS)[number];

export function Installations({ id, tab }: { id?: string; tab?: string }) {
  const app = useApp();
  const inst = app.installations.find((i) => i.id === id) ?? app.selected;
  const [q, setQ] = useState("");
  const current: Tab = (TABS as readonly string[]).includes(tab ?? "") ? (tab as Tab) : "Overview";
  const list = app.installations.filter((i) => (i.name + i.version + i.mode).toLowerCase().includes(q.trim().toLowerCase()));
  const cover = COVERS[inst.cover] ?? COVERS.hypixel;
  const setTab = (t: Tab) => app.navigate({ name: "installations", id: inst.id, tab: t });
  const dropping = useFileDrop(app, inst);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "288px minmax(0,1fr)", gap: 16, padding: 20, minHeight: "100%" }}>
      {dropping && <div className="drop-veil"><div><Upload size={26} /><b>Drop to add to {inst.name}</b><span>Mods, resource packs and shaders (.jar or .zip)</span></div></div>}
      <aside className="st" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="t-title">Installations</h2>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="ibtn grey sm" aria-label="Import installation file" title="Import a .kestrel file" onClick={() => importInstallationFile(app)}><FileUp size={15} /></button>
            <button className="ibtn grey sm" aria-label="New installation" onClick={() => newInstallationDialog(app)}><Plus size={16} /></button>
          </div>
        </div>
        <label className="search"><Search size={16} /><input placeholder="Search installations" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search installations" /></label>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {list.map((i) => {
            const on = i.id === inst.id;
            return (
              <button key={i.id} onClick={() => { app.selectInstallation(i.id); app.navigate({ name: "installations", id: i.id, tab: current }); }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px 8px 8px", borderRadius: 10, textAlign: "left", transition: "background var(--fast)",
                  background: on ? "var(--control)" : "transparent", boxShadow: on ? "inset 0 0 0 1px rgba(255,255,255,.14)" : "none" }}>
                <img src={(COVERS[i.cover] ?? COVERS.hypixel).src} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />
                <span style={{ flex: 1, minWidth: 0 }}><b className="t-strong" style={{ display: "block", color: on ? "var(--text)" : "var(--text2)" }}>{i.name}</b><span className="t-cap">{i.version} · {i.mode}</span></span>
                {app.selected.id === i.id && <span className="chip green">Selected</span>}
              </button>
            );
          })}
          {!list.length && <span className="t-cap" style={{ padding: 8 }}>No installations match “{q}”.</span>}
        </div>
      </aside>

      <section style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <div className="cover st" style={{ height: current === "Overview" ? 232 : 140, transition: "height var(--slow) var(--ease)", ["--i" as string]: 1 }}>
          <div className="art" style={{ backgroundImage: `url(${cover.src})` }} />
          <div className="scrim" />
          <div style={{ position: "absolute", left: 28, bottom: 24 }}>
            <h1 className="shadowtext" style={{ fontSize: current === "Overview" ? 34 : 26, fontWeight: 700, letterSpacing: -0.6, transition: "font-size var(--slow) var(--ease)" }}>{inst.name}</h1>
            <div className="t-small shadowtext" style={{ display: "flex", gap: 14, color: "#e3e7ec", marginTop: 6 }}>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}><img src="/assets/v3/mc.png" alt="" style={{ width: 15, height: 15 }} />{inst.version}</span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}><img src={modeIcon(inst.mode)} alt="" style={{ width: 15, height: 15, borderRadius: 3 }} />{inst.mode}</span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}><Clock size={14} color="#c9ced6" />Last played: {inst.lastPlayed ? new Date(inst.lastPlayed).toLocaleDateString() : "never"}</span>
            </div>
          </div>
          <div style={{ position: "absolute", right: 24, bottom: 24, display: "flex", gap: 8 }}>
            <button className="ibtn solid" style={{ width: 40, height: 40 }} aria-label="Open installation folder" onClick={() => api.openFolder("instance", inst.id).catch((e) => app.notify(errText(e), "error"))}><FolderOpen size={17} /></button>
            <button className="plain" onClick={() => { app.selectInstallation(inst.id); launchInstallation(app, inst); }}>LAUNCH GAME</button>
          </div>
        </div>
        <div className="st" style={{ ["--i" as string]: 2 }}>
          <Seg label="Installation sections" value={current} onChange={setTab} items={[
            { value: "Overview", label: "Overview", icon: <Info size={14} /> }, { value: "Content", label: "Content", icon: <Package size={14} /> },
            { value: "Worlds", label: "Worlds", icon: <Globe size={14} /> },
            { value: "Screenshots", label: "Screenshots", icon: <ImageIcon size={14} /> }, { value: "Settings", label: "Settings", icon: <SlidersHorizontal size={14} /> }]} />
        </div>
        <div key={current + inst.id} className="st" style={{ ["--i" as string]: 3 }}>
          {current === "Overview" && <Overview inst={inst} />}
          {current === "Content" && <Content inst={inst} />}
          {current === "Worlds" && <Worlds inst={inst} />}
          {current === "Screenshots" && <Screenshots inst={inst} />}
          {current === "Settings" && <InstSettings inst={inst} />}
        </div>
      </section>
    </div>
  );
}

function useCounts(inst: Installation) {
  const [c, setC] = useState<Record<string, number | null>>({ resourcepacks: null, shaderpacks: null, mods: null, saves: null, screenshots: null });
  useEffect(() => {
    if (!inApp) return;
    (["resourcepacks", "shaderpacks", "mods", "saves", "screenshots"] as ContentKind[]).forEach((k) =>
      api.listContent(inst.id, k).then((l) => setC((x) => ({ ...x, [k]: l.length }))).catch(() => {}));
  }, [inst.id]);
  return c;
}

function Overview({ inst }: { inst: Installation }) {
  const app = useApp();
  const counts = useCounts(inst);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const job = app.jobs.find((j) => j.id === `game-${inst.version}`);
  useEffect(() => { if (inApp) api.gameStatus(inst.version).then((s) => setInstalled(s.installed)).catch(() => setInstalled(null)); }, [inst.version, job?.state]);
  const dir = app.paths ? `${app.paths.instances}\\${inst.id}` : `%APPDATA%\\Kestrel\\instances\\${inst.id}`;
  const fmt = (n: number | null, one: string, many: string) => (n === null ? "—" : n === 0 ? "None yet" : `${n} ${n === 1 ? one : many}`);
  return (
    <div className="ov-grid">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
        <Group title="Setup">
          <Row title="Minecraft version" detail="Kestrel supports 1.8.9 today. More versions come later.">
            <Select label="Minecraft version" width={140} value={inst.version} options={[{ value: "1.8.9", label: "1.8.9" }]} onChange={(v) => app.updateInstallation(inst.id, { version: v })} />
          </Row>
          <Row title="Launch mode" detail="OptiFine adds zoom, shaders and smoother frames.">
            <Seg label="Launch mode" onSurface value={inst.mode} onChange={(m) => app.updateInstallation(inst.id, { mode: m as Mode })} items={(["Standard", "OptiFine"] as Mode[]).map((m) => ({ value: m, label: m, icon: <img src={modeIcon(m)} alt="" /> }))} />
          </Row>
          <Row title="Memory" detail={`${inst.memoryGb} GB${app.paths ? ` of ${Math.round(app.paths.totalMemoryMb / 1024)} GB` : ""}`}>
            <button className="link" onClick={() => app.navigate({ name: "installations", id: inst.id, tab: "Settings" })}>Adjust</button>
          </Row>
          <Row title="Game folder" detail={dir}>
            <button className="ibtn sm" aria-label="Copy folder path" onClick={() => { navigator.clipboard?.writeText(dir).then(() => app.notify("Folder path copied."), () => {}); }}><Copy size={15} /></button>
            <button className="ibtn sm" aria-label="Open game folder" onClick={() => api.openFolder("instance", inst.id).catch((e) => app.notify(errText(e), "error"))}><FolderOpen size={15} /></button>
          </Row>
        </Group>
        <Group title="Game files">
          <Row title={`Minecraft ${inst.version}`} detail={!inApp ? DESKTOP_ONLY : job?.state === "running" ? job.detail : installed ? "Downloaded and verified. Shared by every installation on this version." : "Not downloaded yet. Launch downloads them too."}>
            {job?.state === "running" ? <span className="spinner" /> : installed ? <span className="chip green">Ready</span> :
              <button className="btn green sm" disabled={!inApp} onClick={() => api.installGame(inst.version).catch((e) => app.notify(errText(e), "error"))}><Download size={14} />Download</button>}
          </Row>
        </Group>
        {inst.mode === "OptiFine" && <OptiFineGroup app={app} inst={inst} />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
        <Group title="Content">
          {([["Resource packs", "resourcepacks", Package, "pack", "packs"], ["Shaders", "shaderpacks", Sparkles, "shader", "shaders"], ["Mods", "mods", Puzzle, "mod", "mods"], ["Worlds", "saves", Globe, "world", "worlds"], ["Screenshots", "screenshots", ImageIcon, "screenshot", "screenshots"]] as const).map(([label, k, Icon, one, many]) => (
            <button key={k} className="row" style={{ width: "100%", textAlign: "left" }} onClick={() => app.navigate({ name: "installations", id: inst.id, tab: k === "screenshots" ? "Screenshots" : k === "saves" ? "Worlds" : "Content" })}>
              <Icon size={16} color="var(--text2)" /><span className="t-strong" style={{ flex: 1 }}>{label}</span><span className="t-cap">{fmt(counts[k], one, many)}</span>
            </button>
          ))}
        </Group>
        <Group title="Move and share">
          <Row title="Bring your setup over" detail="Settings, keybinds, servers and packs from .minecraft">
            <button className="btn sm" disabled={!inApp} onClick={() => importSetupDialog(app, inst)}><Download size={14} />Import</button>
          </Row>
          <Row title="Export" detail="One .kestrel file with settings and Modrinth content">
            <button className="btn sm" disabled={!inApp} onClick={() => exportInstallation(app, inst)}><FileDown size={14} />Export</button>
          </Row>
        </Group>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { resourcepacks: "Resource packs", shaderpacks: "Shaders", mods: "Mods" };
function Content({ inst }: { inst: Installation }) {
  const app = useApp();
  const [kind, setKind] = useState<ContentKind>("resourcepacks");
  const [files, setFiles] = useState<ContentFile[] | null>(null);
  const [q, setQ] = useState("");
  const [ids, setIds] = useState<Record<string, Identified>>({});
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const load = () => {
    if (!inApp) { setFiles([]); return; }
    api.listContent(inst.id, kind).then(setFiles).catch((e) => { app.notify(errText(e), "error"); setFiles([]); });
    // Names, icons and updates from Modrinth, matched by each file's hash.
    api.identifyContent(inst.id, kind, inst.version).then((l) => setIds(Object.fromEntries(l.map((x) => [x.file, x])))).catch(() => {});
  };
  useEffect(() => { setFiles(null); setIds({}); load(); }, [inst.id, kind]);
  useEffect(() => {
    const on = (e: Event) => { const k = (e as CustomEvent).detail as ContentKind; if (k === kind) load(); else setKind(k); };
    window.addEventListener("kestrel:content", on);
    return () => window.removeEventListener("kestrel:content", on);
  }, [inst.id, kind]);
  useEffect(() => { if (app.jobs.some((j) => j.state === "done" && j.id.startsWith(`content-${inst.id}`))) load(); }, [app.jobs.filter((j) => j.state === "done").length]);
  const label = (f: ContentFile) => ids[f.file]?.title ?? f.name;
  const shown = (files ?? []).filter((f) => label(f).toLowerCase().includes(q.trim().toLowerCase()));
  const target = kind === "resourcepacks" ? "resourcepack" : kind === "shaderpacks" ? "shader" : "mod";
  const updates = (files ?? []).filter((f) => ids[f.file]?.update);

  const update = async (f: ContentFile) => {
    const u = ids[f.file]?.update; if (!u) return;
    setUpdating((s) => new Set(s).add(f.file));
    try {
      await api.installContent({ instanceId: inst.id, kind, url: u.url, filename: u.filename, sha1: u.sha1, sha512: u.sha512, size: u.size, title: `${label(f)} ${u.versionNumber}` });
      if (u.filename !== f.file.replace(/\.disabled$/, "")) await api.deleteContent(inst.id, kind, f.file);
      app.notify(`${label(f)} updated to ${u.versionNumber}.`);
    } catch (e) { app.notify(errText(e), "error"); }
    setUpdating((s) => { const n = new Set(s); n.delete(f.file); return n; });
    load();
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Seg label="Content type" value={kind} onChange={(k) => setKind(k as ContentKind)} items={(["resourcepacks", "shaderpacks", "mods"] as ContentKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        <label className="search" style={{ flex: 1 }}><Search size={16} /><input placeholder={`Search ${KIND_LABEL[kind].toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search content" /></label>
        <button className="ibtn grey" style={{ width: 40, height: 40 }} aria-label="Open folder" onClick={() => api.openFolder("content", inst.id, kind).catch((e) => app.notify(errText(e), "error"))}><FolderOpen size={17} /></button>
        <button className="btn green" style={{ height: 40 }} onClick={() => app.navigate({ name: "explore", type: target, target: inst.id })}><Plus size={16} />Add content</button>
      </div>
      {updates.length > 0 && (
        <div className="notice">
          <ArrowUpCircle size={16} /><span style={{ flex: 1 }}>{updates.length} update{updates.length === 1 ? "" : "s"} available from Modrinth for {inst.version}.</span>
          <button className="btn sm" disabled={updating.size > 0} onClick={async () => { for (const f of updates) await update(f); }}>Update all</button>
        </div>
      )}
      {files === null ? <div className="skeleton" style={{ height: 136 }} /> : shown.length === 0 ? (
        <div className="empty"><Package size={22} /><b>{q ? "Nothing matches" : `No ${KIND_LABEL[kind].toLowerCase()} yet`}</b>
          <span>{!inApp ? DESKTOP_ONLY : kind === "mods" && inst.mode !== "Standard" ? "OptiFine installations don't load mods. Resource packs and shaders work." : "Find some in Explore, or drag files onto this window."}</span></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {shown.map((f) => {
            const id = ids[f.file];
            return (
              <div key={f.file} style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, borderRadius: 10 }} className="hov">
                <span className="c-icon">{id?.iconUrl ? <img src={id.iconUrl} alt="" loading="lazy" /> : <Package size={18} />}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b className="t-strong" style={{ display: "block", color: f.enabled ? "var(--text)" : "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label(f)}</b>
                  <span className="t-cap">{[id?.versionNumber, formatBytes(f.size), id?.projectId ? "Modrinth" : "Local file", f.enabled ? "" : "Disabled"].filter(Boolean).join(" · ")}</span>
                </span>
                {id?.update && (
                  <button className="btn sm" disabled={updating.has(f.file)} onClick={() => update(f)} title={`Update to ${id.update.versionNumber}`}>
                    {updating.has(f.file) ? <span className="spinner" /> : <ArrowUpCircle size={14} />}Update
                  </button>
                )}
                {id?.slug && <button className="ibtn sm" aria-label={`Open ${label(f)} page`} onClick={() => app.navigate({ name: "project", id: id.projectId!, target: inst.id })}><Info size={15} /></button>}
                <Toggle label={`${f.enabled ? "Disable" : "Enable"} ${label(f)}`} checked={f.enabled} onChange={(on) => api.setContentEnabled(inst.id, kind, f.file, on).then(load).catch((e) => app.notify(errText(e), "error"))} />
                <button className="ibtn sm" aria-label={`Delete ${label(f)}`} onClick={() => confirmDialog(app, { title: `Delete ${label(f)}?`, text: "This removes the file from this installation's folder.", confirm: "Delete", danger: true,
                  onConfirm: () => api.deleteContent(inst.id, kind, f.file).then(load).then(() => app.notify(`${label(f)} deleted.`)).catch((e) => app.notify(errText(e), "error")) })}><Trash2 size={15} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Files dragged onto the window go into the installation on screen. */
function useFileDrop(app: AppState, inst: Installation) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!inApp) return;
    const un = getCurrentWebview().onDragDropEvent(async (e) => {
      const p = e.payload;
      if (p.type === "enter" || p.type === "over") setOver(true);
      else if (p.type === "leave") setOver(false);
      else if (p.type === "drop") {
        setOver(false);
        if (!p.paths.length) return;
        try {
          const r = await api.importFiles(inst.id, p.paths);
          const ok = r.filter((x) => !x.error), bad = r.filter((x) => x.error);
          if (ok.length) app.notify(`Added ${ok.length} file${ok.length === 1 ? "" : "s"} to ${inst.name}${bad.length ? `. Skipped ${bad.map((b) => b.file).join(", ")}: ${bad[0].error}` : "."}`);
          else if (bad.length) app.notify(`${bad[0].file}: ${bad[0].error}`, "error");
          const kind = ok[0]?.kind;
          if (kind) { app.navigate({ name: "installations", id: inst.id, tab: "Content" }); window.dispatchEvent(new CustomEvent("kestrel:content", { detail: kind })); }
        } catch (err) { app.notify(errText(err), "error"); }
      }
    });
    return () => { un.then((f) => f()); };
  }, [inst.id, inst.name]);
  return over;
}

function Worlds({ inst }: { inst: Installation }) {
  const app = useApp();
  const [worlds, setWorlds] = useState<World[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => { if (!inApp) { setWorlds([]); return; } api.listWorlds(inst.id).then(setWorlds).catch((e) => { app.notify(errText(e), "error"); setWorlds([]); }); };
  useEffect(load, [inst.id]);
  const ago = (ms: number) => {
    if (!ms) return "Never played";
    const d = (Date.now() - ms) / 86400000;
    return d < 1 ? "Played today" : d < 2 ? "Played yesterday" : d < 30 ? `Played ${Math.floor(d)} days ago` : `Played ${new Date(ms).toLocaleDateString()}`;
  };
  const backup = async (w: World) => {
    setBusy(w.folder);
    try { await api.backupWorld(inst.id, w.folder); app.notify(`${w.name} backed up.`); } catch (e) { app.notify(errText(e), "error"); }
    setBusy(null);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="t-cap" style={{ flex: 1 }}>{worlds === null ? "Loading…" : `${worlds.length} world${worlds.length === 1 ? "" : "s"} · Backups are zipped into Kestrel's backups folder`}</span>
        <button className="btn" onClick={() => api.openFolder("backups", inst.id).catch((e) => app.notify(errText(e), "error"))}><ArchiveRestore size={16} />Backups</button>
        <button className="btn" onClick={() => api.openFolder("content", inst.id, "saves").catch((e) => app.notify(errText(e), "error"))}><FolderOpen size={16} />Open folder</button>
      </div>
      {worlds === null ? <div className="skeleton" style={{ height: 136 }} /> : worlds.length === 0 ? (
        <div className="empty"><Globe size={22} /><b>No singleplayer worlds yet</b><span>{inApp ? "Worlds you create in Minecraft show up here." : DESKTOP_ONLY}</span></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {worlds.map((w) => (
            <div key={w.folder} className="hov" style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, borderRadius: 10 }}>
              <span className="c-icon w">{w.icon ? <img src={w.icon} alt="" /> : <Globe size={18} />}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b className="t-strong" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</b>
                <span className="t-cap">{[ago(w.lastPlayed), w.mode, formatBytes(w.size), w.folder !== w.name ? w.folder : ""].filter(Boolean).join(" · ")}</span>
              </span>
              <button className="btn sm" disabled={busy === w.folder} onClick={() => backup(w)}>{busy === w.folder ? <span className="spinner" /> : <ArchiveRestore size={14} />}Back up</button>
              <button className="ibtn sm" aria-label={`Show ${w.name} in folder`} onClick={() => api.revealFile(inst.id, "saves", w.folder).catch((e) => app.notify(errText(e), "error"))}><Eye size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Screenshots({ inst }: { inst: Installation }) {
  const app = useApp();
  const [files, setFiles] = useState<ContentFile[] | null>(null);
  useEffect(() => { if (!inApp) { setFiles([]); return; } api.listContent(inst.id, "screenshots").then(setFiles).catch(() => setFiles([])); }, [inst.id]);
  const base = app.paths ? `${app.paths.instances}\\${inst.id}\\screenshots\\` : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="t-cap" style={{ flex: 1 }}>{files === null ? "Loading…" : `${files.length} screenshot${files.length === 1 ? "" : "s"}`}</span>
        <button className="btn" onClick={() => api.openFolder("content", inst.id, "screenshots").catch((e) => app.notify(errText(e), "error"))}><FolderOpen size={16} />Open folder</button>
      </div>
      {files && files.length === 0 ? (
        <div className="empty"><ImageIcon size={22} /><b>Your next great moment goes here</b><span>{inApp ? "Press F2 in Minecraft to take a screenshot. Nothing is uploaded." : DESKTOP_ONLY}</span></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16 }}>
          {(files ?? []).map((f) => (
            <figure key={f.file} style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="shot" style={{ aspectRatio: "16 / 9", borderRadius: 10, overflow: "hidden", background: "var(--surface)", position: "relative" }}>
                <img src={fileUrl(base + f.file)} alt={f.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div className="shot-actions" style={{ position: "absolute", right: 8, bottom: 8, display: "flex", gap: 6 }}>
                  <button className="ibtn solid sm" aria-label="Show in folder" onClick={() => api.revealFile(inst.id, "screenshots", f.file).catch((e) => app.notify(errText(e), "error"))}><Eye size={14} /></button>
                  <button className="ibtn solid sm" aria-label="Delete screenshot" onClick={() => confirmDialog(app, { title: "Delete screenshot?", text: f.name, confirm: "Delete", danger: true,
                    onConfirm: () => api.deleteContent(inst.id, "screenshots", f.file).then(() => setFiles((l) => (l ?? []).filter((x) => x.file !== f.file))).catch((e) => app.notify(errText(e), "error")) })}><Trash2 size={14} /></button>
                </div>
              </div>
              <figcaption className="t-cap">{f.name}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

function InstSettings({ inst }: { inst: Installation }) {
  const app = useApp();
  const maxGb = app.paths ? Math.max(2, Math.floor(app.paths.totalMemoryMb / 1024) - 2) : 16;
  const [mem, setMem] = useState(inst.memoryGb);
  const [w, setW] = useState(String(inst.width)), [h, setH] = useState(String(inst.height));
  const [jvm, setJvm] = useState(inst.jvmArgs);
  const [name, setName] = useState(inst.name);
  useEffect(() => { if (inApp && !app.javas) app.refreshJava().catch(() => {}); }, []);
  const javaOptions = useMemo(() => [{ value: "auto", label: "Automatic", hint: "Kestrel picks Java 8, downloading it if needed" },
    ...(app.javas ?? []).filter((j) => j.major === 8).map((j) => ({ value: j.path, label: `Java ${j.version}`, hint: `${j.source} · ${j.path}` }))], [app.javas]);
  const pct = ((mem - 1) / (maxGb - 1)) * 100;
  const commitSize = () => { const W = parseInt(w), H = parseInt(h); if (W >= 320 && H >= 240 && W <= 7680 && H <= 4320) app.updateInstallation(inst.id, { width: W, height: H }); else { setW(String(inst.width)); setH(String(inst.height)); } };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>
      <Group title="Performance">
        <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div className="tx"><b>Memory</b><span>1.8.9 runs best with 2–4 GB.{app.paths ? ` This PC has ${Math.round(app.paths.totalMemoryMb / 1024)} GB.` : ""}</span></div>
            <span className="t-strong" style={{ background: "var(--window)", padding: "6px 12px", borderRadius: 8 }}>{mem} GB</span>
          </div>
          <input className="slider" type="range" min={1} max={maxGb} value={mem} aria-label="Memory in GB" style={{ ["--fill" as string]: `${pct}%` }}
            onChange={(e) => setMem(+e.target.value)} onMouseUp={() => app.updateInstallation(inst.id, { memoryGb: mem })} onKeyUp={() => app.updateInstallation(inst.id, { memoryGb: mem })} />
        </div>
        <Row title="Java" detail={inst.javaPath ?? "Automatic"}>
          <Select label="Java runtime" width={220} value={inst.javaPath ?? "auto"} options={javaOptions} onChange={(v) => app.updateInstallation(inst.id, { javaPath: v === "auto" ? null : v })} />
        </Row>
      </Group>
      <Group title="Window">
        <Row title="Resolution" detail="Window size when Minecraft opens.">
          {(["W", "H"] as const).map((k) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--window)", borderRadius: 8, padding: "0 10px", height: 36 }}>
              <span className="t-small faint">{k}</span>
              <input value={k === "W" ? w : h} onChange={(e) => (k === "W" ? setW : setH)(e.target.value.replace(/\D/g, ""))} onBlur={commitSize} aria-label={k === "W" ? "Width" : "Height"} style={{ width: 48, background: "none", border: 0, outline: "none", fontWeight: 600 }} />
            </label>
          ))}
        </Row>
        <Row title="Start in fullscreen"><Toggle label="Start in fullscreen" checked={inst.fullscreen} onChange={(v) => app.updateInstallation(inst.id, { fullscreen: v })} /></Row>
      </Group>
      <Group title="Advanced">
        <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <div className="tx"><b>Java arguments</b><span>Only -X and -D options are passed through.</span></div>
          <textarea className="field on-surface mono" value={jvm} onChange={(e) => setJvm(e.target.value)} onBlur={() => app.updateInstallation(inst.id, { jvmArgs: jvm })} placeholder="-XX:+UseG1GC" aria-label="Java arguments" />
        </div>
        <Row title="Name"><input className="field on-surface" style={{ width: 220 }} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} onBlur={() => { const n = name.trim(); if (n) app.updateInstallation(inst.id, { name: n }); else setName(inst.name); }} aria-label="Installation name" /></Row>
        <Row title="Cover">
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(COVERS).map(([k, c]) => (
              <button key={k} aria-label={c.label} aria-pressed={inst.cover === k} onClick={() => app.updateInstallation(inst.id, { cover: k })} style={{ width: 52, height: 32, borderRadius: 6, background: `url(${c.src}) center/cover`, boxShadow: inst.cover === k ? "0 0 0 2px var(--text)" : "none" }} />
            ))}
          </div>
        </Row>
      </Group>
      <Group title="Remove">
        <Row title="Remove installation" detail="Removes it from Kestrel. Its folder and worlds stay on your PC.">
          <button className="btn danger" disabled={app.installations.length < 2} onClick={() => confirmDialog(app, { title: `Remove ${inst.name}?`, text: "The folder and everything in it stays on your PC. You can delete it yourself from File Explorer.", confirm: "Remove", danger: true,
            onConfirm: () => { app.removeInstallation(inst.id); app.navigate({ name: "installations" }); app.notify(`${inst.name} removed.`); } })}><Trash2 size={15} />Remove</button>
        </Row>
      </Group>
    </div>
  );
}

export function newInstallationDialog(app: AppState) {
  app.openDialog({ title: "New installation", wide: true, body: <NewInstallation app={app} /> });
}

function NewInstallation({ app }: { app: AppState }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("Standard");
  const [cover, setCover] = useState("nightwatch");
  const clean = name.trim();
  const taken = app.installations.some((i) => i.name.toLowerCase() === clean.toLowerCase());
  return (
    <form style={{ display: "flex", flexDirection: "column", gap: 16 }} onSubmit={(e) => {
      e.preventDefault(); if (!clean || taken) return;
      const inst = makeInstallation(clean, { mode, cover }, app.installations.map((i) => i.id), app.settings);
      app.addInstallation(inst); app.closeDialog();
      if (inApp) api.prepareInstance(inst.id).catch(() => {});
      app.notify(`${clean} created. Game files download on first launch.`);
      app.navigate({ name: "installations", id: inst.id });
    }}>
      <p className="t-cap" style={{ marginTop: -8 }}>A separate setup with its own files, packs and settings.</p>
      <label>Cover
        <div style={{ display: "flex", gap: 8 }}>
          {Object.entries(COVERS).map(([k, c]) => (
            <button type="button" key={k} aria-label={c.label} aria-pressed={cover === k} onClick={() => setCover(k)} style={{ width: 92, height: 56, borderRadius: 8, background: `url(${c.src}) center/cover`, boxShadow: cover === k ? "0 0 0 2px var(--text)" : "none", transition: "box-shadow var(--fast)" }} />
          ))}
        </div>
      </label>
      <label>Name<input className="field on-surface" autoFocus value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Bedwars practice" />{taken && <span style={{ color: "var(--danger)" }}>You already have an installation with this name.</span>}</label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label>Minecraft version<Select label="Minecraft version" width={264} value="1.8.9" options={[{ value: "1.8.9", label: "1.8.9", hint: "More versions come later" }]} onChange={() => {}} /></label>
        <label>Launch mode<Seg label="Launch mode" onSurface value={mode} onChange={(m) => setMode(m as Mode)} items={(["Standard", "OptiFine"] as Mode[]).map((m) => ({ value: m, label: m, icon: <img src={modeIcon(m)} alt="" /> }))} /></label>
      </div>
      <div className="actions">
        <button type="button" className="link" style={{ marginRight: "auto" }} onClick={() => { app.closeDialog(); importInstallationFile(app); }}>Import a .kestrel file instead</button>
        <button type="button" className="btn ghost" onClick={app.closeDialog}>Cancel</button>
        <button className="btn green" disabled={!clean || taken}><Plus size={16} />Create</button>
      </div>
    </form>
  );
}
