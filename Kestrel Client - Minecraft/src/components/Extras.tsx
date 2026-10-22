// "Bring your setup over", OptiFine setup and installation files (.kestrel).
import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Check, Download, FileUp, FolderOpen, RefreshCw } from "lucide-react";
import { api, formatBytes, inApp, DESKTOP_ONLY, type ContentKind, type ImportScan } from "../lib/api";
import { COVERS, errText, makeInstallation, type AppState, type Installation } from "../lib/store";
import { Group, Row, Toggle } from "./ui";

// ---------------- Bring your setup over ----------------

export function importSetupDialog(app: AppState, inst: Installation) {
  app.openDialog({ title: "Bring your setup over", wide: true, body: <ImportSetup app={app} inst={inst} /> });
}

function ImportSetup({ app, inst }: { app: AppState; inst: Installation }) {
  const [scan, setScan] = useState<ImportScan | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [options, setOptions] = useState(true);
  const [servers, setServers] = useState(true);
  const [packs, setPacks] = useState<Set<string>>(new Set());
  const [shaders, setShaders] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!inApp) { setFailed(DESKTOP_ONLY); return; }
    api.importScan().then((s) => {
      setScan(s); setOptions(s.options); setServers(s.servers.length > 0);
      setPacks(new Set(s.resourcepacks.map((p) => p.file))); setShaders(new Set(s.shaderpacks.map((p) => p.file)));
    }).catch((e) => setFailed(errText(e)));
  }, []);

  const flip = (set: Set<string>, put: (s: Set<string>) => void, f: string) => { const n = new Set(set); n.has(f) ? n.delete(f) : n.add(f); put(n); };
  const total = (options ? 1 : 0) + (servers ? 1 : 0) + packs.size + shaders.size;

  const run = async () => {
    if (!scan) return;
    setBusy(true);
    try {
      const n = await api.importInto({ instanceId: inst.id, options, servers, resourcepacks: [...packs], shaderpacks: [...shaders] });
      if (servers) {
        // Also show them on Kestrel's Servers page, skipping ones already there.
        const have = new Set(app.servers.map((s) => s.address.toLowerCase()));
        scan.servers.filter((s) => s.address && !have.has(s.address.toLowerCase())).forEach((s, i) =>
          app.addServer({ id: `imp-${Date.now()}-${i}`, name: s.name || s.address, address: s.address }));
      }
      app.closeDialog();
      app.notify(`Copied ${n} item${n === 1 ? "" : "s"} into ${inst.name}.`);
    } catch (e) { app.notify(errText(e), "error"); setBusy(false); }
  };

  if (failed) return <p className="muted">{failed}</p>;
  if (!scan) return <div className="skeleton" style={{ height: 220 }} />;
  if (!scan.found) return (
    <>
      <p className="muted" style={{ lineHeight: "20px" }}>Kestrel couldn't find a .minecraft folder on this PC. If you've never opened the Minecraft Launcher or Lunar, there's nothing to bring over.</p>
      <div className="actions"><button className="btn ghost" onClick={app.closeDialog}>Close</button></div>
    </>
  );

  const PackList = ({ items, chosen, put }: { items: ImportScan["resourcepacks"]; chosen: Set<string>; put: (s: Set<string>) => void }) => (
    <div className="pick-list">
      {items.map((p) => (
        <button key={p.file} className={"pick" + (chosen.has(p.file) ? " on" : "")} aria-pressed={chosen.has(p.file)} onClick={() => flip(chosen, put, p.file)}>
          <span className="box">{chosen.has(p.file) && <Check size={12} strokeWidth={3} />}</span>
          <span className="nm">{p.name}</span><span className="t-cap">{p.size ? formatBytes(p.size) : "Folder"}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p className="t-cap" style={{ marginTop: -8 }}>Copies from <span className="mono">{scan.path}</span> into {inst.name}. Nothing in .minecraft is changed.</p>
      <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, paddingRight: 4 }}>
        <Group>
          <Row title="Settings and keybinds" detail={scan.options ? "options.txt, plus OptiFine settings if you have them" : "No options.txt found"}>
            <Toggle label="Copy settings and keybinds" checked={options} disabled={!scan.options} onChange={setOptions} />
          </Row>
          <Row title="Server list" detail={scan.servers.length ? scan.servers.slice(0, 3).map((s) => s.address).join(", ") + (scan.servers.length > 3 ? ` and ${scan.servers.length - 3} more` : "") : "No saved servers found"}>
            <Toggle label="Copy server list" checked={servers} disabled={!scan.servers.length} onChange={setServers} />
          </Row>
        </Group>
        {scan.resourcepacks.length > 0 && (
          <div className="group"><span className="gt">Resource packs · {packs.size} of {scan.resourcepacks.length}</span><PackList items={scan.resourcepacks} chosen={packs} put={setPacks} /></div>
        )}
        {scan.shaderpacks.length > 0 && (
          <div className="group"><span className="gt">Shaders · {shaders.size} of {scan.shaderpacks.length}</span><PackList items={scan.shaderpacks} chosen={shaders} put={setShaders} /></div>
        )}
      </div>
      <div className="actions">
        <span className="t-cap" style={{ flex: 1 }}>Files with the same name in {inst.name} are replaced.</span>
        <button className="btn ghost" onClick={app.closeDialog}>Cancel</button>
        <button className="btn green" disabled={busy || total === 0} onClick={run}>{busy ? <span className="spinner" /> : <Download size={15} />}Copy {total} item{total === 1 ? "" : "s"}</button>
      </div>
    </div>
  );
}

