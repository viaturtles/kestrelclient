import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Download, ExternalLink, Heart, Layers, Monitor, Search, WifiOff } from "lucide-react";
import { api, formatCount, inApp, modrinth, type ContentKind, type ModrinthVersion, type Project, type ProjectType, type SearchHit } from "../lib/api";
import { COVERS, errText, useApp, type Installation } from "../lib/store";
import { Seg, Select } from "../components/ui";

const TYPES: { value: ProjectType; label: string }[] = [
  { value: "mod", label: "Mods" }, { value: "resourcepack", label: "Resource packs" }, { value: "shader", label: "Shaders" }, { value: "modpack", label: "Modpacks" },
];
const SORTS = [{ value: "relevance", label: "Relevance" }, { value: "downloads", label: "Most downloaded" }, { value: "follows", label: "Most followed" }, { value: "newest", label: "Newest" }, { value: "updated", label: "Recently updated" }];
const LOADER_NAMES: Record<string, string> = { fabric: "Fabric", forge: "Forge", neoforge: "NeoForge", quilt: "Quilt", optifine: "OptiFine", iris: "Iris", canvas: "Canvas", minecraft: "Vanilla", vanilla: "Vanilla", liteloader: "LiteLoader", modloader: "ModLoader", rift: "Rift" };
const LOADER_SET = new Set(Object.keys(LOADER_NAMES));

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

export function Explore({ type, target }: { type?: string; target?: string }) {
  const app = useApp();
  const [kind, setKind] = useState<ProjectType>((TYPES.find((t) => t.value === type)?.value) ?? "mod");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("relevance");
  const [targetId, setTargetId] = useState<string>(target ?? "any");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const inst = app.installations.find((i) => i.id === targetId) ?? null;
  const reqId = useRef(0);

  const args = (offset: number) => ({ query: query.trim(), projectType: kind, sort, offset, limit: 20,
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
  }, [kind, query, sort, targetId]);

  const loadMore = () => {
    if (!hits) return; setMore(true);
    modrinth.search(args(hits.length)).then((r) => setHits((h) => [...(h ?? []), ...r.hits])).catch((e) => app.notify(errText(e), "error")).finally(() => setMore(false));
  };

  const targetOptions = [{ value: "any", label: "Any installation", hint: "Show everything" }, ...app.installations.map((i) => ({ value: i.id, label: i.name, hint: `${i.version} · ${i.mode}` }))];

  return (
    <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="st" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 className="t-display">Explore</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="t-cap">Installing to</span>
          <Select label="Installing to" width={220} value={targetId} options={targetOptions} onChange={setTargetId} />
        </div>
      </div>
      <div className="st" style={{ display: "flex", gap: 8, alignItems: "center", ["--i" as string]: 1 }}>
        <Seg label="Project type" value={kind} onChange={(v) => setKind(v as ProjectType)} items={TYPES} />
        <label className="search" style={{ flex: 1 }}><Search size={16} /><input placeholder="Search Modrinth" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search Modrinth" /></label>
        <Select label="Sort" width={180} value={sort} options={SORTS} onChange={setSort} />
      </div>
      {inst && kind === "mod" && (
        <div className="st t-cap" style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(243,196,107,.08)", color: "#f1ddb0", ["--i" as string]: 2 }}>
          {inst.name} runs {inst.mode} without a mod loader, so mods can't be added to it yet. Resource packs{inst.mode === "OptiFine" ? " and shaders" : ""} work.
        </div>
      )}
      {error ? (
        <div className="empty"><WifiOff size={22} /><b>Couldn't reach Modrinth</b><span>{error}</span></div>
      ) : hits === null ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 136 }} />)}</div>
      ) : hits.length === 0 ? (
        <div className="empty"><Search size={22} /><b>No results</b><span>{inst ? `Nothing on Modrinth for ${inst.version} matches. Try another search, or choose Any installation.` : "Try another search."}</span></div>
      ) : (
        <>
          <span className="t-cap">{formatCount(total)} results on Modrinth</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
            {hits.map((h, i) => <Card key={h.project_id} hit={h} i={i} inst={inst} onOpen={() => app.navigate({ name: "project", id: h.slug || h.project_id, target: inst?.id })} />)}
          </div>
          {hits.length < total && <button className="btn" style={{ alignSelf: "center" }} disabled={more} onClick={loadMore}>{more ? <span className="spinner" /> : null}Load more</button>}
        </>
      )}
    </div>
  );
}

