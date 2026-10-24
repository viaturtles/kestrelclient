//! Launch pipeline reported live to Launch Control.

use crate::core::*;
use crate::discord::{now_ms, GameInfo, Place};
use crate::instances::ensure_instance;
use crate::{java, mojang};
use serde::Deserialize;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};

/// Gives Kestrel Core your Kestrel capes: every owned cape's texture in `<game folder>/kestrel/capes/<id>.png`
/// and `kestrel/cosmetics.properties` (which one you wear, names, animation). Without Discord or the
/// service, the files are removed. Only textures from Kestrel's own service are downloaded.
async fn write_cosmetics(http: &reqwest::Client, game_dir: &std::path::Path) -> Result<usize, String> {
    let dir = game_dir.join("kestrel");
    let props = dir.join("cosmetics.properties");
    let _ = std::fs::remove_file(dir.join("cape.png")); // the old one-cape files
    let _ = std::fs::remove_file(dir.join("cape.properties"));
    let _ = std::fs::create_dir_all(&dir);
    // Your Minecraft (Mojang) capes, when signed in with Microsoft.
    let mc = crate::account::game_capes(http, &dir).await.unwrap_or_default();
    let base = crate::config::SERVICE_URL.trim_end_matches('/');
    if base.is_empty() || crate::discord_account::access_token().is_none() {
        if mc.is_empty() { let _ = std::fs::remove_file(&props); } else { std::fs::write(&props, &mc).map_err(|e| e.to_string())?; }
        return Ok(0);
    }
    let me = crate::service::call(http, "GET", "/v1/me", None).await?;
    let list = crate::service::call(http, "GET", "/v1/capes", None).await?;
    let owned: Vec<String> = me["cosmetics"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    let caps = dir.join("capes");
    std::fs::create_dir_all(&caps).map_err(|e| e.to_string())?;
    let mut out = format!("equipped={}\n", me["cape"]["id"].as_str().unwrap_or(""));
    let mut ids = Vec::new();
    for c in list["capes"].as_array().cloned().unwrap_or_default() {
        let (Some(id), Some(url)) = (c["id"].as_str(), c["url"].as_str()) else { continue };
        if !owned.iter().any(|o| o == id) || !id.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-') { continue }
        if !url.starts_with(&format!("{base}/capes/")) { continue }
        let bytes = http.get(url).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?;
        if bytes.len() > 16 * 1024 * 1024 || !bytes.starts_with(b"\x89PNG") { continue }
        std::fs::write(caps.join(format!("{id}.png")), &bytes).map_err(|e| e.to_string())?;
        let name: String = c["name"].as_str().unwrap_or(id).chars().filter(|ch| !ch.is_control()).collect();
        out += &format!("cape.{id}.name={name}\ncape.{id}.frames={}\ncape.{id}.fps={}\n", c["frames"].as_u64().unwrap_or(1).clamp(1, 256), c["fps"].as_u64().unwrap_or(0).min(60));
        ids.push(id.to_string());
    }
    out += &format!("capes={}\n{mc}", ids.join(","));
    std::fs::write(&props, out).map_err(|e| e.to_string())?;
    Ok(ids.len())
}

/// Your friends for Kestrel Core's Friends tab: `<game folder>/kestrel/friends.properties`, refreshed while
/// the game runs (the game itself never holds your Discord sign-in).
async fn write_friends(http: &reqwest::Client, game_dir: &std::path::Path) {
    let f = game_dir.join("kestrel").join("friends.properties");
    if crate::config::SERVICE_URL.is_empty() || crate::discord_account::access_token().is_none() { let _ = std::fs::remove_file(&f); return; }
    let Ok(v) = crate::service::call(http, "GET", "/v1/friends", None).await else { return };
    // Java reads .properties as Latin-1, so anything else goes in as \uXXXX.
    let clean = |s: &str| s.chars().filter(|c| !c.is_control()).map(|c| match c {
        '\\' => "\\\\".to_string(),
        ' '..='~' => c.to_string(),
        _ => c.encode_utf16(&mut [0; 2]).iter().map(|u| format!("\\u{u:04x}")).collect(),
    }).collect::<String>();
    let mut out = String::new();
    let list = v["friends"].as_array().cloned().unwrap_or_default();
    for (i, p) in list.iter().enumerate() {
        let status = if p["playing"] == true { "playing" } else if p["online"] == true { "launcher" } else { "offline" };
        out += &format!("friend.{i}.name={}\nfriend.{i}.uuid={}\nfriend.{i}.status={status}\nfriend.{i}.server={}\nfriend.{i}.seen={}\n",
            clean(p["name"].as_str().unwrap_or("?")), p["mcUuid"].as_str().unwrap_or(""), clean(p["server"].as_str().unwrap_or("")), p["lastSeen"].as_u64().unwrap_or(0));
    }
    out += &format!("count={}\nincoming={}\n", list.len(), v["incoming"].as_array().map(|a| a.len()).unwrap_or(0));
    let _ = std::fs::write(&f, out);
}

/// A cape picked in game (Right Shift → Cosmetics) is saved to your account when the game closes.
async fn send_cape_choice(app: &AppHandle, http: &reqwest::Client, game_dir: &std::path::Path) {
    let f = game_dir.join("kestrel").join("cape-choice.properties");
    let Ok(text) = std::fs::read_to_string(&f) else { return };
    let _ = std::fs::remove_file(&f);
    let get = |key: &str| text.lines().find_map(|l| l.strip_prefix(&format!("{key}="))).map(|s| s.trim().to_string());
    let id = get("equipped").unwrap_or_default();
    if crate::discord_account::access_token().is_some() {
        let body = serde_json::json!({ "cape": if id.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(id) } });
        let _ = crate::service::call(http, "POST", "/v1/me/cape", Some(body)).await;
    }
    // A Minecraft cape picked in game goes onto your Minecraft account.
    if let Some(mc) = get("mc") {
        let _ = crate::account::set_cape(http, if mc.is_empty() { None } else { Some(mc) }).await;
    }
    let _ = app.emit("kestrel://me", ());
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    /// Singleplayer world folder to open straight away (quick play agent).
    #[serde(default)]
    pub world: Option<String>,
    /// Zip every world before starting, keeping the last 5 of each.
    #[serde(default)]
    pub backup_worlds: bool,
    pub instance_id: String,
    pub name: String,
    pub version: String,
    pub mode: String,
    pub memory_gb: u32,
    pub java_path: Option<String>,
    pub jvm_args: String,
    pub width: u32,
    pub height: u32,
    pub fullscreen: bool,
    pub server: Option<String>,
    pub optifine: Option<String>,
    #[serde(default)]
    pub offline_name: Option<String>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Stats { cpu: f32, memory_mb: u64 }

/// Plain-English explanations for the most common Minecraft 1.8.9 crashes, with the id of the
/// one-click fix Launch Control offers ("" when there's nothing Kestrel can do itself).
pub fn explain_crash(text: &str) -> Option<(&'static str, &'static str)> {
    let t = text.to_lowercase();
    let rules: [(&[&str], &str, &str); 8] = [
        (&["outofmemoryerror", "java heap space"], "Minecraft ran out of memory. Kestrel can give it more and start again.", "memory"),
        (&["could not reserve enough space", "could not create the java virtual machine", "invalid maximum heap size"], "Java couldn't start with the memory or Java arguments you chose.", "jvm"),
        (&["pixel format not accelerated", "opengl", "no opengl context"], "Your graphics driver couldn't start OpenGL. Update your graphics driver (NVIDIA, AMD or Intel) and try again.", ""),
        (&["unsatisfiedlinkerror", "lwjgl"], "Minecraft's native libraries failed to load. Kestrel can unpack them again.", "natives"),
        (&["unsupportedclassversionerror"], "The Java used is the wrong version for 1.8.9, which needs Java 8.", "java"),
        (&["optifine", "classnotfoundexception"], "OptiFine failed to load. Try without it, or set it up again from Installations → Overview → OptiFine.", "standard"),
        (&["zipexception", "invalid loc header", "corrupt"], "A game file is damaged. Kestrel can check every file and download the broken ones again.", "files"),
        (&["exception in server tick loop", "ticking entity"], "The world crashed while running. Kestrel can back up your worlds before you try again.", "world"),
    ];
    rules.iter().find(|(keys, _, _)| keys.iter().any(|k| t.contains(k))).map(|(_, msg, fix)| (*msg, *fix))
}

/// Seconds played per installation: total, sessions, the last session and the last 30 days
/// (`%APPDATA%\Kestrel\stats.json`).
fn record_session(id: &str, secs: u64) {
    let path = data_dir().join("stats.json");
    let mut all: serde_json::Value = std::fs::read_to_string(&path).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_else(|| serde_json::json!({}));
    let day = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() / 86400).unwrap_or(0);
    let s = &mut all[id];
    s["seconds"] = (s["seconds"].as_u64().unwrap_or(0) + secs).into();
    s["sessions"] = (s["sessions"].as_u64().unwrap_or(0) + 1).into();
    s["longest"] = s["longest"].as_u64().unwrap_or(0).max(secs).into();
    s["last"] = secs.into();
    let mut days: serde_json::Map<String, serde_json::Value> = s["days"].as_object().cloned().unwrap_or_default();
    let key = day.to_string();
    let today = days.get(&key).and_then(|v| v.as_u64()).unwrap_or(0) + secs;
    days.insert(key, today.into());
    days.retain(|k, _| k.parse::<u64>().map(|d| d + 30 >= day).unwrap_or(false));
    s["days"] = serde_json::Value::Object(days);
    let _ = std::fs::write(&path, serde_json::to_string(&all).unwrap_or_default());
}

