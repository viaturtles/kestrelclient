import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, Download, ExternalLink, Heart, Monitor, Search, WifiOff } from "lucide-react";
import { api, formatCount, inApp, modrinth, type ContentKind, type ModrinthVersion, type Project, type ProjectType, type SearchHit } from "../lib/api";
import { COVERS, errText, useApp, type AppState, type Installation } from "../lib/store";
import { Seg, Select } from "../components/ui";

const TYPES: { value: ProjectType; label: string }[] = [
  { value: "resourcepack", label: "Resource packs" }, { value: "shader", label: "Shaders" }, { value: "mod", label: "Mods" }, { value: "modpack", label: "Modpacks" },
];
const TYPE_ONE: Record<string, string> = { resourcepack: "Resource pack", shader: "Shader", mod: "Mod", modpack: "Modpack" };
const SORTS = [{ value: "relevance", label: "Relevance" }, { value: "downloads", label: "Most downloaded" }, { value: "follows", label: "Most followed" }, { value: "newest", label: "Newest" }, { value: "updated", label: "Recently updated" }];
/** Quick filters: each adds a search word (Modrinth has no PvP or "low fire" category). */
const CHIPS: Record<string, string[]> = {
  resourcepack: ["PvP", "16x", "32x", "Faithful", "Dark UI", "Low fire", "Clear glass", "Sky"],
  shader: ["Lite", "Realistic", "Vanilla-like", "Fantasy"],
  mod: ["Performance", "Utility"], modpack: [],
};
const LOADER_NAMES: Record<string, string> = { fabric: "Fabric", forge: "Forge", neoforge: "NeoForge", quilt: "Quilt", optifine: "OptiFine", iris: "Iris", canvas: "Canvas", minecraft: "Vanilla", vanilla: "Vanilla", liteloader: "LiteLoader", modloader: "ModLoader", rift: "Rift" };
const LOADER_SET = new Set(Object.keys(LOADER_NAMES));
const KIND_DIR: Record<string, ContentKind> = { mod: "mods", resourcepack: "resourcepacks", shader: "shaderpacks" };
const WIDE = "/assets/brand/wide-banner.png";

/** Can this project go into this installation? Kestrel's installations are Vanilla or OptiFine. */
export function compatibility(kind: string, inst: Installation, gameVersions: string[], loaders: string[]): { ok: boolean; reason: string } {
  const hasVersion = gameVersions.includes(inst.version);
  if (kind === "mod") return { ok: false, reason: `Needs ${loaders.filter((l) => LOADER_SET.has(l)).map((l) => LOADER_NAMES[l]).slice(0, 2).join(" or ") || "a mod loader"}` };
  if (kind === "modpack") return { ok: false, reason: "Modpacks aren't supported yet" };
  if (kind === "shader") {
    if (inst.mode !== "OptiFine") return { ok: false, reason: "Needs OptiFine" };
    if (!loaders.includes("optifine")) return { ok: false, reason: "Not an OptiFine shader" };
    return hasVersion ? { ok: true, reason: "Fits" } : { ok: false, reason: `No ${inst.version} version` };
  }
  return hasVersion ? { ok: true, reason: "Fits" } : { ok: false, reason: `No ${inst.version} version` };
}

/** Downloads the newest file of a project that fits the installation (checked against Modrinth's hashes). */
async function installProject(app: AppState, p: { id: string; title: string; type: string }, inst: Installation, versions?: ModrinthVersion[]) {
  const all = versions ?? await modrinth.versions(p.id);
  const match = all.filter((v) => v.game_versions.includes(inst.version) && (p.type !== "shader" || v.loaders.includes("optifine")))
    .sort((a, b) => b.date_published.localeCompare(a.date_published))[0];
  const file = match?.files.find((f) => f.primary) ?? match?.files[0];
  if (!file) throw new Error(`No ${inst.version} file found.`);
  await api.installContent({ instanceId: inst.id, kind: KIND_DIR[p.type], url: file.url, filename: file.filename, sha1: file.hashes.sha1, sha512: file.hashes.sha512, size: file.size, title: `${p.title} → ${inst.name}` });
  app.notify(`${p.title} installed into ${inst.name}.`);
}

const artOf = (h: SearchHit) => h.featured_gallery || h.gallery?.[0] || null;