function Card({ hit, i, inst, onOpen }: { hit: SearchHit; i: number; inst: Installation | null; onOpen: () => void }) {
  const loaders = hit.categories.filter((c) => LOADER_SET.has(c)).map((c) => LOADER_NAMES[c]);
  const compat = inst ? compatibility(hit.project_type, inst, hit.versions, hit.categories) : null;
  return (
    <button onClick={onOpen} className="st mod-card" style={{ ["--i" as string]: Math.min(i, 8) + 2 }}>
      {hit.icon_url ? <img src={hit.icon_url} alt="" loading="lazy" /> : <span className="noicon">{hit.title[0]}</span>}
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}><b className="t-heading" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hit.title}</b><span className="t-cap" style={{ whiteSpace: "nowrap" }}>by {hit.author}</span></span>
        <span className="muted clamp2">{hit.description}</span>
        <span className="t-cap" style={{ display: "flex", alignItems: "center", gap: 14, marginTop: "auto", paddingTop: 6 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Download size={13} />{formatCount(hit.downloads)}</span>
          {loaders.length > 0 && <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Layers size={13} />{loaders.slice(0, 3).join(" · ")}</span>}
          {compat && <span style={{ marginLeft: "auto", color: compat.ok ? "var(--accent-text)" : "var(--warn)" }}>{compat.ok ? `Fits ${inst!.name}` : compat.reason}</span>}
        </span>
      </span>
    </button>
  );
}

const KIND_DIR: Record<string, ContentKind> = { mod: "mods", resourcepack: "resourcepacks", shader: "shaderpacks" };