#[tauri::command]
pub fn play_stats() -> Res<serde_json::Value> {
    let path = data_dir().join("stats.json");
    Ok(std::fs::read_to_string(&path).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_else(|| serde_json::json!({})))
}

/// Launch Control's one-click crash fixes: changes the last launch, tells the main window to keep
/// the change (`kestrel://fix`), and starts again.
#[tauri::command]
pub async fn relaunch_fix(app: AppHandle, state: State<'_, AppState>, fix: String) -> Res<()> {
    let Some(mut req) = state.last_launch.lock().unwrap().clone() else { return Err("Nothing has been launched yet.".into()) };
    req.world = None;
    req.backup_worlds = false;
    let mut keep = serde_json::json!({ "instanceId": req.instance_id });
    match fix.as_str() {
        "standard" => req.mode = "Standard".into(),
        "memory" => { req.memory_gb = (req.memory_gb + 2).clamp(3, 8); keep["memoryGb"] = req.memory_gb.into(); }
        "jvm" => { req.memory_gb = 3; req.jvm_args = String::new(); keep["memoryGb"] = 3.into(); keep["jvmArgs"] = "".into(); }
        "java" => { req.java_path = None; keep["javaPath"] = serde_json::Value::Null; }
        "natives" => { let (_, _, natives) = mojang::version_paths(&req.version); let _ = std::fs::remove_dir_all(natives); }
        "world" => req.backup_worlds = true,
        _ => {} // "files": the launch checks every file anyway
    }
    if keep.as_object().map(|o| o.len() > 1).unwrap_or(false) { let _ = app.emit("kestrel://fix", keep); }
    launch_game(app, state, req).await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRecord { pub file: String, pub title: String, pub time: u64, pub outcome: String, pub status: String }

#[tauri::command]
pub fn list_launches() -> Res<Vec<LaunchRecord>> {
    let dir = logs_dir().join("launches");
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            let file = e.file_name().to_string_lossy().to_string();
            let time = file.trim_end_matches(".log").parse().unwrap_or(0);
            let text = std::fs::read_to_string(e.path()).unwrap_or_default();
            let mut title = String::new();
            let mut outcome = String::from("Unknown");
            let mut status = String::from("idle");
            for l in text.lines() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(l) {
                    if v["kind"] == "reset" { title = v["label"].as_str().unwrap_or("").into(); }
                    if v["kind"] == "state" { outcome = v["detail"].as_str().unwrap_or("").into(); status = v["status"].as_str().unwrap_or("idle").into(); }
                }
            }
            out.push(LaunchRecord { file, title, time, outcome, status });
        }
    }
    out.sort_by(|a, b| b.time.cmp(&a.time));
    Ok(out)
}

