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

/// Plain-English explanations for the most common Minecraft 1.8.9 crashes.
pub fn explain_crash(text: &str) -> Option<&'static str> {
    let t = text.to_lowercase();
    let rules: [(&[&str], &str); 8] = [
        (&["outofmemoryerror", "java heap space"], "Minecraft ran out of memory. Raise Memory in this installation's Settings (2–4 GB suits 1.8.9)."),
        (&["could not reserve enough space", "could not create the java virtual machine", "invalid maximum heap size"], "Java couldn't start with the memory you chose. Lower Memory, or check your Java arguments."),
        (&["pixel format not accelerated", "opengl", "no opengl context"], "Your graphics driver couldn't start OpenGL. Update your NVIDIA graphics driver and try again."),
        (&["unsatisfiedlinkerror", "lwjgl"], "Minecraft's native libraries failed to load. Kestrel will re-check them next launch; if it repeats, delete versions\\1.8.9\\natives in Kestrel's folder."),
        (&["unsupportedclassversionerror"], "A file needs a newer Java than the one used. 1.8.9 needs Java 8; set Java to Automatic."),
        (&["optifine", "classnotfoundexception"], "OptiFine failed to load. Re-import it from Installations → Overview → OptiFine, or switch the launch mode to Standard."),
        (&["zipexception", "invalid loc header", "corrupt"], "A game file is damaged. Launch again and Kestrel will re-download anything that fails its check."),
        (&["exception in server tick loop", "ticking entity"], "The world crashed while running. Back up the world from the Worlds tab before trying again."),
    ];
    rules.iter().find(|(keys, _)| keys.iter().any(|k| t.contains(k))).map(|(_, msg)| *msg)
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

async fn run(app: &AppHandle, st: &AppState, req: LaunchRequest) -> Res<()> {
    m_reset(app, st, &format!("{} · Minecraft {}", req.name, req.version));
    for (id, label) in [("java", "Java runtime"), ("files", "Game files"), ("mode", "Launch mode"), ("account", "Account"), ("start", "Start Minecraft")] {
        m_step(app, st, id, "pending", label, "");
    }
    m_state(app, st, "preparing", "Getting everything ready");
    m_log(app, st, "info", &format!("Preparing {} (Minecraft {}, {}, {} GB)", req.name, req.version, req.mode, req.memory_gb));
    let game_dir = ensure_instance(&req.instance_id)?;
    m_log(app, st, "info", &format!("Game folder: {}", game_dir.display()));

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
        "-Dminecraft.launcher.version=0.1.0".into(),
    ];
    jvm.extend(req.jvm_args.split_whitespace().filter(|a| a.starts_with("-X") || a.starts_with("-D")).map(String::from));
    // Open a singleplayer world straight away (1.8.9 has no built-in option for this).
    if let Some(world) = req.world.as_deref().filter(|w| !w.is_empty()) {
        let folder = safe_file_name(world)?.to_string();
        if game_dir.join("saves").join(&folder).join("level.dat").is_file() {
            let path = data_dir().join("tools").join("kestrel-agent.jar");
            std::fs::create_dir_all(path.parent().unwrap()).map_err(err("Quick play"))?;
            if std::fs::read(&path).map(|b| b != AGENT).unwrap_or(true) { std::fs::write(&path, AGENT).map_err(err("Quick play"))?; }
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
                let mut lines = BufReader::new(s).lines();
                while let Ok(Some(l)) = lines.next_line().await {
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
    tauri::async_runtime::spawn(async move {
        let mut sys = sysinfo::System::new();
        let spid = sysinfo::Pid::from_u32(pid);
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
            sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[spid]), true);
            if let Some(p) = sys.process(spid) {
                let _ = a.emit("kestrel://stats", Stats { cpu: p.cpu_usage(), memory_mb: p.memory() / 1_048_576 });
            }
            let s = a.state::<AppState>();
            let mut g = s.game.lock().await;
            let Some(p) = g.as_mut() else { break };
            if let Ok(Some(status)) = p.child.try_wait() {
                let code = status.code().unwrap_or(-1);
                *g = None;
                drop(g);
                s.discord.game(None);
                if code == 0 {
                    m_log(&a, s.inner(), "info", "Minecraft closed normally.");
                    m_state(&a, s.inner(), "exited", "Closed normally");
                } else {
                    m_log(&a, s.inner(), "error", &format!("Minecraft exited with code {code}"));
                    let recent: String = s.mission.lock().unwrap().iter().rev().take(400).filter_map(|e| e.line.clone()).collect::<Vec<_>>().join("\n");
                    let report = std::fs::read_dir(&crash_dir).ok().and_then(|rd| rd.flatten().max_by_key(|e| e.metadata().and_then(|m| m.modified()).ok()))
                        .and_then(|e| std::fs::read_to_string(e.path()).ok()).unwrap_or_default();
                    let why = explain_crash(&format!("{recent}\n{report}")).unwrap_or("Minecraft stopped unexpectedly. The console above shows the last messages it printed.");
                    m_log(&a, s.inner(), "warn", &format!("What happened: {why}"));
                    m_state(&a, s.inner(), "crashed", why);
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