export function Explore({ type, target }: { type?: string; target?: string }) {
  const app = useApp();
  // Opens on what Kestrel can install today, for the selected installation.
  const [kind, setKind] = useState<ProjectType>((TYPES.find((t) => t.value === type)?.value) ?? "resourcepack");
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<string | null>(null);
  const [sort, setSort] = useState("downloads");
  const [targetId, setTargetId] = useState<string>(target ?? app.selected.id);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const inst = app.installations.find((i) => i.id === targetId) ?? null;
  const installed = useInstalled(inst, kind, tick);
  const reqId = useRef(0);
  useEffect(() => setChip(null), [kind]);

  const args = (offset: number) => ({ query: [query.trim(), chip ?? ""].filter(Boolean).join(" "), projectType: kind, sort, offset, limit: 21,
    gameVersion: inst && kind !== "mod" && kind !== "modpack" ? inst.version : null, loader: inst && kind === "shader" ? "optifine" : null });

  useEffect(() => {
    const id = ++reqId.current;
    setError(null);
    const t = setTimeout(() => {
      setHits(null);
      modrinth.search(args(0)).then((r) => { if (id === reqId.current) { setHits(r.hits); setTotal(r.total_hits); } })
        .catch((e) => { if (id === reqId.current) { setError(errText(e)); setHits([]); } });
    }, query ? 320 : 0);
    return () => clearTimeout(t);
  }, [kind, query, chip, sort, targetId]);

  const loadMore = () => {
    if (!hits) return; setMore(true);
    modrinth.search(args(hits.length)).then((r) => setHits((h) => [...(h ?? []), ...r.hits])).catch((e) => app.notify(errText(e), "error")).finally(() => setMore(false));
  };
  const install = async (h: SearchHit) => {
    if (!inst) return;
    setBusy(h.project_id);
    try { await installProject(app, { id: h.project_id, title: h.title, type: h.project_type }, inst); setTick((n) => n + 1); }
    catch (e) { app.notify(errText(e), "error"); } finally { setBusy(null); }
  };

  // Pack of the week: rotates weekly through the most downloaded results that have pictures.
  const featured = useMemo(() => {
    if (!hits || query || chip || (kind !== "resourcepack" && kind !== "shader")) return null;
    const pool = hits.filter(artOf).slice(0, 8);
    return pool.length ? pool[Math.floor(Date.now() / 604_800_000) % pool.length] : null;
  }, [hits, query, chip, kind]);
  const grid = (hits ?? []).filter((h) => h !== featured);

  const targetOptions = [{ value: "any", label: "Any installation", hint: "Show everything" }, ...app.installations.map((i) => ({ value: i.id, label: i.name, hint: `${i.version} · ${i.mode}` }))];
  const action = (h: SearchHit, big?: boolean) => {
    if (!inst) return null;
    if (installed?.has(h.project_id)) return <button className={big ? "btn" : "btn sm"} disabled><Check size={14} />Installed</button>;
    const c = compatibility(h.project_type, inst, h.versions, h.categories);
    if (!c.ok) return <span className="t-cap" style={{ color: "var(--warn)" }}>{c.reason}</span>;
    const label = busy === h.project_id ? <span className="spinner" /> : big ? `INSTALL TO ${inst.name.toUpperCase().slice(0, 14)}` : "Install";
    return <button className={big ? "cta" : "btn green sm"} disabled={!inApp || busy !== null} title={inApp ? undefined : "Installing runs in the Kestrel desktop app."} onClick={(e) => { e.stopPropagation(); install(h); }}>{label}</button>;
  };

  return (
    <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="st" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 className="t-display">Explore</h1>
        <Seg label="Project type" value={kind} onChange={(v) => setKind(v as ProjectType)} items={TYPES} />
        <label className="search" style={{ flex: 1, minWidth: 160 }}><Search size={16} /><input placeholder={`Search ${TYPES.find((t) => t.value === kind)!.label.toLowerCase()}${inst && kind !== "mod" && kind !== "modpack" ? ` for ${inst.version}` : ""}`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search Modrinth" /></label>
        <Select label="Installing to" width={210} value={targetId} options={targetOptions} onChange={setTargetId}
          render={() => inst ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}><img src={(COVERS[inst.cover] ?? COVERS.hypixel).src} alt="" style={{ width: 22, height: 22, borderRadius: 5, objectFit: "cover" }} /><span style={{ display: "flex", flexDirection: "column", lineHeight: "13px", textAlign: "left" }}><span className="t-micro">Installing to</span><span>{inst.name} · {inst.version}</span></span></span> : "Any installation"} />
      </div>
      {(kind === "mod" || kind === "modpack") && (
        <div className="st t-cap" style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(243,196,107,.08)", color: "#f1ddb0", ["--i" as string]: 1 }}>
          {kind === "mod" ? "Mods" : "Modpacks"} need Fabric or Forge, which Kestrel doesn't support yet, so you can browse them but not install them. Resource packs and shaders work today.
        </div>
      )}
      {featured && (
        <section className="cover st xp-feat" style={{ ["--i" as string]: 1 }} onClick={() => app.navigate({ name: "project", id: featured.slug || featured.project_id, target: inst?.id })}>
          <div className="art" style={{ backgroundImage: `url(${artOf(featured)})` }} />
          <div className="scrim" />
          <div className="xp-feat-tx shadowtext">
            <span className="xp-kick">{kind === "shader" ? "Shader" : "Pack"} of the week</span>
            <h2>{featured.title}</h2>
            <p>{featured.description}</p>
            <span className="t-small" style={{ color: "#c9ced6" }}>{formatCount(featured.downloads)} downloads · by {featured.author}</span>
            <div style={{ marginTop: 10 }}>{action(featured, true)}</div>
          </div>
        </section>
      )}
      <div className="st" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", ["--i" as string]: 2 }}>
        {CHIPS[kind].length > 0 && <button className={"fchip" + (chip === null ? " on" : "")} onClick={() => setChip(null)}>All</button>}
        {CHIPS[kind].map((c) => <button key={c} className={"fchip" + (chip === c ? " on" : "")} onClick={() => setChip(chip === c ? null : c)}>{c}</button>)}
        <span style={{ marginLeft: "auto" }}><Select label="Sort" width={170} value={sort} options={SORTS} onChange={setSort} /></span>
      </div>
      {error ? (
        <div className="empty"><WifiOff size={22} /><b>Couldn't reach Modrinth</b><span>{error}</span></div>
      ) : hits === null ? (
        <div className="xp-grid">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 196 }} />)}</div>
      ) : hits.length === 0 ? (
        <div className="empty"><Search size={22} /><b>No results</b><span>{inst ? `Nothing on Modrinth for ${inst.version} matches. Try another search, or choose Any installation.` : "Try another search."}</span></div>
      ) : (
        <>
          <div className="xp-grid">
            {grid.map((h, i) => (
              <div key={h.project_id} role="button" tabIndex={0} className="st xp-card" style={{ ["--i" as string]: Math.min(i, 8) + 3 }}
                onClick={() => app.navigate({ name: "project", id: h.slug || h.project_id, target: inst?.id })}
                onKeyDown={(e) => { if (e.key === "Enter") app.navigate({ name: "project", id: h.slug || h.project_id, target: inst?.id }); }}>
                <span className="xp-strip" style={{ backgroundImage: `url(${artOf(h) ?? WIDE})` }} />
                <span className="xp-head">
                  <img className="xp-icon" src={h.icon_url ?? `/assets/brand/ph-${KIND_DIR[h.project_type] ?? "resourcepacks"}.png`} alt="" loading="lazy" />
                  <span style={{ minWidth: 0 }}><b className="ell">{h.title}</b><span className="t-cap ell">by {h.author}</span></span>
                </span>
                <span className="xp-foot"><span className="t-cap" style={{ display: "flex", alignItems: "center", gap: 5 }}><Download size={13} />{formatCount(h.downloads)}</span><span style={{ marginLeft: "auto" }}>{action(h)}</span></span>
              </div>
            ))}
          </div>
          <span className="t-cap" style={{ textAlign: "center" }}>{formatCount(total)} results on Modrinth</span>
          {hits.length < total && <button className="btn" style={{ alignSelf: "center" }} disabled={more} onClick={loadMore}>{more ? <span className="spinner" /> : null}Load more</button>}
        </>
      )}
    </div>
  );
}