#[tauri::command]
pub fn read_launch(file: String) -> Res<Vec<MissionEvent>> {
    let p = logs_dir().join("launches").join(safe_file_name(&file)?);
    let text = std::fs::read_to_string(p).map_err(err("Read launch"))?;
    Ok(text.lines().filter_map(|l| serde_json::from_str::<serde_json::Value>(l).ok()).map(|v| MissionEvent {
        kind: v["kind"].as_str().unwrap_or("log").into(), step: v["step"].as_str().map(String::from), status: v["status"].as_str().map(String::from),
        label: v["label"].as_str().map(String::from), detail: v["detail"].as_str().map(String::from), level: v["level"].as_str().map(String::from),
        line: v["line"].as_str().map(String::from), time: v["time"].as_str().unwrap_or("").into(),
    }).collect())
}

fn quote(s: &str) -> String { if s.contains(' ') { format!("\"{s}\"") } else { s.to_string() } }

#[tauri::command]
pub async fn mission_snapshot(state: State<'_, AppState>) -> Res<Vec<MissionEvent>> {
    Ok(state.mission.lock().unwrap().clone())
}

#[tauri::command]
pub async fn launch_game(app: AppHandle, state: State<'_, AppState>, req: LaunchRequest) -> Res<()> {
    safe_id(&req.instance_id)?;
    if state.game.lock().await.is_some() { return Err("Minecraft is already running from Kestrel.".into()); }
    *state.last_launch.lock().unwrap() = Some(req.clone());
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        let st = app2.state::<AppState>();
        if let Err(e) = run(&app2, st.inner(), req).await {
            m_log(&app2, st.inner(), "error", &e);
            m_state(&app2, st.inner(), "failed", &e);
        }
    });
    Ok(())
}

