//! Minecraft versions and game files from Mojang's official servers.

use crate::core::*;
use crate::download::{download_all, Item};
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{AppHandle, State};

const MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const RESOURCES: &str = "https://resources.download.minecraft.net";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionSummary { pub id: String, pub kind: String, pub release_time: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionStatus { pub id: String, pub installed: bool, pub path: String }

async fn manifest(http: &reqwest::Client) -> Res<Value> {
    let cache = versions_dir().join("version_manifest_v2.json");
    match http.get(MANIFEST).send().await {
        Ok(r) if r.status().is_success() => {
            let v: Value = r.json().await.map_err(err("Version list"))?;
            let _ = std::fs::create_dir_all(versions_dir());
            let _ = std::fs::write(&cache, v.to_string());
            Ok(v)
        }
        _ => {
            let s = std::fs::read_to_string(&cache).map_err(|_| "Can't reach Mojang and no saved version list".to_string())?;
            serde_json::from_str(&s).map_err(err("Saved version list"))
        }
    }
}

#[tauri::command]
pub async fn mc_versions(state: State<'_, AppState>) -> Res<Vec<VersionSummary>> {
    let m = manifest(&state.http).await?;
    Ok(m["versions"].as_array().cloned().unwrap_or_default().iter().map(|v| VersionSummary {
        id: v["id"].as_str().unwrap_or("").into(),
        kind: v["type"].as_str().unwrap_or("").into(),
        release_time: v["releaseTime"].as_str().unwrap_or("").into(),
    }).collect())
}

pub fn version_paths(id: &str) -> (PathBuf, PathBuf, PathBuf) {
    let d = versions_dir().join(id);
    (d.join(format!("{id}.json")), d.join(format!("{id}.jar")), d.join("natives"))
}

pub async fn version_json(http: &reqwest::Client, id: &str) -> Res<Value> {
    let (json_path, _, _) = version_paths(id);
    if let Ok(s) = std::fs::read_to_string(&json_path) {
        if let Ok(v) = serde_json::from_str(&s) { return Ok(v); }
    }
    let m = manifest(http).await?;
    let entry = m["versions"].as_array().and_then(|a| a.iter().find(|v| v["id"] == id)).ok_or(format!("Minecraft {id} isn't in Mojang's version list"))?;
    let url = entry["url"].as_str().ok_or("Version URL missing")?;
    let v: Value = http.get(url).send().await.map_err(err("Version file"))?.json().await.map_err(err("Version file"))?;
    let _ = std::fs::create_dir_all(json_path.parent().unwrap());
    let _ = std::fs::write(&json_path, v.to_string());
    Ok(v)
}

/// Mojang's library rules, evaluated for 64-bit Windows.
pub fn allowed(lib: &Value) -> bool {
    let Some(rules) = lib["rules"].as_array() else { return true };
    let mut ok = false;
    for r in rules {
        let applies = match r["os"]["name"].as_str() { None => true, Some(n) => n == "windows" };
        if applies { ok = r["action"] == "allow"; }
    }
    ok
}

pub fn native_key(lib: &Value) -> Option<String> {
    lib["natives"]["windows"].as_str().map(|k| k.replace("${arch}", "64"))
}

pub struct Plan { pub items: Vec<Item>, pub natives: Vec<PathBuf>, pub classpath: Vec<PathBuf>, pub asset_index: String }

pub async fn plan(http: &reqwest::Client, v: &Value, id: &str) -> Res<Plan> {
    let (_, jar, _) = version_paths(id);
    let mut items = Vec::new();
    let mut natives = Vec::new();
    let mut classpath = Vec::new();
    let c = &v["downloads"]["client"];
    items.push(Item { url: c["url"].as_str().ok_or("Client download missing")?.into(), path: jar.clone(), sha1: c["sha1"].as_str().map(String::from), sha512: None, size: c["size"].as_u64() });
    for lib in v["libraries"].as_array().cloned().unwrap_or_default() {
        if !allowed(&lib) { continue; }
        let d = &lib["downloads"];
        if let Some(a) = d["artifact"].as_object() {
            let p = libraries_dir().join(a["path"].as_str().unwrap_or_default().replace('/', "\\"));
            items.push(Item { url: a["url"].as_str().unwrap_or_default().into(), path: p.clone(), sha1: a["sha1"].as_str().map(String::from), sha512: None, size: a["size"].as_u64() });
            classpath.push(p);
        }
        if let Some(k) = native_key(&lib) {
            if let Some(n) = d["classifiers"][k.as_str()].as_object() {
                let p = libraries_dir().join(n["path"].as_str().unwrap_or_default().replace('/', "\\"));
                items.push(Item { url: n["url"].as_str().unwrap_or_default().into(), path: p.clone(), sha1: n["sha1"].as_str().map(String::from), sha512: None, size: n["size"].as_u64() });
                natives.push(p);
            }
        }
    }
    classpath.push(jar);
    // Assets
    let ai = &v["assetIndex"];
    let index_id = ai["id"].as_str().unwrap_or("legacy").to_string();
    let index_path = assets_dir().join("indexes").join(format!("{index_id}.json"));
    let index_item = Item { url: ai["url"].as_str().ok_or("Asset index missing")?.into(), path: index_path.clone(), sha1: ai["sha1"].as_str().map(String::from), sha512: None, size: ai["size"].as_u64() };
    download_all(http, vec![index_item], 1, Arc::new(AtomicBool::new(false)), |_, _, _| {}).await?;
    let index: Value = serde_json::from_str(&std::fs::read_to_string(&index_path).map_err(err("Asset index"))?).map_err(err("Asset index"))?;
    if let Some(objs) = index["objects"].as_object() {
        for o in objs.values() {
            let Some(h) = o["hash"].as_str() else { continue };
            let pre = &h[..2];
            items.push(Item { url: format!("{RESOURCES}/{pre}/{h}"), path: assets_dir().join("objects").join(pre).join(h), sha1: Some(h.into()), sha512: None, size: o["size"].as_u64() });
        }
    }
    Ok(Plan { items, natives, classpath, asset_index: index_id })
}

fn extract_natives(archives: &[PathBuf], dest: &PathBuf) -> Res<usize> {
    std::fs::create_dir_all(dest).map_err(err("Natives folder"))?;
    let mut n = 0;
    for a in archives {
        let f = std::fs::File::open(a).map_err(err("Open natives"))?;
        let mut z = zip::ZipArchive::new(f).map_err(err("Read natives"))?;
        for i in 0..z.len() {
            let mut e = z.by_index(i).map_err(err("Read natives"))?;
            let name = e.name().to_string();
            if e.is_dir() || name.starts_with("META-INF") || name.contains("..") { continue; }
            let out = dest.join(name.replace('/', "\\"));
            if let Some(p) = out.parent() { let _ = std::fs::create_dir_all(p); }
            let mut w = std::fs::File::create(&out).map_err(err("Write native"))?;
            std::io::copy(&mut e, &mut w).map_err(err("Write native"))?;
            n += 1;
        }
    }
    Ok(n)
}

/// Downloads and verifies everything Minecraft `id` needs. Safe to run again: valid files are skipped.
pub async fn install(app: &AppHandle, state: &AppState, id: &str, log: &(dyn Fn(&str) + Send + Sync)) -> Res<Plan> {
    let job_id = format!("game-{id}");
    let cancel = Arc::new(AtomicBool::new(false));
    state.cancels.lock().unwrap().insert(job_id.clone(), cancel.clone());
    let title = format!("Minecraft {id}");
    emit_job(app, &JobUpdate { id: job_id.clone(), title: title.clone(), detail: "Reading version files".into(), state: "running".into(), done: 0, total: 0, error: None });
    let result: Res<Plan> = async {
        log(&format!("Reading Minecraft {id} from Mojang"));
        let v = version_json(&state.http, id).await?;
        let p = plan(&state.http, &v, id).await?;
        log(&format!("{} files to check (game, libraries, assets)", p.items.len()));
        let a = app.clone();
        let jid = job_id.clone();
        let t2 = title.clone();
        download_all(&state.http, p.items.clone(), 10, cancel.clone(), move |d, t, b| {
            let mb = b as f64 / 1_048_576.0;
            emit_job(&a, &JobUpdate { id: jid.clone(), title: t2.clone(), detail: format!("{d} of {t} files · {mb:.1} MB downloaded"), state: "running".into(), done: d, total: t, error: None });
        }).await?;
        let (_, _, natives_dir) = version_paths(id);
        let n = extract_natives(&p.natives, &natives_dir)?;
        log(&format!("Unpacked {n} native files"));
        Ok(p)
    }.await;
    state.cancels.lock().unwrap().remove(&job_id);
    let mut job = JobUpdate { id: job_id, title, detail: String::new(), state: String::new(), done: 1, total: 1, error: None };
    match &result {
        Ok(_) => {
            job.state = "done".into(); job.detail = "Installed and verified".into();
            // Every file passed its check: remember that, so Home can say "Launch" instead of "Install".
            let _ = std::fs::write(version_paths(id).0.with_file_name(".kestrel-complete"), b"ok");
        }
        Err(e) => { job.state = if e == "Cancelled" { "cancelled".into() } else { "failed".into() }; job.detail = e.clone(); job.error = Some(e.clone()); }
    }
    emit_job(app, &job);
    result
}

#[tauri::command]
pub async fn install_game(app: AppHandle, state: State<'_, AppState>, version: String) -> Res<()> {
    let st = state.inner();
    install(&app, st, &version, &|l| write_log(st, l)).await.map(|_| ())
}

#[tauri::command]
pub async fn game_status(version: String) -> Res<VersionStatus> {
    let (json, jar, natives) = version_paths(&version);
    let complete = json.with_file_name(".kestrel-complete").is_file();
    Ok(VersionStatus { installed: complete && json.is_file() && jar.is_file() && natives.is_dir(), path: jar.to_string_lossy().to_string(), id: version })
}

#[tauri::command]
pub fn cancel_job(state: State<'_, AppState>, id: String) -> Res<()> {
    if let Some(c) = state.cancels.lock().unwrap().get(&id) { c.store(true, std::sync::atomic::Ordering::Relaxed); }
    Ok(())
}