// ---------------- OptiFine ----------------

export function OptiFineGroup({ app, inst }: { app: AppState; inst: Installation }) {
  const [mine, setMine] = useState<string[] | null>(null);   // imported into Kestrel
  const [found, setFound] = useState<string[]>([]);          // installed in .minecraft by OptiFine's installer
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => {
    if (!inApp) { setMine([]); return; }
    api.optifineList().then(setMine).catch(() => setMine([]));
    api.importScan().then((s) => setFound(s.optifine)).catch(() => {});
  };
  useEffect(refresh, []);

  const use = async (id: string) => {
    setBusy(id);
    try {
      await api.optifineImport(id);
      app.updateInstallation(inst.id, { optifine: id, mode: "OptiFine" });
      app.notify(`${pretty(id)} is set up for ${inst.name}.`);
      refresh();
    } catch (e) { app.notify(errText(e), "error"); }
    setBusy(null);
  };
  const runInstaller = async () => {
    const path = await open({ title: "Choose the OptiFine installer", multiple: false, directory: false, filters: [{ name: "OptiFine installer", extensions: ["jar"] }] });
    if (typeof path !== "string") return;
    setBusy("installer");
    try {
      await api.optifineRunInstaller(path);
      app.notify("OptiFine's installer is open. Click Install there, then come back and press Check again.");
    } catch (e) { app.notify(errText(e), "error"); }
    setBusy(null);
  };

  const notYet = found.filter((f) => !(mine ?? []).includes(f));
  const current = inst.optifine && (mine ?? []).includes(inst.optifine) ? inst.optifine : null;
  return (
    <Group title="OptiFine">
      <Row title={current ? pretty(current) : "Not set up"} detail={!inApp ? DESKTOP_ONLY : current ? "Loads when this installation launches in OptiFine mode." :
        "OptiFine can't be bundled with Kestrel. Download the 1.8.9 installer from optifine.net, then choose it here."}>
        {current ? <span className="chip green">Ready</span> :
          <button className="btn sm" disabled={!inApp || !!busy} onClick={runInstaller}>{busy === "installer" ? <span className="spinner" /> : <FileUp size={14} />}Choose installer…</button>}
      </Row>
      {[...(mine ?? []).filter((m) => m !== current), ...notYet].map((id) => (
        <Row key={id} title={pretty(id)} detail={(mine ?? []).includes(id) ? "Set up in Kestrel" : "Found in .minecraft"}>
          <button className="btn sm" disabled={!!busy} onClick={() => use(id)}>{busy === id ? <span className="spinner" /> : null}Use this</button>
        </Row>
      ))}
      {inApp && (
        <Row title="Installed it already?" detail="Kestrel looks for OptiFine versions in .minecraft\versions.">
          <button className="ibtn sm" aria-label="Check again" onClick={refresh}><RefreshCw size={15} /></button>
        </Row>
      )}
    </Group>
  );
}
const pretty = (id: string) => id.replace(/^1\.8\.9-OptiFine_/, "OptiFine ").replace(/_/g, " ");

// ---------------- Installation files (.kestrel) ----------------