/// Launches the last request again (from Launch Control after a crash), optionally without OptiFine.
#[tauri::command]
pub async fn relaunch_last(app: AppHandle, state: State<'_, AppState>, standard: bool) -> Res<()> {
    let Some(mut req) = state.last_launch.lock().unwrap().clone() else { return Err("Nothing has been launched yet.".into()) };
    if standard { req.mode = "Standard".into(); }
    req.world = None;
    req.backup_worlds = false;
    launch_game(app, state, req).await
}

const AGENT: &[u8] = include_bytes!("../agent/kestrel-agent.jar");
/// Kestrel Core, the in-game mod (main menu, Right Shift panel, HUD mods). Source in core/.
pub(crate) const CORE: &[u8] = include_bytes!("../core/kestrel-core.jar");

/// Writes a bundled jar to Kestrel's tools folder (only when it changed) and returns its path.
pub(crate) fn tool_jar(name: &str, bytes: &[u8]) -> Res<PathBuf> {
    let path = data_dir().join("tools").join(name);
    std::fs::create_dir_all(path.parent().unwrap()).map_err(err("Kestrel tools"))?;
    if std::fs::read(&path).map(|b| b != bytes).unwrap_or(true) { std::fs::write(&path, bytes).map_err(err("Kestrel tools"))?; }
    Ok(path)
}

