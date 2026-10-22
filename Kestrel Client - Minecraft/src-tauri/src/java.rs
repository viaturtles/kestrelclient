//! Finds Java installations on this PC and installs Mojang's Java 8 runtime.

use crate::core::*;
use crate::download::{download_all, Item};
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaInstall {
    pub path: String,
    pub version: String,
    pub major: u32,
    pub arch: String,
    pub vendor: String,
    pub source: String,
}

pub(crate) const RUNTIME_INDEX: &str = "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

pub fn managed_java(component: &str) -> PathBuf {
    runtime_dir().join(component).join("bin").join("javaw.exe")
}

fn find_java_exes(root: &Path, depth: u32, out: &mut Vec<PathBuf>) {
    if depth == 0 || out.len() > 60 { return; }
    let Ok(rd) = std::fs::read_dir(root) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if !p.is_dir() { continue; }
        let exe = p.join("bin").join("java.exe");
        if exe.is_file() { out.push(exe); } else { find_java_exes(&p, depth - 1, out); }
    }
}

fn candidates() -> Vec<(PathBuf, String)> {
    let mut v: Vec<(PathBuf, String)> = Vec::new();
    if let Some(h) = std::env::var_os("JAVA_HOME") { v.push((PathBuf::from(h).join("bin").join("java.exe"), "JAVA_HOME".into())); }
    if let Some(path) = std::env::var_os("PATH") {
        for d in std::env::split_paths(&path) { v.push((d.join("java.exe"), "PATH".into())); }
    }
    let mut roots: Vec<(PathBuf, &str, u32)> = Vec::new();
    for pf in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"] {
        if let Some(p) = std::env::var_os(pf) {
            let p = PathBuf::from(p);
            for vendor in ["Java", "Eclipse Adoptium", "Zulu", "Microsoft", "Amazon Corretto", "BellSoft", "AdoptOpenJDK", "Semeru"] {
                roots.push((p.join(vendor), "Installed", 2));
            }
        }
    }
    if let Some(a) = std::env::var_os("APPDATA") {
        roots.push((PathBuf::from(&a).join(".minecraft").join("runtime"), "Minecraft Launcher", 4));
    }
    if let Some(l) = std::env::var_os("LOCALAPPDATA") {
        roots.push((PathBuf::from(&l).join("Packages").join("Microsoft.4297127D64EC6_8wekyb3d8bbwe").join("LocalCache").join("Local").join("runtime"), "Minecraft Launcher", 4));
    }
    if let Some(u) = std::env::var_os("USERPROFILE") {
        roots.push((PathBuf::from(&u).join(".lunarclient").join("jre"), "Lunar Client", 3));
        roots.push((PathBuf::from(&u).join(".jdks"), "IntelliJ", 2));
    }
    roots.push((runtime_dir(), "Kestrel", 2));
    for (root, label, depth) in roots {
        let mut found = Vec::new();
        find_java_exes(&root, depth, &mut found);
        for f in found { v.push((f, label.to_string())); }
    }
    v
}

fn probe(exe: &Path) -> Option<(String, String, String)> {
    let mut cmd = std::process::Command::new(exe);
    cmd.args(["-XshowSettings:properties", "-version"]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().ok()?;
    let text = String::from_utf8_lossy(&out.stderr).to_string() + &String::from_utf8_lossy(&out.stdout);
    let prop = |k: &str| text.lines().find_map(|l| {
        let l = l.trim();
        l.strip_prefix(k).and_then(|r| r.trim_start().strip_prefix('=')).map(|v| v.trim().to_string())
    });
    Some((prop("java.version")?, prop("os.arch").unwrap_or_default(), prop("java.vendor").unwrap_or_default()))
}

pub fn major_of(version: &str) -> u32 {
    let mut parts = version.split(|c: char| c == '.' || c == '_' || c == '-' || c == '+');
    let first: u32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    if first == 1 { parts.next().and_then(|s| s.parse().ok()).unwrap_or(0) } else { first }
}

pub fn detect_blocking() -> Vec<JavaInstall> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for (exe, source) in candidates() {
        if !exe.is_file() { continue; }
        let key = exe.canonicalize().unwrap_or(exe.clone()).to_string_lossy().to_lowercase();
        if !seen.insert(key) { continue; }
        if let Some((version, arch, vendor)) = probe(&exe) {
            out.push(JavaInstall { path: exe.to_string_lossy().to_string(), major: major_of(&version), version, arch, vendor, source });
        }
    }
    out.sort_by(|a, b| a.major.cmp(&b.major).then(b.version.cmp(&a.version)));
    out
}