/** Modrinth project IDs already in an installation's folder for this kind (files matched by hash). */
function useInstalled(inst: Installation | null, kind: string, refresh = 0): Set<string> | null {
  const [ids, setIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    const dir = KIND_DIR[kind];
    if (!inApp || !inst || !dir) { setIds(new Set()); return; }
    let live = true;
    api.identifyContent(inst.id, dir, inst.version).then((l) => { if (live) setIds(new Set(l.map((x) => x.projectId).filter(Boolean) as string[])); }).catch(() => { if (live) setIds(new Set()); });
    return () => { live = false; };
  }, [inst?.id, kind, refresh]);
  return ids;
}

export function ProjectPage({ id, target }: { id: string; target?: string }) {
  const app = useApp();
  const [p, setP] = useState<Project | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [img, setImg] = useState(0);
  const [tab, setTab] = useState("About");
  const [versions, setVersions] = useState<ModrinthVersion[] | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  // Which installations already have this project (re-checked after each install).
  const [have, setHave] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState(0);
  useEffect(() => {
    const dir = p ? KIND_DIR[p.project_type] : undefined;
    if (!inApp || !p || !dir) return;
    Promise.all(app.installations.map((i) => api.identifyContent(i.id, dir, i.version).then((l) => (l.some((x) => x.projectId === p.id) ? i.id : null)).catch(() => null)))
      .then((ids) => setHave(new Set(ids.filter(Boolean) as string[])));
  }, [p?.id, checked, app.installations.length]);
  useEffect(() => { modrinth.project(id).then(setP).catch((e) => setErr(errText(e))); modrinth.versions(id).then(setVersions).catch(() => setVersions([])); }, [id]);
  const gallery = useMemo(() => p ? [...p.gallery].sort((a, b) => Number(b.featured) - Number(a.featured)) : [], [p]);

  async function install(inst: Installation) {
    if (!p || !versions) return;
    setInstalling(inst.id);
    try { await installProject(app, { id: p.id, title: p.title, type: p.project_type }, inst, versions); setHave((h) => new Set(h).add(inst.id)); setChecked((n) => n + 1); }
    catch (e) { app.notify(errText(e), "error"); } finally { setInstalling(null); }
  }

  const back = <button className="btn sm st" style={{ alignSelf: "flex-start" }} onClick={() => (app.canBack ? app.goBack() : app.navigate({ name: "explore", target }))}><ChevronLeft size={15} />Explore</button>;
  if (err) return <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>{back}<div className="empty"><WifiOff size={22} /><b>Couldn't load this project</b><span>{err}</span></div></div>;
  if (!p) return <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>{back}<div className="skeleton" style={{ height: 176 }} /><div className="skeleton" style={{ height: 300 }} /></div>;
  const ordered = target ? [...app.installations].sort((a) => (a.id === target ? -1 : 0)) : app.installations;
  const range = p.game_versions.length ? (p.game_versions.length === 1 ? p.game_versions[0] : `${p.game_versions[0]} – ${p.game_versions[p.game_versions.length - 1]}`) : "—";
  const page = `https://modrinth.com/${p.project_type}/${p.slug}`;
  const text = plainText(p.body);

  return (
    <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {back}
      <section className="cover st pj-banner" style={{ ["--i" as string]: 1 }}>
        <div className="art" style={{ backgroundImage: `url(${gallery[0]?.url ?? WIDE})` }} />
        <div className="scrim" />
        <div style={{ position: "absolute", left: 24, right: 220, bottom: 22, display: "flex", alignItems: "flex-end", gap: 18 }}>
          <img className="pj-icon" src={p.icon_url ?? `/assets/brand/ph-${KIND_DIR[p.project_type] ?? "resourcepacks"}.png`} alt="" />
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }} className="shadowtext">
            <h1 style={{ fontSize: 28, lineHeight: "32px", fontWeight: 700, letterSpacing: -0.5 }}>{p.title}</h1>
            <p className="t-small ell" style={{ color: "#d7dce3" }}>{p.description}</p>
            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
              <span className="hchip"><Download size={13} />{formatCount(p.downloads)}</span>
              <span className="hchip"><Heart size={13} />{formatCount(p.followers)}</span>
              <span className="hchip">{TYPE_ONE[p.project_type] ?? p.project_type}</span>
              <span className="hchip"><Monitor size={13} />{p.client_side === "required" ? "Client-side" : p.server_side === "required" ? "Server-side" : "Client & server"}</span>
            </div>
          </div>
        </div>
        <button className="btn" style={{ position: "absolute", right: 24, bottom: 22, background: "rgba(20,21,25,.72)" }} onClick={() => api.openLink(page)}>Open on Modrinth<ExternalLink size={14} /></button>
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 16, alignItems: "start" }}>
        <div className="st" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, ["--i" as string]: 2 }}>
          <div><Seg label="Project sections" value={tab} onChange={setTab} items={[{ value: "About", label: "About" }, ...(gallery.length ? [{ value: "Gallery", label: "Gallery" }] : []), { value: "Versions", label: "Versions" }]} /></div>
          <div className="ocard" style={{ gap: 14 }}>
            {tab === "About" && <>
              <p style={{ color: "var(--text2)", lineHeight: "21px", whiteSpace: "pre-line" }}>{text.slice(0, 900)}{text.length > 900 ? "…" : ""}</p>
              {gallery.length > 0 && <>
                <b className="t-strong">Gallery</b>
                <div className="pj-thumbs">{gallery.slice(0, 4).map((g, n) => <button key={g.url} aria-label={`Image ${n + 1}`} style={{ backgroundImage: `url(${g.url})` }} onClick={() => { setImg(n); setTab("Gallery"); }} />)}</div>
              </>}
              <button className="link" style={{ alignSelf: "flex-start" }} onClick={() => api.openLink(page)}>Read the full page on Modrinth<ExternalLink size={13} /></button>
            </>}
            {tab === "Gallery" && gallery.length > 0 && <>
              <div style={{ position: "relative", aspectRatio: "16 / 9", borderRadius: 10, overflow: "hidden", background: "var(--window)" }}>
                <img key={img} src={gallery[img].url} alt={gallery[img].title ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover", animation: "fade var(--base) both" }} />
                {gallery[img].title && <span className="t-cap" style={{ position: "absolute", left: 12, bottom: 12, padding: "5px 10px", borderRadius: 7, background: "rgba(10,11,13,.75)", color: "#e3e7ec" }}>{gallery[img].title} · {img + 1} of {gallery.length}</span>}
              </div>
              <div className="pj-thumbs" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>{gallery.slice(0, 12).map((g, n) => <button key={g.url} aria-label={`Image ${n + 1}`} className={n === img ? "on" : ""} style={{ backgroundImage: `url(${g.url})` }} onClick={() => setImg(n)} />)}</div>
            </>}
            {tab === "Versions" && (versions === null ? <span className="spinner" /> : versions.slice(0, 25).map((v) => (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ flex: 1, minWidth: 0 }}><b className="t-strong ell" style={{ display: "block" }}>{v.name || v.version_number}</b><span className="t-cap">{v.loaders.map((l) => LOADER_NAMES[l] ?? l).join(", ")} · {v.game_versions.slice(-3).join(", ")}{v.game_versions.length > 3 ? " …" : ""}</span></span>
                <span className="t-cap">{new Date(v.date_published).toLocaleDateString()}</span>
              </div>
            )))}
          </div>
        </div>
        <aside className="st ocard" style={{ ["--i" as string]: 3 }}>
          <span className="sec-label">Add to an installation</span>
          {ordered.map((inst) => {
            const c = compatibility(p.project_type, inst, versions ? versions.flatMap((v) => v.game_versions) : p.game_versions, versions ? versions.flatMap((v) => v.loaders) : p.loaders);
            return (
              <div key={inst.id} className="on-row" style={{ cursor: "default" }}>
                <img src={(COVERS[inst.cover] ?? COVERS.hypixel).src} alt="" style={{ width: 34, height: 34, borderRadius: 7, objectFit: "cover" }} />
                <span style={{ flex: 1, minWidth: 0 }}><b className="ell">{inst.name}</b><span>{inst.version} · {inst.mode}</span></span>
                {have.has(inst.id) ? <button className="btn sm" disabled title={`Already in ${inst.name}`}><Check size={14} />Installed</button>
                  : c.ok ? <button className="btn green sm" disabled={!inApp || installing !== null} onClick={() => install(inst)}>{installing === inst.id ? <span className="spinner" /> : null}Install</button>
                  : <span className="t-cap" style={{ color: "var(--warn)", textAlign: "right" }}>{c.reason}</span>}
              </div>
            );
          })}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            {[["Game versions", range], ["License", p.license?.name || p.license?.id || "—"], ["Source", "Modrinth"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span className="t-cap">{k}</span><span className="t-small" style={{ textAlign: "right" }}>{v}</span></div>
            ))}
          </div>
          <span className="t-cap">{inApp ? "Every download is checked against Modrinth's hashes." : "Installing runs in the Kestrel desktop app."}</span>
        </aside>
      </div>
    </div>
  );
}

/** Rough Markdown/HTML to plain text for the summary. */
function plainText(md: string) {
  return md.replace(/<[^>]+>/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[\s*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/[#*_`>|]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
