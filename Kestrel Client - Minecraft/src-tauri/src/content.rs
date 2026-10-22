//! Installed content: Modrinth identification and updates, drag-and-drop imports, worlds and backups.

use crate::core::*;
use crate::instances::{content_dir, ensure_instance, instance_dir};
use crate::nbt;
use base64::Engine;
use serde::Serialize;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::State;

const API: &str = "https://api.modrinth.com/v2";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFile { pub url: String, pub filename: String, pub sha1: Option<String>, pub sha512: Option<String>, pub size: Option<u64>, pub version_number: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Identified {
    pub file: String, pub sha1: String, pub project_id: Option<String>, pub slug: Option<String>, pub title: Option<String>,
    pub icon_url: Option<String>, pub version_number: Option<String>, pub version_id: Option<String>, pub url: Option<String>, pub update: Option<UpdateFile>,
}

pub fn sha1_file(p: &Path) -> Option<String> { std::fs::read(p).ok().map(|b| hex::encode(Sha1::digest(&b))) }

fn primary(v: &Value) -> Option<&Value> {
    let files = v["files"].as_array()?;
    files.iter().find(|f| f["primary"] == true).or(files.first())
}

/// Matches files in an installation folder against Modrinth by SHA-1 and looks for newer versions.
#[tauri::command]
pub async fn identify_content(state: State<'_, AppState>, id: String, kind: String, game_version: String) -> Res<Vec<Identified>> {
    let dir = content_dir(&id, &kind)?;
    let mut files: Vec<(String, String)> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            let p = e.path();
            if !p.is_file() { continue; }
            let name = e.file_name().to_string_lossy().to_string();
            if name.ends_with(".part") { continue; }
            if let Some(h) = sha1_file(&p) { files.push((name, h)); }
        }
    }
    if files.is_empty() { return Ok(vec![]); }
    let hashes: Vec<&str> = files.iter().map(|(_, h)| h.as_str()).collect();
    let http = &state.http;
    let known: HashMap<String, Value> = http.post(format!("{API}/version_files")).json(&json!({ "hashes": hashes, "algorithm": "sha1" }))
        .send().await.map_err(err("Modrinth"))?.json().await.unwrap_or_default();
    let loaders: Vec<&str> = match kind.as_str() { "resourcepacks" => vec!["minecraft"], "shaderpacks" => vec!["optifine"], _ => vec!["fabric", "forge"] };
    let updates: HashMap<String, Value> = if known.is_empty() { HashMap::new() } else {
        http.post(format!("{API}/version_files/update")).json(&json!({ "hashes": known.keys().collect::<Vec<_>>(), "algorithm": "sha1", "loaders": loaders, "game_versions": [game_version] }))
            .send().await.map_err(err("Modrinth"))?.json().await.unwrap_or_default()
    };
    let ids: Vec<String> = known.values().filter_map(|v| v["project_id"].as_str().map(String::from)).collect();
    let projects: Vec<Value> = if ids.is_empty() { vec![] } else {
        http.get(format!("{API}/projects")).query(&[("ids", serde_json::to_string(&ids).unwrap())]).send().await.map_err(err("Modrinth"))?.json().await.unwrap_or_default()
    };
    let proj = |pid: &str| projects.iter().find(|p| p["id"] == pid);
    Ok(files.into_iter().map(|(file, h)| {
        let v = known.get(&h);
        let pid = v.and_then(|v| v["project_id"].as_str()).map(String::from);
        let p = pid.as_deref().and_then(proj);
        let update = updates.get(&h).filter(|u| u["id"] != v.map(|v| v["id"].clone()).unwrap_or_default()).and_then(|u| {
            let f = primary(u)?;
            Some(UpdateFile { url: f["url"].as_str()?.into(), filename: f["filename"].as_str()?.into(), sha1: f["hashes"]["sha1"].as_str().map(String::from),
                sha512: f["hashes"]["sha512"].as_str().map(String::from), size: f["size"].as_u64(), version_number: u["version_number"].as_str().unwrap_or("").into() })
        });
        Identified {
            file, sha1: h, project_id: pid, slug: p.and_then(|p| p["slug"].as_str()).map(String::from), title: p.and_then(|p| p["title"].as_str()).map(String::from),
            icon_url: p.and_then(|p| p["icon_url"].as_str()).map(String::from), version_number: v.and_then(|v| v["version_number"].as_str()).map(String::from),
            version_id: v.and_then(|v| v["id"].as_str()).map(String::from), url: v.and_then(primary).and_then(|f| f["url"].as_str()).map(String::from), update,
        }
    }).collect())
}

/// Works out what a dropped file is: resource pack, shader pack or mod.
fn classify(p: &Path) -> Option<&'static str> {
    let name = p.file_name()?.to_string_lossy().to_lowercase();
    if name.ends_with(".jar") { return Some("mods"); }
    if !name.ends_with(".zip") { return None; }
    let f = std::fs::File::open(p).ok()?;
    let z = zip::ZipArchive::new(f).ok()?;
    let names: Vec<String> = z.file_names().map(|s| s.to_lowercase()).collect();
    if names.iter().any(|n| n.starts_with("shaders/") || n.contains("/shaders/")) { return Some("shaderpacks"); }
    if names.iter().any(|n| n == "pack.mcmeta" || n.ends_with("/pack.mcmeta")) { return Some("resourcepacks"); }
    None
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dropped { pub file: String, pub kind: Option<String>, pub error: Option<String> }

