//! Bring your setup over from the standard .minecraft folder (also used by Lunar),
//! and set up OptiFine using OptiFine's own installer.

use crate::core::*;
use crate::download::{download_all, Item};
use crate::instances::{content_dir, ensure_instance};
use crate::{java, mojang, nbt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{AppHandle, State};

pub fn dot_minecraft() -> PathBuf {
    std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_default().join(".minecraft")
}

/// Removes Minecraft § colour codes from a display name.
pub fn clean_name(s: &str) -> String {
    let mut out = String::new();
    let mut skip = false;
    for c in s.chars() { if skip { skip = false; continue; } if c == '§' { skip = true; continue; } out.push(c); }
    let t = out.trim_start_matches(|c: char| c == '!' || c.is_whitespace()).trim().to_string();
    t.trim_end_matches(".zip").to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackEntry { pub file: String, pub name: String, pub size: u64 }
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SavedServer { pub name: String, pub address: String }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportScan {
    pub found: bool, pub path: String, pub options: bool, pub servers: Vec<SavedServer>,
    pub resourcepacks: Vec<PackEntry>, pub shaderpacks: Vec<PackEntry>, pub optifine: Vec<String>,
}

fn list_packs(dir: &Path) -> Vec<PackEntry> {
    let mut v = Vec::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let file = e.file_name().to_string_lossy().to_string();
            let meta = e.metadata().ok();
            let is_zip = file.to_lowercase().ends_with(".zip");
            let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
            if !is_zip && !is_dir { continue; }
            v.push(PackEntry { name: clean_name(&file), size: meta.map(|m| m.len()).unwrap_or(0), file });
        }
    }
    v.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    v
}

pub fn read_servers(path: &Path) -> Vec<SavedServer> {
    let Ok(bytes) = std::fs::read(path) else { return vec![] };
    let Ok(root) = nbt::parse(&bytes) else { return vec![] };
    root.get("servers").map(|l| l.list().iter().filter_map(|s| {
        let address = s.get("ip")?.str()?.trim().to_string();
        let name = s.get("name").and_then(|n| n.str()).map(clean_name).filter(|n| !n.is_empty()).unwrap_or_else(|| address.clone());
        if address.is_empty() { None } else { Some(SavedServer { name, address }) }
    }).collect()).unwrap_or_default()
}

fn optifine_versions_in(versions: &Path) -> Vec<String> {
    let mut v = Vec::new();
    if let Ok(rd) = std::fs::read_dir(versions) {
        for e in rd.flatten() {
            let id = e.file_name().to_string_lossy().to_string();
            if !id.to_lowercase().contains("optifine") { continue; }
            let json = e.path().join(format!("{id}.json"));
            if let Ok(s) = std::fs::read_to_string(&json) {
                if let Ok(j) = serde_json::from_str::<Value>(&s) {
                    if j["inheritsFrom"] == "1.8.9" || id.starts_with("1.8.9") { v.push(id); }
                }
            }
        }
    }
    v
}