#[tauri::command]
pub async fn detect_java() -> Res<Vec<JavaInstall>> {
    tokio::task::spawn_blocking(detect_blocking).await.map_err(err("Java search"))
}

/// Downloads Mojang's official Java runtime component (jre-legacy = Java 8) into Kestrel's folder.
pub async fn install_runtime(app: &AppHandle, state: &AppState, component: &str, log: &(dyn Fn(&str) + Send + Sync)) -> Res<PathBuf> {
    let job_id = format!("runtime-{component}");
    let cancel = Arc::new(AtomicBool::new(false));
    state.cancels.lock().unwrap().insert(job_id.clone(), cancel.clone());
    let mut job = JobUpdate { id: job_id.clone(), title: "Java 8 runtime".into(), detail: "Reading Mojang's runtime list".into(), state: "running".into(), done: 0, total: 0, error: None };
    emit_job(app, &job);
    let result: Res<PathBuf> = async {
        let index: serde_json::Value = state.http.get(RUNTIME_INDEX).send().await.map_err(err("Runtime list"))?.json().await.map_err(err("Runtime list"))?;
        let entry = index["windows-x64"][component].get(0).ok_or("This Java runtime isn't offered for Windows x64")?;
        let url = entry["manifest"]["url"].as_str().ok_or("Runtime manifest missing")?;
        let ver = entry["version"]["name"].as_str().unwrap_or("").to_string();
        log(&format!("Java runtime {component} {ver} from Mojang"));
        let manifest: serde_json::Value = state.http.get(url).send().await.map_err(err("Runtime manifest"))?.json().await.map_err(err("Runtime manifest"))?;
        let root = runtime_dir().join(component);
        let mut items = Vec::new();
        if let Some(files) = manifest["files"].as_object() {
            for (rel, f) in files {
                if rel.contains("..") { continue; }
                let path = root.join(rel.replace('/', "\\"));
                match f["type"].as_str() {
                    Some("directory") => { let _ = std::fs::create_dir_all(&path); }
                    Some("file") => {
                        let raw = &f["downloads"]["raw"];
                        if let Some(u) = raw["url"].as_str() {
                            items.push(Item { url: u.into(), path, sha1: raw["sha1"].as_str().map(String::from), sha512: None, size: raw["size"].as_u64() });
                        }
                    }
                    _ => {}
                }
            }
        }
        log(&format!("{} runtime files to check", items.len()));
        let a = app.clone();
        let jid = job_id.clone();
        download_all(&state.http, items, 8, cancel.clone(), move |d, t, _| {
            emit_job(&a, &JobUpdate { id: jid.clone(), title: "Java 8 runtime".into(), detail: format!("{d} of {t} files"), state: "running".into(), done: d, total: t, error: None });
        }).await?;
        let _ = std::fs::write(root.join(".version"), ver);
        Ok(managed_java(component))
    }.await;
    state.cancels.lock().unwrap().remove(&job_id);
    match &result {
        Ok(_) => { job.state = "done".into(); job.detail = "Installed".into(); job.done = 1; job.total = 1; }
        Err(e) => { job.state = if e == "Cancelled" { "cancelled".into() } else { "failed".into() }; job.error = Some(e.clone()); job.detail = e.clone(); }
    }
    emit_job(app, &job);
    result
}

#[tauri::command]
pub async fn install_java_runtime(app: AppHandle, state: State<'_, AppState>) -> Res<String> {
    let st = state.inner();
    let p = install_runtime(&app, st, "jre-legacy", &|l| write_log(st, l)).await?;
    Ok(p.to_string_lossy().to_string())
}
