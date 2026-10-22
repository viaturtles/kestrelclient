//! Installation folders: %APPDATA%\Kestrel\instances\<id>\{mods,resourcepacks,shaderpacks,screenshots,saves}

use crate::core::*;
use serde::Serialize;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const KINDS: [&str; 5] = ["mods", "resourcepacks", "shaderpacks", "screenshots", "saves"];

pub fn instance_dir(id: &str) -> Res<PathBuf> { Ok(instances_dir().join(safe_id(id)?)) }

pub fn ensure_instance(id: &str) -> Res<PathBuf> {
    let d = instance_dir(id)?;
    for k in KINDS { std::fs::create_dir_all(d.join(k)).map_err(err("Create installation folder"))?; }
    Ok(d)
}

pub fn content_dir(id: &str, kind: &str) -> Res<PathBuf> {
    if !KINDS.contains(&kind) { return Err("Unknown folder".into()); }
    Ok(instance_dir(id)?.join(kind))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentFile { pub file: String, pub name: String, pub size: u64, pub enabled: bool, pub modified: u64 }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Paths { pub data: String, pub instances: String, pub logs: String, pub total_memory_mb: u64 }

#[tauri::command]
pub fn app_paths() -> Res<Paths> {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    Ok(Paths {
        data: data_dir().to_string_lossy().into(),
        instances: instances_dir().to_string_lossy().into(),
        logs: logs_dir().to_string_lossy().into(),
        total_memory_mb: sys.total_memory() / 1_048_576,
    })
}

#[tauri::command]
pub fn prepare_instance(id: String) -> Res<String> { Ok(ensure_instance(&id)?.to_string_lossy().into()) }

#[tauri::command]
pub fn list_content(id: String, kind: String) -> Res<Vec<ContentFile>> {
    let dir = content_dir(&id, &kind)?;
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(&dir) else { return Ok(out) };
    for e in rd.flatten() {
        let p = e.path();
        let file = e.file_name().to_string_lossy().to_string();
        if file.ends_with(".part") || file.starts_with('.') { continue; }
        let meta = e.metadata().ok();
        let enabled = !file.ends_with(".disabled");
        let name = file.trim_end_matches(".disabled").to_string();
        let size = meta.as_ref().map(|m| if m.is_file() { m.len() } else { 0 }).unwrap_or(0);
        let modified = meta.and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
        if kind == "screenshots" && !p.extension().map(|x| x.eq_ignore_ascii_case("png")).unwrap_or(false) { continue; }
        out.push(ContentFile { file, name, size, enabled, modified });
    }
    out.sort_by(|a, b| if kind == "screenshots" { b.modified.cmp(&a.modified) } else { a.name.to_lowercase().cmp(&b.name.to_lowercase()) });
    Ok(out)
}

#[tauri::command]
pub fn set_content_enabled(id: String, kind: String, file: String, enabled: bool) -> Res<String> {
    let dir = content_dir(&id, &kind)?;
    let file = safe_file_name(&file)?;
    let from = dir.join(file);
    let base = file.trim_end_matches(".disabled");
    let to = dir.join(if enabled { base.to_string() } else { format!("{base}.disabled") });
    if from != to { std::fs::rename(&from, &to).map_err(err("Rename"))?; }
    Ok(to.file_name().unwrap().to_string_lossy().into())
}

#[tauri::command]
pub fn delete_content(id: String, kind: String, file: String) -> Res<()> {
    let p = content_dir(&id, &kind)?.join(safe_file_name(&file)?);
    if p.is_dir() { std::fs::remove_dir_all(&p) } else { std::fs::remove_file(&p) }.map_err(err("Delete"))
}

/// Opens a Kestrel folder (an installation, one of its subfolders, logs, or the data root) in Explorer.
#[tauri::command]
pub fn open_folder(app: AppHandle, target: String, id: Option<String>, kind: Option<String>) -> Res<()> {
    let p = match target.as_str() {
        "data" => data_dir(),
        "logs" => logs_dir(),
        "backups" => data_dir().join("backups").join(safe_id(id.as_deref().unwrap_or(""))?),
        "instance" => ensure_instance(id.as_deref().unwrap_or(""))?,
        "content" => { ensure_instance(id.as_deref().unwrap_or(""))?; content_dir(id.as_deref().unwrap_or(""), kind.as_deref().unwrap_or(""))? }
        _ => return Err("Unknown folder".into()),
    };
    std::fs::create_dir_all(&p).map_err(err("Create folder"))?;
    if !inside_data_dir(&p) { return Err("Folder is outside Kestrel's data folder".into()); }
    app.opener().open_path(p.to_string_lossy().to_string(), None::<&str>).map_err(err("Open folder"))
}

/// Opens a screenshot or file inside Kestrel's folder with its default app.
#[tauri::command]
pub fn reveal_file(app: AppHandle, id: String, kind: String, file: String) -> Res<()> {
    let p = content_dir(&id, &kind)?.join(safe_file_name(&file)?);
    if !inside_data_dir(&p) { return Err("File is outside Kestrel's data folder".into()); }
    app.opener().reveal_item_in_dir(&p).map_err(err("Show file"))
}

/// Opens an https link in the default browser (Modrinth pages and similar).
#[tauri::command]
pub fn open_link(app: AppHandle, url: String) -> Res<()> {
    let allowed = ["https://modrinth.com/", "https://hypixel.net/", "https://www.minecraft.net/", "https://learn.microsoft.com/"];
    if !allowed.iter().any(|a| url.starts_with(a)) { return Err("That link isn't allowed".into()); }
    app.opener().open_url(url, None::<&str>).map_err(err("Open link"))
}