#[tauri::command]
pub fn import_scan() -> Res<ImportScan> {
    let mc = dot_minecraft();
    let found = mc.is_dir();
    Ok(ImportScan {
        found, path: mc.to_string_lossy().into(),
        options: mc.join("options.txt").is_file(),
        servers: read_servers(&mc.join("servers.dat")),
        resourcepacks: list_packs(&mc.join("resourcepacks")),
        shaderpacks: list_packs(&mc.join("shaderpacks")),
        optifine: optifine_versions_in(&mc.join("versions")),
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportArgs { pub instance_id: String, pub options: bool, pub servers: bool, pub resourcepacks: Vec<String>, pub shaderpacks: Vec<String> }

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for e in std::fs::read_dir(from)?.flatten() {
        let p = e.path();
        let t = to.join(e.file_name());
        if p.is_dir() { copy_dir(&p, &t)?; } else { std::fs::copy(&p, &t)?; }
    }
    Ok(())
}

#[tauri::command]
pub async fn import_into(state: State<'_, AppState>, args: ImportArgs) -> Res<u32> {
    let dest = ensure_instance(&args.instance_id)?;
    let mc = dot_minecraft();
    let mut n = 0u32;
    if args.options {
        for f in ["options.txt", "optionsof.txt"] {
            if mc.join(f).is_file() { std::fs::copy(mc.join(f), dest.join(f)).map_err(err("Copy settings"))?; n += 1; }
        }
    }
    if args.servers && mc.join("servers.dat").is_file() { std::fs::copy(mc.join("servers.dat"), dest.join("servers.dat")).map_err(err("Copy servers"))?; n += 1; }
    for (kind, files) in [("resourcepacks", &args.resourcepacks), ("shaderpacks", &args.shaderpacks)] {
        let to = content_dir(&args.instance_id, kind)?;
        for f in files {
            let name = safe_file_name(f)?;
            let src = mc.join(kind).join(name);
            if src.is_dir() { copy_dir(&src, &to.join(name)).map_err(err("Copy pack"))?; } else if src.is_file() { std::fs::copy(&src, to.join(name)).map_err(err("Copy pack"))?; } else { continue; }
            n += 1;
        }
    }
    write_log(&state, &format!("Imported {n} items from .minecraft into {}", args.instance_id));
    Ok(n)
}

// ---------------- OptiFine ----------------

/// Maven coordinate "group:artifact:version" to a relative library path.
pub fn maven_path(name: &str) -> Option<String> {
    let mut p = name.split(':');
    let (g, a, v) = (p.next()?, p.next()?, p.next()?);
    Some(format!("{}/{a}/{v}/{a}-{v}.jar", g.replace('.', "/")))
}

/// Kestrel-imported OptiFine versions for 1.8.9.
#[tauri::command]
pub fn optifine_list() -> Res<Vec<String>> { Ok(optifine_versions_in(&versions_dir())) }

/// Prepares .minecraft so OptiFine's installer can run, then opens the installer the user picked.
#[tauri::command]
pub async fn optifine_run_installer(app: AppHandle, state: State<'_, AppState>, path: String) -> Res<()> {
    let jar = PathBuf::from(&path);
    if !jar.is_file() || !path.to_lowercase().ends_with(".jar") { return Err("Choose the OptiFine .jar file you downloaded from optifine.net".into()); }
    {
        let f = std::fs::File::open(&jar).map_err(err("Open OptiFine"))?;
        let z = zip::ZipArchive::new(f).map_err(|_| "That file isn't a valid .jar".to_string())?;
        if !z.file_names().any(|n| n.starts_with("optifine/") || n.starts_with("net/optifine/")) { return Err("That .jar isn't an OptiFine installer".into()); }
    }
    // OptiFine needs vanilla 1.8.9 in .minecraft. Copy Kestrel's verified files if missing.
    let st = state.inner();
    mojang::install(&app, st, "1.8.9", &|l| write_log(st, l)).await?;
    let mc = dot_minecraft();
    let vdir = mc.join("versions").join("1.8.9");
    let (kj, kjar, _) = mojang::version_paths("1.8.9");
    std::fs::create_dir_all(&vdir).map_err(err("Prepare .minecraft"))?;
    if !vdir.join("1.8.9.json").is_file() { std::fs::copy(&kj, vdir.join("1.8.9.json")).map_err(err("Prepare .minecraft"))?; }
    if !vdir.join("1.8.9.jar").is_file() { std::fs::copy(&kjar, vdir.join("1.8.9.jar")).map_err(err("Prepare .minecraft"))?; }
    if !mc.join("launcher_profiles.json").is_file() { std::fs::write(mc.join("launcher_profiles.json"), "{\"profiles\":{}}").map_err(err("Prepare .minecraft"))?; }
    let javas = tokio::task::spawn_blocking(java::detect_blocking).await.unwrap_or_default();
    let java_exe = if java::managed_java("jre-legacy").is_file() { java::managed_java("jre-legacy").with_file_name("java.exe") } else {
        javas.iter().find(|j| j.arch.contains("64")).map(|j| PathBuf::from(&j.path)).ok_or("No Java found to run the installer. Download Java 8 in Settings → Game first.")?
    };
    let mut cmd = std::process::Command::new(java_exe);
    cmd.arg("-jar").arg(&jar).current_dir(jar.parent().unwrap_or(Path::new(".")));
    cmd.spawn().map_err(err("Start OptiFine installer"))?;
    write_log(st, &format!("Opened OptiFine installer {}", jar.display()));
    Ok(())
}

/// Copies an OptiFine version installed in .minecraft (by OptiFine's installer) into Kestrel.
#[tauri::command]
pub async fn optifine_import(state: State<'_, AppState>, id: String) -> Res<String> {
    import_optifine_from(&state, &dot_minecraft(), &id).await
}

/// The official download page for OptiFine 1.8.9 HD U M5 (OptiFine's own page with its ads).
/// OptiFine may not be redistributed, so Kestrel never hosts it or downloads it itself.
pub const OPTIFINE_PAGE: &str = "https://optifine.net/adloadx?f=OptiFine_1.8.9_HD_U_M5.jar";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptiFineAuto { pub installed: bool, pub id: Option<String>, pub page: String }

/// True when this OptiFine version is imported and all its files are present.
#[tauri::command]
pub fn optifine_ready(id: String) -> bool { optifine_overlay(&id).is_some() }

/// Automatic OptiFine for 1.8.9: uses one already set up in Kestrel, or installs the jar the player
/// downloaded (found in their Downloads folder) without OptiFine's window. Otherwise answers
/// installed: false, and the launcher opens the official download page and asks again.
#[tauri::command]
pub async fn optifine_auto(app: AppHandle, state: State<'_, AppState>) -> Res<OptiFineAuto> {
    let page = OPTIFINE_PAGE.to_string();
    if let Some(id) = optifine_versions_in(&versions_dir()).into_iter().filter(|v| v.contains("1.8.9")).find(|v| optifine_overlay(v).is_some()) {
        return Ok(OptiFineAuto { installed: true, id: Some(id), page });
    }
    let Some(jar) = find_optifine_download() else { return Ok(OptiFineAuto { installed: false, id: None, page }) };
    let st = state.inner();
    write_log(st, &format!("Installing OptiFine from {}", jar.display()));
    // A private stand-in for .minecraft, so the player's real one is never touched.
    let dir = data_dir().join("tools").join("optifine-setup");
    let _ = std::fs::remove_dir_all(&dir);
    mojang::install(&app, st, "1.8.9", &|l| write_log(st, l)).await?;
    let vdir = dir.join("versions").join("1.8.9");
    std::fs::create_dir_all(&vdir).map_err(err("Prepare OptiFine"))?;
    std::fs::create_dir_all(dir.join("libraries")).map_err(err("Prepare OptiFine"))?;
    let (kj, kjar, _) = mojang::version_paths("1.8.9");
    std::fs::copy(&kj, vdir.join("1.8.9.json")).map_err(err("Prepare OptiFine"))?;
    std::fs::copy(&kjar, vdir.join("1.8.9.jar")).map_err(err("Prepare OptiFine"))?;
    std::fs::write(dir.join("launcher_profiles.json"), "{\"profiles\":{}}").map_err(err("Prepare OptiFine"))?;
    let java_exe = if java::managed_java("jre-legacy").is_file() { java::managed_java("jre-legacy") } else {
        java::install_runtime(&app, st, "jre-legacy", &|l| write_log(st, l)).await?
    };
    let core = crate::launch::tool_jar("kestrel-core.jar", crate::launch::CORE)?;
    let cp = format!("{};{}", jar.display(), core.display());
    let out = tokio::process::Command::new(&java_exe)
        .args(["-Djava.awt.headless=true", "-cp", &cp, "kestrel.core.OptiFineSetup"]).arg(&dir)
        .creation_flags(0x0800_0000).output().await.map_err(err("Run OptiFine's installer"))?;
    let text = String::from_utf8_lossy(&out.stdout).to_string() + &String::from_utf8_lossy(&out.stderr);
    if !out.status.success() || !text.contains("KESTREL_OK") {
        write_log(st, &format!("OptiFine install failed: {}", text.trim()));
        return Err("OptiFine couldn't be installed automatically. Use Installations → Overview → OptiFine instead.".into());
    }
    let id = optifine_versions_in(&dir.join("versions")).into_iter().find(|v| v.contains("1.8.9"))
        .ok_or("OptiFine installed, but its version wasn't found")?;
    let id = import_optifine_from(st, &dir, &id).await?;
    let _ = std::fs::remove_dir_all(&dir);
    write_log(st, &format!("OptiFine ready: {id}"));
    Ok(OptiFineAuto { installed: true, id: Some(id), page })
}

/// The newest OptiFine 1.8.9 jar in the player's Downloads folder(s), if any.
fn find_optifine_download() -> Option<PathBuf> {
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    for dir in downloads_dirs() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_lowercase();
            if !(name.ends_with(".jar") && name.contains("optifine") && name.contains("1.8.9")) { continue; }
            let p = e.path();
            if !is_optifine_jar(&p) { continue; }
            let t = e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
            if best.as_ref().map(|b| t > b.0).unwrap_or(true) { best = Some((t, p)); }
        }
    }
    best.map(|b| b.1)
}

