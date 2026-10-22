//! Export / import an installation as a single .kestrel file (settings + Modrinth content list).

use crate::content::sha1_file;
use crate::core::*;
use crate::instances::content_dir;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::State;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportArgs { pub path: String, pub id: String, pub installation: Value }

#[tauri::command]
pub async fn export_installation(state: State<'_, AppState>, args: ExportArgs) -> Res<u32> {
    safe_id(&args.id)?;
    if !args.path.to_lowercase().ends_with(".kestrel") { return Err("Save it as a .kestrel file".into()); }
    let mut entries: Vec<(String, String, String)> = Vec::new(); // kind, file, sha1
    for kind in ["resourcepacks", "shaderpacks", "mods"] {
        if let Ok(rd) = std::fs::read_dir(content_dir(&args.id, kind)?) {
            for e in rd.flatten() {
                let p = e.path();
                let name = e.file_name().to_string_lossy().to_string();
                if !p.is_file() || name.ends_with(".disabled") || name.ends_with(".part") { continue; }
                if let Some(h) = sha1_file(&p) { entries.push((kind.into(), name, h)); }
            }
        }
    }
    let known: HashMap<String, Value> = if entries.is_empty() { HashMap::new() } else {
        state.http.post("https://api.modrinth.com/v2/version_files").json(&json!({ "hashes": entries.iter().map(|e| &e.2).collect::<Vec<_>>(), "algorithm": "sha1" }))
            .send().await.map_err(err("Modrinth"))?.json().await.unwrap_or_default()
    };
    let mut content = Vec::new();
    let mut unknown = Vec::new();
    for (kind, file, h) in entries {
        let f = known.get(&h).and_then(|v| v["files"].as_array().and_then(|fs| fs.iter().find(|f| f["hashes"]["sha1"] == h.as_str())).map(|f| (v, f)));
        match f {
            Some((v, f)) => content.push(json!({ "kind": kind, "file": f["filename"], "projectId": v["project_id"], "versionId": v["id"], "url": f["url"], "sha1": h, "sha512": f["hashes"]["sha512"], "size": f["size"] })),
            None => unknown.push(json!({ "kind": kind, "file": file })),
        }
    }
    let i = &args.installation;
    let manifest = json!({
        "format": "kestrel-installation", "formatVersion": 1, "exportedBy": "Kestrel 0.1",
        "installation": { "name": i["name"], "version": i["version"], "mode": i["mode"], "memoryGb": i["memoryGb"], "width": i["width"], "height": i["height"], "fullscreen": i["fullscreen"], "jvmArgs": i["jvmArgs"], "cover": i["cover"] },
        "content": content, "notIncluded": unknown,
    });
    std::fs::write(&args.path, serde_json::to_string_pretty(&manifest).unwrap()).map_err(err("Save export"))?;
    write_log(&state, &format!("Exported {} with {} Modrinth files", args.id, content.len()));
    Ok(content.len() as u32)
}

#[tauri::command]
pub fn read_installation_file(path: String) -> Res<Value> {
    let s = std::fs::read_to_string(&path).map_err(err("Open file"))?;
    if s.len() > 2_000_000 { return Err("That file is too large to be a Kestrel export".into()); }
    let v: Value = serde_json::from_str(&s).map_err(|_| "That isn't a Kestrel installation file".to_string())?;
    if v["format"] != "kestrel-installation" { return Err("That isn't a Kestrel installation file".into()); }
    Ok(v)
}
