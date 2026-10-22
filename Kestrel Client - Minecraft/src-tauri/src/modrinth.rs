//! Modrinth API v2 (https://docs.modrinth.com/api/). Public endpoints, no key needed.

use crate::core::*;
use crate::download::{download_all, Item};
use crate::instances::{content_dir, ensure_instance};
use serde::Deserialize;
use serde_json::Value;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{AppHandle, State};

const API: &str = "https://api.modrinth.com/v2";

async fn get(http: &reqwest::Client, url: &str, query: &[(&str, String)]) -> Res<Value> {
    let r = http.get(url).query(query).send().await.map_err(err("Modrinth"))?;
    let status = r.status();
    if status.as_u16() == 429 { return Err("Modrinth is rate-limiting requests. Try again in a minute.".into()); }
    if !status.is_success() { return Err(format!("Modrinth returned {status}")); }
    r.json().await.map_err(err("Modrinth response"))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchArgs {
    pub query: String,
    pub project_type: String,       // mod | resourcepack | shader | modpack
    pub sort: String,               // relevance | downloads | follows | newest | updated
    pub game_version: Option<String>,
    pub loader: Option<String>,
    pub offset: u32,
    pub limit: u32,
}

#[tauri::command]
pub async fn modrinth_search(state: State<'_, AppState>, args: SearchArgs) -> Res<Value> {
    let mut facets = vec![vec![format!("project_type:{}", args.project_type)]];
    if let Some(v) = &args.game_version { facets.push(vec![format!("versions:{v}")]); }
    if let Some(l) = &args.loader { facets.push(vec![format!("categories:{l}")]); }
    let facets = serde_json::to_string(&facets).unwrap();
    get(&state.http, &format!("{API}/search"), &[
        ("query", args.query), ("facets", facets), ("index", args.sort),
        ("offset", args.offset.to_string()), ("limit", args.limit.min(50).to_string()),
    ]).await
}

#[tauri::command]
pub async fn modrinth_project(state: State<'_, AppState>, id: String) -> Res<Value> {
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') { return Err("Invalid project".into()); }
    get(&state.http, &format!("{API}/project/{id}"), &[]).await
}

#[tauri::command]
pub async fn modrinth_versions(state: State<'_, AppState>, id: String, game_version: Option<String>, loaders: Option<Vec<String>>) -> Res<Value> {
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') { return Err("Invalid project".into()); }
    let mut q = Vec::new();
    if let Some(v) = game_version { q.push(("game_versions", serde_json::to_string(&[v]).unwrap())); }
    if let Some(l) = loaders { q.push(("loaders", serde_json::to_string(&l).unwrap())); }
    get(&state.http, &format!("{API}/project/{id}/version"), &q).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallArgs {
    pub instance_id: String,
    pub kind: String,          // mods | resourcepacks | shaderpacks
    pub url: String,
    pub filename: String,
    pub sha1: Option<String>,
    pub sha512: Option<String>,
    pub size: Option<u64>,
    pub title: String,
}

#[tauri::command]
pub async fn install_content(app: AppHandle, state: State<'_, AppState>, args: InstallArgs) -> Res<String> {
    safe_id(&args.instance_id)?;
    let name = safe_file_name(&args.filename)?.to_string();
    if !args.url.starts_with("https://cdn.modrinth.com/") { return Err("Only Modrinth downloads are allowed".into()); }
    ensure_instance(&args.instance_id)?;
    let dir = content_dir(&args.instance_id, &args.kind)?;
    let path = dir.join(&name);
    let job_id = format!("content-{}-{}", args.instance_id, name);
    let cancel = Arc::new(AtomicBool::new(false));
    state.cancels.lock().unwrap().insert(job_id.clone(), cancel.clone());
    emit_job(&app, &JobUpdate { id: job_id.clone(), title: args.title.clone(), detail: "Downloading from Modrinth".into(), state: "running".into(), done: 0, total: 1, error: None });
    let item = Item { url: args.url, path: path.clone(), sha1: args.sha1, sha512: args.sha512, size: args.size };
    let r = download_all(&state.http, vec![item], 1, cancel, |_, _, _| {}).await;
    state.cancels.lock().unwrap().remove(&job_id);
    let mut job = JobUpdate { id: job_id, title: args.title.clone(), detail: String::new(), state: String::new(), done: 1, total: 1, error: None };
    match &r {
        Ok(_) => { job.state = "done".into(); job.detail = "Installed and verified".into(); write_log(&state, &format!("Installed {} into {}", name, args.instance_id)); }
        Err(e) => { job.state = "failed".into(); job.detail = e.clone(); job.error = Some(e.clone()); }
    }
    emit_job(&app, &job);
    r.map(|_| path.to_string_lossy().to_string())
}