const SHAREABLE: (keyof Installation)[] = ["name", "version", "mode", "memoryGb", "cover", "jvmArgs", "width", "height", "fullscreen", "optifine"];

export async function exportInstallation(app: AppState, inst: Installation) {
  if (!inApp) { app.notify(DESKTOP_ONLY, "error"); return; }
  const path = await save({ title: "Export installation", defaultPath: `${inst.name}.kestrel`, filters: [{ name: "Kestrel installation", extensions: ["kestrel"] }] });
  if (!path) return;
  const data = Object.fromEntries(SHAREABLE.map((k) => [k, inst[k]]));
  try {
    const n = await api.exportInstallation(path, inst.id, data);
    app.notify(`Exported ${inst.name} with ${n} Modrinth file${n === 1 ? "" : "s"}.`);
  } catch (e) { app.notify(errText(e), "error"); }
}

type Shared = { installation: Partial<Installation>; content: { kind: ContentKind; file: string; url: string; sha1?: string; sha512?: string; size?: number }[]; notIncluded: string[] };

export async function importInstallationFile(app: AppState) {
  if (!inApp) { app.notify(DESKTOP_ONLY, "error"); return; }
  const path = await open({ title: "Import installation", multiple: false, directory: false, filters: [{ name: "Kestrel installation", extensions: ["kestrel"] }] });
  if (typeof path !== "string") return;
  try {
    const f = (await api.readInstallationFile(path)) as Shared;
    app.openDialog({ title: "Import installation", body: <ImportFile app={app} f={f} /> });
  } catch (e) { app.notify(errText(e), "error"); }
}

function ImportFile({ app, f }: { app: AppState; f: Shared }) {
  const src = f.installation ?? {};
  const [name, setName] = useState(String(src.name ?? "Imported").slice(0, 32));
  const clean = name.trim();
  const taken = app.installations.some((i) => i.name.toLowerCase() === clean.toLowerCase());
  const go = async () => {
    const fields: Partial<Installation> = {
      version: "1.8.9", mode: src.mode === "Standard" ? "Standard" : "OptiFine", cover: src.cover && COVERS[src.cover] ? src.cover : "hypixel",
      memoryGb: Math.min(32, Math.max(1, Number(src.memoryGb) || 3)), jvmArgs: typeof src.jvmArgs === "string" ? src.jvmArgs : "",
      width: Number(src.width) || 1280, height: Number(src.height) || 720, fullscreen: !!src.fullscreen,
      optifine: typeof src.optifine === "string" ? src.optifine : null,
    };
    const inst = makeInstallation(clean, fields, app.installations.map((i) => i.id), app.settings);
    app.addInstallation(inst); app.closeDialog();
    app.navigate({ name: "installations", id: inst.id });
    await api.prepareInstance(inst.id).catch(() => {});
    let ok = 0;
    for (const c of f.content ?? []) {
      try { await api.installContent({ instanceId: inst.id, kind: c.kind, url: c.url, filename: c.file, sha1: c.sha1, sha512: c.sha512, size: c.size, title: c.file }); ok++; }
      catch { /* shown in Downloads */ }
    }
    app.notify(`${clean} imported${f.content?.length ? ` with ${ok} of ${f.content.length} files` : ""}.`);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <label>Name<input className="field on-surface" autoFocus value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />{taken && <span style={{ color: "var(--danger)" }}>You already have an installation with this name.</span>}</label>
      <Group>
        <Row title="Setup" detail={`${src.version ?? "1.8.9"} · ${src.mode ?? "OptiFine"} · ${src.memoryGb ?? 3} GB`} />
        <Row title="Files to download" detail={f.content?.length ? `${f.content.length} from Modrinth, each checked against its hash` : "None"} />
        {f.notIncluded?.length > 0 && <Row title="Not included" detail={`${f.notIncluded.slice(0, 3).join(", ")}${f.notIncluded.length > 3 ? ` and ${f.notIncluded.length - 3} more` : ""}. These weren't from Modrinth, so ask the sender for them.`} />}
        {src.optifine && <Row title="OptiFine" detail={`Uses ${pretty(String(src.optifine))}. Set it up on this PC from the installation's Overview.`} />}
      </Group>
      <div className="actions">
        <button className="btn ghost" onClick={app.closeDialog}>Cancel</button>
        <button className="btn green" disabled={!clean || taken} onClick={go}><Download size={15} />Import</button>
      </div>
    </div>
  );
}