export function ProjectPage({ id, target }: { id: string; target?: string }) {
  const app = useApp();
  const [p, setP] = useState<Project | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [img, setImg] = useState(0);
  const [tab, setTab] = useState("About");
  const [versions, setVersions] = useState<ModrinthVersion[] | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  useEffect(() => { modrinth.project(id).then(setP).catch((e) => setErr(errText(e))); modrinth.versions(id).then(setVersions).catch(() => setVersions([])); }, [id]);
  const gallery = useMemo(() => p ? [...p.gallery].sort((a, b) => Number(b.featured) - Number(a.featured)) : [], [p]);

  async function install(inst: Installation) {
    if (!p || !versions) return;
    const kind = p.project_type;
    const match = versions.filter((v) => v.game_versions.includes(inst.version) && (kind !== "shader" || v.loaders.includes("optifine")))
      .sort((a, b) => b.date_published.localeCompare(a.date_published))[0];
    const file = match?.files.find((f) => f.primary) ?? match?.files[0];
    if (!file) { app.notify(`No ${inst.version} file found.`, "error"); return; }
    setInstalling(inst.id);
    try {
      await api.installContent({ instanceId: inst.id, kind: KIND_DIR[kind], url: file.url, filename: file.filename, sha1: file.hashes.sha1, sha512: file.hashes.sha512, size: file.size, title: `${p.title} → ${inst.name}` });
      app.notify(`${p.title} installed into ${inst.name}.`);
    } catch (e) { app.notify(errText(e), "error"); } finally { setInstalling(null); }
  }

  if (err) return <div className="pad"><div className="empty"><WifiOff size={22} /><b>Couldn't load this project</b><span>{err}</span></div></div>;
  if (!p) return <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}><div className="skeleton" style={{ height: 80 }} /><div className="skeleton" style={{ height: 330 }} /></div>;
  const ordered = target ? [...app.installations].sort((a) => (a.id === target ? -1 : 0)) : app.installations;
  const loaders = p.loaders.filter((l) => LOADER_SET.has(l)).map((l) => LOADER_NAMES[l]);
  const range = p.game_versions.length ? (p.game_versions.length === 1 ? p.game_versions[0] : `${p.game_versions[0]} – ${p.game_versions[p.game_versions.length - 1]}`) : "—";

  return (
    <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <button className="link st" style={{ alignSelf: "flex-start" }} onClick={app.goBack}><ChevronLeft size={16} />Back</button>
      <div className="st" style={{ display: "flex", alignItems: "center", gap: 18, ["--i" as string]: 1 }}>
        {p.icon_url ? <img src={p.icon_url} alt="" style={{ width: 80, height: 80, borderRadius: 16 }} /> : <span className="noicon" style={{ width: 80, height: 80, fontSize: 30 }}>{p.title[0]}</span>}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>{p.title}</h1>
          <p className="muted">{p.description}</p>
          <div className="t-cap" style={{ display: "flex", gap: 16 }}>
            <span style={{ display: "flex", gap: 5, alignItems: "center" }}><Download size={13} />{formatCount(p.downloads)} downloads</span>
            <span style={{ display: "flex", gap: 5, alignItems: "center" }}><Heart size={13} />{formatCount(p.followers)}</span>
            {loaders.length > 0 && <span style={{ display: "flex", gap: 5, alignItems: "center" }}><Layers size={13} />{loaders.join(" · ")}</span>}
            <span style={{ display: "flex", gap: 5, alignItems: "center" }}><Monitor size={13} />{p.client_side === "required" ? "Client-side" : p.server_side === "required" ? "Server-side" : "Client & server"}</span>
          </div>
        </div>
        <button className="btn" onClick={() => api.openLink(`https://modrinth.com/${p.project_type}/${p.slug}`)}><ExternalLink size={15} />Modrinth</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 388px", gap: 20 }}>
        <div className="st" style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0, ["--i" as string]: 2 }}>
          <Seg label="Project sections" value={tab} onChange={setTab} items={[{ value: "About", label: "About" }, { value: "Versions", label: "Versions" }]} />
          {tab === "About" ? (
            <>
              {gallery.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ position: "relative", aspectRatio: "16 / 8", borderRadius: 12, overflow: "hidden", background: "var(--surface)" }}>
                    <img key={img} src={gallery[img].url} alt={gallery[img].title ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover", animation: "fade var(--base) both" }} />
                    {gallery[img].title && <span className="t-cap" style={{ position: "absolute", left: 12, bottom: 12, padding: "5px 10px", borderRadius: 7, background: "rgba(10,11,13,.75)", color: "#e3e7ec" }}>{gallery[img].title} · {img + 1} of {gallery.length}</span>}
                  </div>
                  {gallery.length > 1 && <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>{gallery.slice(0, 8).map((g, n) => (
                    <button key={g.url} aria-label={`Image ${n + 1}`} onClick={() => setImg(n)} style={{ width: 88, height: 50, flex: "none", borderRadius: 7, background: `url(${g.url}) center/cover`, opacity: n === img ? 1 : 0.55, boxShadow: n === img ? "0 0 0 2px var(--text)" : "none", transition: "opacity var(--fast)" }} />
                  ))}</div>}
                </div>
              )}
              <p className="muted" style={{ lineHeight: "21px", whiteSpace: "pre-line", maxWidth: "75ch" }}>{plainText(p.body).slice(0, 1400)}{p.body.length > 1400 ? "…" : ""}</p>
              <button className="link" style={{ alignSelf: "flex-start" }} onClick={() => api.openLink(`https://modrinth.com/${p.project_type}/${p.slug}`)}>Read the full page on Modrinth<ExternalLink size={13} /></button>
            </>
          ) : (
            <div className="rows">
              {versions === null ? <div className="row"><span className="spinner" /></div> : versions.slice(0, 25).map((v) => (
                <div key={v.id} className="row">
                  <div className="tx"><b>{v.name || v.version_number}</b><span>{v.loaders.map((l) => LOADER_NAMES[l] ?? l).join(", ")} · {v.game_versions.slice(-3).join(", ")}{v.game_versions.length > 3 ? " …" : ""}</span></div>
                  <span className="t-cap">{new Date(v.date_published).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <aside className="st" style={{ display: "flex", flexDirection: "column", gap: 16, ["--i" as string]: 3 }}>
          <h2 className="t-heading">Add to an installation</h2>
          <div className="rows">
            {ordered.map((inst) => {
              const c = compatibility(p.project_type, inst, versions ? versions.flatMap((v) => v.game_versions) : p.game_versions, versions ? versions.flatMap((v) => v.loaders) : p.loaders);
              return (
                <div key={inst.id} className="row">
                  <img src={(COVERS[inst.cover] ?? COVERS.hypixel).src} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />
                  <div className="tx"><b>{inst.name}</b><span>{inst.version} · {inst.mode}</span></div>
                  {c.ok ? <button className="btn green sm" disabled={!inApp || installing !== null} onClick={() => install(inst)}>{installing === inst.id ? <span className="spinner" /> : <Download size={14} />}Install</button>
                    : <span className="t-cap" style={{ color: "var(--warn)", textAlign: "right" }}>{c.reason}</span>}
                </div>
              );
            })}
          </div>
          {!inApp && <span className="t-cap">Installing runs in the Kestrel desktop app.</span>}
          <span className="t-cap">Kestrel only installs files that fit, and checks every download against Modrinth's hashes.</span>
          <div className="rows">
            {[["Game versions", range], ["Loaders", loaders.join(", ") || "—"], ["License", p.license?.name || p.license?.id || "—"], ["Source", "Modrinth"]].map(([k, v]) => (
              <div key={k} className="row" style={{ minHeight: 44, padding: "11px 0" }}><span className="t-cap" style={{ flex: 1 }}>{k}</span><span className="t-small" style={{ textAlign: "right" }}>{v}</span></div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Rough Markdown/HTML to plain text for the summary. */
function plainText(md: string) {
  return md.replace(/<[^>]+>/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[#*_`>|]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