/// Copies files the user dropped onto Kestrel into the right folder of an installation.
#[tauri::command]
pub fn import_files(state: State<'_, AppState>, id: String, paths: Vec<String>) -> Res<Vec<Dropped>> {
    ensure_instance(&id)?;
    let mut out = Vec::new();
    for raw in paths {
        let p = PathBuf::from(&raw);
        let file = p.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        if !p.is_file() { out.push(Dropped { file, kind: None, error: Some("Not a file".into()) }); continue; }
        match classify(&p) {
            Some(kind) => {
                let to = content_dir(&id, kind)?.join(&file);
                match std::fs::copy(&p, &to) {
                    Ok(_) => { write_log(&state, &format!("Added {file} to {id}/{kind}")); out.push(Dropped { file, kind: Some(kind.into()), error: None }) }
                    Err(e) => out.push(Dropped { file, kind: Some(kind.into()), error: Some(e.to_string()) }),
                }
            }
            None => out.push(Dropped { file, kind: None, error: Some("Not a resource pack, shader or mod".into()) }),
        }
    }
    Ok(out)
}

// ---------------- Worlds ----------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct World { pub folder: String, pub name: String, pub last_played: i64, pub size: u64, pub icon: Option<String>, pub mode: Option<String> }

fn dir_size(p: &Path) -> u64 {
    let mut n = 0;
    if let Ok(rd) = std::fs::read_dir(p) {
        for e in rd.flatten() { let ep = e.path(); n += if ep.is_dir() { dir_size(&ep) } else { e.metadata().map(|m| m.len()).unwrap_or(0) }; }
    }
    n
}

#[tauri::command]
pub async fn list_worlds(id: String) -> Res<Vec<World>> {
    let saves = instance_dir(&id)?.join("saves");
    tokio::task::spawn_blocking(move || {
        let mut out = Vec::new();
        if let Ok(rd) = std::fs::read_dir(&saves) {
            for e in rd.flatten() {
                let p = e.path();
                if !p.join("level.dat").is_file() { continue; }
                let folder = e.file_name().to_string_lossy().to_string();
                let data = std::fs::read(p.join("level.dat")).ok().and_then(|b| nbt::parse_gzip(&b).ok());
                let d = data.as_ref().and_then(|t| t.get("Data"));
                let name = d.and_then(|d| d.get("LevelName")).and_then(|n| n.str()).map(String::from).unwrap_or_else(|| folder.clone());
                let last_played = d.and_then(|d| d.get("LastPlayed")).and_then(|n| n.long()).unwrap_or(0);
                let mode = d.and_then(|d| d.get("GameType")).and_then(|g| match g { nbt::Tag::Int(0) => Some("Survival"), nbt::Tag::Int(1) => Some("Creative"), nbt::Tag::Int(2) => Some("Adventure"), nbt::Tag::Int(3) => Some("Spectator"), _ => None }).map(String::from);
                let icon = std::fs::read(p.join("icon.png")).ok().filter(|b| b.len() < 200_000).map(|b| format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(b)));
                out.push(World { folder, name, last_played, size: dir_size(&p), icon, mode });
            }
        }
        out.sort_by(|a, b| b.last_played.cmp(&a.last_played));
        out
    }).await.map_err(err("Read worlds"))
}

fn zip_dir(src: &Path, dest: &Path) -> Res<()> {
    let f = std::fs::File::create(dest).map_err(err("Create backup"))?;
    let mut z = zip::ZipWriter::new(f);
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let base = src.parent().unwrap_or(src);
    let mut stack = vec![src.to_path_buf()];
    while let Some(d) = stack.pop() {
        for e in std::fs::read_dir(&d).map_err(err("Read world"))?.flatten() {
            let p = e.path();
            let rel = p.strip_prefix(base).unwrap().to_string_lossy().replace('\\', "/");
            if p.is_dir() { stack.push(p); continue; }
            if rel.ends_with("session.lock") { continue; }
            z.start_file(rel, opts).map_err(err("Write backup"))?;
            let bytes = std::fs::read(&p).map_err(err("Read world file"))?;
            z.write_all(&bytes).map_err(err("Write backup"))?;
        }
    }
    z.finish().map_err(err("Finish backup"))?;
    Ok(())
}

/// Zips a world into %APPDATA%\Kestrel\backups\<installation>\.
#[tauri::command]
pub async fn backup_world(state: State<'_, AppState>, id: String, folder: String) -> Res<String> {
    let src = instance_dir(&id)?.join("saves").join(safe_file_name(&folder)?);
    if !src.join("level.dat").is_file() { return Err("That world wasn't found".into()); }
    let out_dir = data_dir().join("backups").join(&id);
    std::fs::create_dir_all(&out_dir).map_err(err("Backups folder"))?;
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let dest = out_dir.join(format!("{folder}-{secs}.zip"));
    let d2 = dest.clone();
    tokio::task::spawn_blocking(move || zip_dir(&src, &d2)).await.map_err(err("Backup"))??;
    write_log(&state, &format!("Backed up world {folder} from {id}"));
    Ok(dest.to_string_lossy().into())
}