async fn run(app: &AppHandle, st: &AppState, req: LaunchRequest) -> Res<()> {
    m_reset(app, st, &format!("{} · Minecraft {}", req.name, req.version));
    for (id, label) in [("java", "Java runtime"), ("files", "Game files"), ("mode", "Launch mode"), ("account", "Account"), ("start", "Start Minecraft")] {
        m_step(app, st, id, "pending", label, "");
    }
    m_state(app, st, "preparing", "Getting everything ready");
    m_log(app, st, "info", &format!("Preparing {} (Minecraft {}, {}, {} GB)", req.name, req.version, req.mode, req.memory_gb));
    let game_dir = ensure_instance(&req.instance_id)?;
    m_log(app, st, "info", &format!("Game folder: {}", game_dir.display()));
    // Capes that can't be fetched never stop the launch.
    match write_cosmetics(&st.http, &game_dir).await {
        Ok(n) if n > 0 => m_log(app, st, "info", &format!("Kestrel capes ready: {n}")),
        Ok(_) => {}
        Err(e) => m_log(app, st, "warn", &format!("Capes not loaded: {e}")),
    }
    // Where Kestrel Core finds the public parts of the service (who uses Kestrel, their capes).
    let _ = std::fs::write(game_dir.join("kestrel").join("service.properties"), format!("url={}\n", crate::config::SERVICE_URL));
    write_friends(&st.http, &game_dir).await;

    // 1. Java
    m_step(app, st, "java", "running", "Java runtime", "Looking for Java 8");
    let java_path: PathBuf = if let Some(p) = req.java_path.clone().filter(|p| PathBuf::from(p).is_file()) {
        PathBuf::from(p)
    } else if java::managed_java("jre-legacy").is_file() {
        java::managed_java("jre-legacy")
    } else {
        let found = tokio::task::spawn_blocking(java::detect_blocking).await.unwrap_or_default();
        match found.into_iter().find(|j| j.major == 8 && j.arch.contains("64")) {
            Some(j) => { m_log(app, st, "info", &format!("Using Java {} from {} ({})", j.version, j.source, j.path)); PathBuf::from(j.path) }
            None => {
                m_log(app, st, "info", "No 64-bit Java 8 found. Downloading Mojang's Java 8 runtime.");
                let a = app.clone();
                java::install_runtime(app, st, "jre-legacy", &move |l| { let s = a.state::<AppState>(); m_log(&a, s.inner(), "info", l); }).await?
            }
        }
    };
    m_step(app, st, "java", "done", "Java runtime", &java_path.to_string_lossy());

    // 2. Game files
    m_step(app, st, "files", "running", "Game files", "Checking Minecraft files");
    let a = app.clone();
    let plan = mojang::install(app, st, &req.version, &move |l| { let s = a.state::<AppState>(); m_log(&a, s.inner(), "info", l); }).await
        .map_err(|e| { m_step(app, st, "files", "failed", "Game files", &e); e })?;
    m_step(app, st, "files", "done", "Game files", &format!("{} files verified", plan.items.len()));

    // 3. Launch mode
    let mut overlay = None;
    if req.mode == "OptiFine" {
        overlay = req.optifine.as_deref().and_then(crate::import::optifine_overlay);
        match (&overlay, &req.optifine) {
            (Some(_), Some(id)) => { m_step(app, st, "mode", "done", "Launch mode", id); m_log(app, st, "info", &format!("Using {id}")); }
            _ => {
                m_step(app, st, "mode", "skipped", "Launch mode", "OptiFine isn't set up for this installation. Set it up in Installations → Overview → OptiFine. Standard will be used.");
                m_log(app, st, "warn", "OptiFine isn't set up for this installation yet. Continuing with Standard Minecraft.");
            }
        }
    } else {
        m_step(app, st, "mode", "done", "Launch mode", "Standard");
    }

    // Build the command line (same for every account).
    let v = mojang::version_json(&st.http, &req.version).await?;
    let (_, _, natives) = mojang::version_paths(&req.version);
    let mut classpath = plan.classpath.clone();
    if let Some((extra, _, _)) = &overlay { let mut c = extra.clone(); c.extend(classpath); classpath = c; }
    let cp = classpath.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<_>>().join(";");
    let main_class = overlay.as_ref().map(|o| o.1.clone()).unwrap_or_else(|| v["mainClass"].as_str().unwrap_or("net.minecraft.client.main.Main").to_string());
    let mut jvm: Vec<String> = vec![
        format!("-Xmx{}G", req.memory_gb.clamp(1, 64)),
        "-Xms512M".into(),
        format!("-Djava.library.path={}", natives.display()),
        "-Dminecraft.launcher.brand=kestrel".into(),
        format!("-Dminecraft.launcher.version={}", env!("CARGO_PKG_VERSION")),
    ];
    jvm.extend(req.jvm_args.split_whitespace().filter(|a| a.starts_with("-X") || a.starts_with("-D")).map(String::from));
    // Kestrel Core goes into every 1.8.9 launch (it hooks 1.8.9's own class names).
    if req.version == "1.8.9" {
        let path = tool_jar("kestrel-core.jar", CORE)?;
        jvm.push(format!("-javaagent:{}", path.display()));
        jvm.push(format!("-Dkestrel.version={}", env!("CARGO_PKG_VERSION")));
        m_log(app, st, "info", "Adding Kestrel Core (Right Shift opens your mods)");
    }
    // Open a singleplayer world straight away (1.8.9 has no built-in option for this).
    if let Some(world) = req.world.as_deref().filter(|w| !w.is_empty()) {
        let folder = safe_file_name(world)?.to_string();
        if game_dir.join("saves").join(&folder).join("level.dat").is_file() {
            let path = tool_jar("kestrel-agent.jar", AGENT)?;
            use base64::Engine;
            jvm.push(format!("-javaagent:{}={}", path.display(), base64::engine::general_purpose::STANDARD.encode(folder.as_bytes())));
            m_log(app, st, "info", &format!("Will open the world \"{folder}\" after starting"));
        } else {
            m_log(app, st, "warn", &format!("The world \"{folder}\" wasn't found, so the game will open on the title screen."));
        }
    }
    // Back up worlds first (setting), keeping the last 5 of each.
    if req.backup_worlds {
        let id = req.instance_id.clone();
        let done = tokio::task::spawn_blocking(move || {
            let mut n = 0; for w in crate::content::world_folders(&id) { if crate::content::backup_blocking(&id, &w, Some(5)).is_ok() { n += 1; } } n
        }).await.unwrap_or(0);
        if done > 0 { m_log(app, st, "info", &format!("Backed up {done} world{} before starting", if done == 1 { "" } else { "s" })); }
    }

    // 4. Account: Microsoft if signed in, otherwise offline (singleplayer only).
    m_step(app, st, "account", "running", "Account", "Checking sign-in");
    let signed_in = match crate::account::for_launch(&st.http).await {
        Ok(a) => a,
        Err(e) => { m_log(app, st, "warn", &format!("Microsoft sign-in: {e}")); None }
    };
    let offline = signed_in.is_none();
    let (user, uuid, token) = match signed_in {
        Some(a) => { m_step(app, st, "account", "done", "Account", &format!("{} (Microsoft)", a.0)); a }
        None if crate::config::REQUIRE_OWNED_ACCOUNT && !crate::account::owner_verified() => {
            m_step(app, st, "account", "failed", "Account", "Sign in with Microsoft once to play. Kestrel needs to check you own Minecraft: Java Edition.");
            m_step(app, st, "start", "skipped", "Start Minecraft", "Waiting for sign-in");
            m_log(app, st, "warn", "Stopped: sign in with a Microsoft account that owns Minecraft once on this PC. After that, singleplayer also works offline.");
            m_state(app, st, "blocked", "Sign-in needed");
            return Ok(());
        }
        None => {
            let name = req.offline_name.clone().filter(|n| crate::account::valid_offline_name(n)).unwrap_or_else(|| "Player".into());
            m_step(app, st, "account", "skipped", "Account", &format!("Offline as {name}. Singleplayer works; online servers like Hypixel need Microsoft sign-in."));
            m_log(app, st, "warn", &format!("Not signed in with Microsoft. Playing offline as {name}: singleplayer only."));
            if req.server.is_some() { m_log(app, st, "warn", "Online servers refuse offline players, so joining the server will likely fail."); }
            let u = crate::account::offline_uuid(&name);
            (name, u, "0".to_string())
        }
    };
    let mut game_args: Vec<String> = Vec::new();
    let base_template = v["minecraftArguments"].as_str().unwrap_or("").to_string();
    let template = overlay.as_ref().map(|o| o.2.clone()).unwrap_or(base_template);
    for a in template.split_whitespace() {
        game_args.push(match a {
            "${auth_player_name}" => user.clone(),
            "${version_name}" => req.version.clone(),
            "${game_directory}" => game_dir.to_string_lossy().to_string(),
            "${assets_root}" => assets_dir().to_string_lossy().to_string(),
            "${assets_index_name}" => plan.asset_index.clone(),
            "${auth_uuid}" => uuid.clone(),
            "${auth_access_token}" => token.clone(),
            "${user_properties}" => "{}".into(),
            "${user_type}" => (if offline { "legacy" } else { "msa" }).into(),
            other => other.to_string(),
        });
    }
    if req.fullscreen { game_args.push("--fullscreen".into()); } else { game_args.extend(["--width".into(), req.width.to_string(), "--height".into(), req.height.to_string()]); }
    if let Some(addr) = req.server.as_deref().map(str::trim).filter(|a| !a.is_empty()) {
        let (host, port) = match addr.rsplit_once(':') { Some((h, p)) if p.chars().all(|c| c.is_ascii_digit()) => (h, p), _ => (addr, "25565") };
        if host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
            game_args.extend(["--server".into(), host.to_string(), "--port".into(), port.to_string()]);
            m_log(app, st, "info", &format!("Will join {host}:{port} after starting"));
        }
    }
    let printable = format!("{} {} -cp <{} files> {} {}", quote(&java_path.to_string_lossy()), jvm.join(" "), classpath.len(), main_class,
        game_args.iter().map(|a| if !offline && a == &token { "<hidden>".to_string() } else { quote(a) }).collect::<Vec<_>>().join(" "));
    m_log(app, st, "info", &format!("Launch command: {printable}"));

    // 5. Start
    m_step(app, st, "start", "running", "Start Minecraft", "Starting Java");
    let mut cmd = tokio::process::Command::new(&java_path);
    cmd.args(&jvm).arg("-cp").arg(&cp).arg(&main_class).args(&game_args)
        .current_dir(&game_dir).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(false);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    let mut child = cmd.spawn().map_err(err("Start Java"))?;
    let pid = child.id().unwrap_or(0);
    for (stream, level) in [(child.stdout.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>), "game"), (child.stderr.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>), "game")] {
        if let Some(s) = stream {
            let a = app.clone();
            let tok = if offline { None } else { Some(token.clone()) };
            let (inst_id, ver) = (req.instance_id.clone(), req.version.clone());
            tauri::async_runtime::spawn(async move {
                // Read raw bytes: Java 8 on Windows writes its console in the ANSI code page (e.g. "§" in chat),
                // and a strict UTF-8 reader would stop at the first such line, leaving the game's output pipe
                // full (which can freeze Minecraft).
                let mut reader = BufReader::new(s);
                let mut buf = Vec::new();
                loop {
                    buf.clear();
                    match reader.read_until(b'\n', &mut buf).await { Ok(0) | Err(_) => break, Ok(_) => {} }
                    while matches!(buf.last(), Some(b'\n' | b'\r')) { buf.pop(); }
                    let l = match String::from_utf8(buf.clone()) { Ok(s) => s, Err(_) => buf.iter().map(|&b| b as char).collect() };
                    let l = match &tok { Some(t) => l.replace(t, "<hidden>"), None => l };
                    let lvl = if l.contains("/ERROR]") || l.contains("Exception") { "error" } else if l.contains("/WARN]") { "warn" } else { level };
                    let s = a.state::<AppState>();
                    // Where the player is, for Discord.
                    if let Some(rest) = l.split("Connecting to ").nth(1) {
                        let host = rest.split(',').next().unwrap_or("").trim().to_string();
                        if !host.is_empty() {
                            let _ = a.emit("kestrel://joined", serde_json::json!({ "host": host, "instanceId": inst_id, "version": ver }));
                            s.discord.place(Place::Server(host));
                        }
                    } else if l.contains("Starting integrated minecraft server") {
                        s.discord.place(Place::Singleplayer);
                    } else if l.contains("Stopping singleplayer server") || l.contains("[Client thread/INFO]: Stopping!") {
                        s.discord.place(Place::Menus);
                    }
                    m_log(&a, s.inner(), lvl, &l);
                }
            });
        }
    }
    m_step(app, st, "start", "done", "Start Minecraft", &format!("Process {pid}"));
    m_state(app, st, "running", &format!("Minecraft is running (process {pid}){}", if offline { " · offline" } else { "" }));
    st.discord.game(Some(GameInfo { version: req.version.clone(), mode: format!("{} · {}", req.version, if overlay.is_some() { "OptiFine" } else { "Standard" }), place: Place::Menus, start_ms: now_ms() }));
    *st.game.lock().await = Some(GameProcess { child, instance_id: req.instance_id.clone() });
    // Watch the process: live CPU / memory, then explain the exit.
    let a = app.clone();
    let crash_dir = game_dir.join("crash-reports");
    let (started, inst_id, gdir) = (std::time::Instant::now(), req.instance_id.clone(), game_dir.clone());
    tauri::async_runtime::spawn(async move {
        let mut sys = sysinfo::System::new();
        let spid = sysinfo::Pid::from_u32(pid);
        let mut ticks = 0u32;
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
            ticks += 1;
            if ticks % 30 == 0 { write_friends(&a.state::<AppState>().http, &gdir).await; }
            sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[spid]), true);
            if let Some(p) = sys.process(spid) {
                let _ = a.emit("kestrel://stats", Stats { cpu: p.cpu_usage(), memory_mb: p.memory() / 1_048_576 });
            }
            let s = a.state::<AppState>();
            let mut g = s.game.lock().await;
            let Some(p) = g.as_mut() else {
                // Stopped from Launch Control.
                record_session(&inst_id, started.elapsed().as_secs());
                drop(g);
                send_cape_choice(&a, &s.http, &gdir).await;
                break;
            };
            if let Ok(Some(status)) = p.child.try_wait() {
                let code = status.code().unwrap_or(-1);
                *g = None;
                drop(g);
                s.discord.game(None);
                record_session(&inst_id, started.elapsed().as_secs());
                send_cape_choice(&a, &s.http, &gdir).await;
                if code == 0 {
                    m_log(&a, s.inner(), "info", "Minecraft closed normally.");
                    m_state(&a, s.inner(), "exited", "Closed normally");
                } else {
                    m_log(&a, s.inner(), "error", &format!("Minecraft exited with code {code}"));
                    let recent: String = s.mission.lock().unwrap().iter().rev().take(400).filter_map(|e| e.line.clone()).collect::<Vec<_>>().join("\n");
                    let report = std::fs::read_dir(&crash_dir).ok().and_then(|rd| rd.flatten().max_by_key(|e| e.metadata().and_then(|m| m.modified()).ok()))
                        .and_then(|e| std::fs::read_to_string(e.path()).ok()).unwrap_or_default();
                    let (why, fix) = explain_crash(&format!("{recent}\n{report}")).unwrap_or(("Minecraft stopped unexpectedly. The console above shows the last messages it printed.", ""));
                    m_log(&a, s.inner(), "warn", &format!("What happened: {why}"));
                    m_state_fix(&a, s.inner(), "crashed", why, fix);
                }
                break;
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn stop_game(app: AppHandle, state: State<'_, AppState>) -> Res<()> {
    let mut g = state.game.lock().await;
    if let Some(p) = g.as_mut() {
        p.child.kill().await.map_err(err("Stop Minecraft"))?;
        *g = None;
        drop(g);
        state.discord.game(None);
        m_log(&app, state.inner(), "warn", "Stopped by you.");
        m_state(&app, state.inner(), "exited", "Stopped");
    }
    Ok(())
}