fn is_optifine_jar(p: &Path) -> bool {
    std::fs::File::open(p).ok().and_then(|f| zip::ZipArchive::new(f).ok()).map(|z| z.file_names().any(|n| n == "optifine/Installer.class")).unwrap_or(false)
}

/// %USERPROFILE%\Downloads plus wherever Windows says Downloads was moved to.
fn downloads_dirs() -> Vec<PathBuf> {
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    let mut dirs = vec![PathBuf::from(&home).join("Downloads")];
    let q = std::process::Command::new("reg")
        .args(["query", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders", "/v", "{374DE290-123F-4565-9164-39C4925E467B}"])
        .creation_flags(0x0800_0000).output();
    if let Ok(o) = q {
        let s = String::from_utf8_lossy(&o.stdout);
        if let Some(v) = s.lines().find_map(|l| l.split("REG_EXPAND_SZ").nth(1).or_else(|| l.split("REG_SZ").nth(1))) {
            let p = PathBuf::from(v.trim().replace("%USERPROFILE%", &home));
            if !dirs.contains(&p) { dirs.push(p); }
        }
    }
    dirs
}

/// Copies an installed OptiFine version (json + libraries) from a Minecraft folder into Kestrel.
async fn import_optifine_from(state: &AppState, mc: &Path, id: &str) -> Res<String> {
    let id = id.to_string();
    if id.contains(['/', '\\']) || id.contains("..") { return Err("Invalid version".into()); }
    let src = mc.join("versions").join(&id).join(format!("{id}.json"));
    let s = std::fs::read_to_string(&src).map_err(|_| format!("{id} isn't installed in .minecraft"))?;
    let j: Value = serde_json::from_str(&s).map_err(err("OptiFine version file"))?;
    let mut items = Vec::new();
    for lib in j["libraries"].as_array().cloned().unwrap_or_default() {
        let Some(rel) = lib["name"].as_str().and_then(maven_path) else { continue };
        let dest = libraries_dir().join(rel.replace('/', "\\"));
        let local = mc.join("libraries").join(rel.replace('/', "\\"));
        if local.is_file() {
            if let Some(p) = dest.parent() { let _ = std::fs::create_dir_all(p); }
            std::fs::copy(&local, &dest).map_err(err("Copy OptiFine library"))?;
        } else {
            let base = lib["url"].as_str().unwrap_or("https://libraries.minecraft.net/");
            items.push(Item { url: format!("{}{rel}", if base.ends_with('/') { base.to_string() } else { format!("{base}/") }), path: dest, sha1: None, sha512: None, size: None });
        }
    }
    if !items.is_empty() { download_all(&state.http, items, 4, Arc::new(AtomicBool::new(false)), |_, _, _| {}).await?; }
    let dir = versions_dir().join(&id);
    std::fs::create_dir_all(&dir).map_err(err("Save OptiFine"))?;
    std::fs::write(dir.join(format!("{id}.json")), s).map_err(err("Save OptiFine"))?;
    write_log(state, &format!("Imported {id} from {}", mc.display()));
    Ok(id)
}

/// Returns (extra classpath, main class, game argument template) for an imported OptiFine version.
pub fn optifine_overlay(id: &str) -> Option<(Vec<PathBuf>, String, String)> {
    let s = std::fs::read_to_string(versions_dir().join(id).join(format!("{id}.json"))).ok()?;
    let j: Value = serde_json::from_str(&s).ok()?;
    let cp: Vec<PathBuf> = j["libraries"].as_array()?.iter().filter_map(|l| l["name"].as_str().and_then(maven_path)).map(|r| libraries_dir().join(r.replace('/', "\\"))).collect();
    if cp.iter().any(|p| !p.is_file()) { return None; }
    Some((cp, j["mainClass"].as_str()?.to_string(), j["minecraftArguments"].as_str()?.to_string()))
}
