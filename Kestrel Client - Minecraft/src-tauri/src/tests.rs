//! Live checks against the real services (network required): `cargo test -- --nocapture`

use crate::core::AppState;
use crate::download::download_all;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

fn http() -> reqwest::Client { AppState::new().http }

#[tokio::test]
async fn mojang_1_8_9_plan_and_client_download() {
    let h = http();
    let v = crate::mojang::version_json(&h, "1.8.9").await.expect("version json");
    assert_eq!(v["id"], "1.8.9");
    let p = crate::mojang::plan(&h, &v, "1.8.9").await.expect("plan");
    let libs = p.classpath.iter().filter(|c| c.to_string_lossy().contains("lwjgl")).count();
    let assets = p.items.iter().filter(|i| i.url.contains("resources.download.minecraft.net")).count();
    println!("1.8.9: {} files total, {} classpath entries ({} lwjgl), {} natives, {} assets, asset index {}", p.items.len(), p.classpath.len(), libs, p.natives.len(), assets, p.asset_index);
    assert!(libs > 0 && !p.natives.is_empty() && assets > 500);
    // Download just the client jar to a temp folder and verify its sha1.
    let mut client = p.items[0].clone();
    client.path = std::env::temp_dir().join("kestrel-test-1.8.9.jar");
    let _ = std::fs::remove_file(&client.path);
    download_all(&h, vec![client.clone()], 1, Arc::new(AtomicBool::new(false)), |_, _, _| {}).await.expect("client download");
    let size = std::fs::metadata(&client.path).unwrap().len();
    println!("client jar downloaded and sha1-verified: {size} bytes");
    let _ = std::fs::remove_file(&client.path);
}

#[tokio::test]
async fn java_runtime_index_has_jre_legacy() {
    let idx: serde_json::Value = http().get(crate::java::RUNTIME_INDEX).send().await.unwrap().json().await.unwrap();
    let e = &idx["windows-x64"]["jre-legacy"][0];
    println!("jre-legacy for windows-x64: {}", e["version"]["name"]);
    assert!(e["manifest"]["url"].is_string());
}

#[tokio::test]
async fn detects_java() {
    let j = tokio::task::spawn_blocking(crate::java::detect_blocking).await.unwrap();
    for x in &j { println!("Java {} (major {}, {}) from {}: {}", x.version, x.major, x.arch, x.source, x.path); }
}

#[tokio::test]
async fn pings_hypixel() {
    let s = crate::servers::ping_inner("mc.hypixel.net", 25565).await.expect("ping");
    println!("Hypixel: {:?}/{:?} players, {:?} ms, version {:?}, motd {:?}, favicon {}", s.players_online, s.players_max, s.ping_ms, s.version, s.motd, s.favicon.is_some());
    assert!(s.online);
}

#[tokio::test]
async fn modrinth_search_resourcepacks_1_8_9() {
    let r: serde_json::Value = http().get("https://api.modrinth.com/v2/search")
        .query(&[("facets", r#"[["project_type:resourcepack"],["versions:1.8.9"]]"#), ("index", "downloads"), ("limit", "5")])
        .send().await.unwrap().json().await.unwrap();
    for h in r["hits"].as_array().unwrap() { println!("{} by {} ({} downloads)", h["title"], h["author"], h["downloads"]); }
    assert!(r["total_hits"].as_u64().unwrap() > 0);
}

#[test]
fn reads_dot_minecraft() {
    let mc = crate::import::dot_minecraft();
    let servers = crate::import::read_servers(&mc.join("servers.dat"));
    println!("servers.dat: {} servers", servers.len());
    for s in servers.iter().take(8) { println!("  {} — {}", s.name, s.address); }
    let scan = crate::import::import_scan().unwrap();
    println!("options.txt: {}, {} resource packs, {} shader packs, OptiFine: {:?}", scan.options, scan.resourcepacks.len(), scan.shaderpacks.len(), scan.optifine);
    for p in scan.resourcepacks.iter().take(4) { println!("  pack: {}", p.name); }
    if let Ok(rd) = std::fs::read_dir(mc.join("saves")) {
        for e in rd.flatten().take(5) {
            if let Ok(b) = std::fs::read(e.path().join("level.dat")) {
                let t = crate::nbt::parse_gzip(&b).expect("level.dat");
                let d = t.get("Data").unwrap();
                println!("  world {:?}: LevelName={:?} LastPlayed={:?}", e.file_name(), d.get("LevelName").and_then(|n| n.str()), d.get("LastPlayed").and_then(|n| n.long()));
            }
        }
    }
}

#[test]
fn crash_explanations_and_names() {
    assert_eq!(crate::launch::explain_crash("java.lang.OutOfMemoryError: Java heap space").unwrap().1, "memory");
    assert!(crate::launch::explain_crash("org.lwjgl.LWJGLException: Pixel format not accelerated").unwrap().0.contains("graphics"));
    assert!(crate::launch::explain_crash("all fine").is_none());
    assert_eq!(crate::import::clean_name("!     §3azura §8[§f16x§8].zip"), "azura [16x]");
    assert_eq!(crate::import::maven_path("optifine:OptiFine:1.8.9_HD_U_M5").unwrap(), "optifine/OptiFine/1.8.9_HD_U_M5/OptiFine-1.8.9_HD_U_M5.jar");
}

#[test]
fn offline_accounts_and_saved_sign_in() {
    // Same UUID vanilla Minecraft gives an offline "Notch".
    assert_eq!(crate::account::offline_uuid("Notch"), "b50ad385829d3141a2167e7d7539ba7f");
    assert!(crate::account::valid_offline_name("Turtles_1"));
    assert!(!crate::account::valid_offline_name("no spaces"));
    let secret = b"refresh-token-example";
    let enc = crate::account::dpapi(secret, true).expect("protect");
    assert_ne!(enc.as_slice(), secret);
    assert_eq!(crate::account::dpapi(&enc, false).expect("unprotect"), secret);
}

/// Starts real Minecraft 1.8.9 (offline) with the quick play agent and checks the world opens.
/// Needs the game already downloaded and a world in KESTREL_TEST_WORLD (folder path). `cargo test quick_play -- --ignored --nocapture`
#[tokio::test]
#[ignore]
async fn quick_play_opens_world() {
    use std::io::{BufRead, BufReader};
    let world = std::path::PathBuf::from(std::env::var("KESTREL_TEST_WORLD").expect("set KESTREL_TEST_WORLD"));
    let game = std::env::temp_dir().join("kestrel-quickplay-test");
    let _ = std::fs::remove_dir_all(&game);
    let name = world.file_name().unwrap().to_string_lossy().to_string();
    copy_dir(&world, &game.join("saves").join(&name));
    let h = http();
    let v = crate::mojang::version_json(&h, "1.8.9").await.unwrap();
    let p = crate::mojang::plan(&h, &v, "1.8.9").await.unwrap();
    let (_, _, natives) = crate::mojang::version_paths("1.8.9");
    let agent = std::env::temp_dir().join("kestrel-agent-test.jar");
    std::fs::write(&agent, include_bytes!("../agent/kestrel-agent.jar")).unwrap();
    use base64::Engine;
    let cp = p.classpath.iter().map(|c| c.to_string_lossy().to_string()).collect::<Vec<_>>().join(";");
    let mut child = std::process::Command::new(crate::java::managed_java("jre-legacy").with_file_name("java.exe"))
        .arg("-Xmx2G").arg(format!("-Djava.library.path={}", natives.display()))
        .arg(format!("-javaagent:{}={}", agent.display(), base64::engine::general_purpose::STANDARD.encode(name.as_bytes())))
        .arg("-cp").arg(cp).arg("net.minecraft.client.main.Main")
        .args(["--username", "Player", "--version", "1.8.9", "--gameDir"]).arg(&game)
        .arg("--assetsDir").arg(crate::core::assets_dir()).args(["--assetIndex", &p.asset_index, "--uuid", "0", "--accessToken", "0", "--userProperties", "{}", "--userType", "legacy"])
        .stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null()).spawn().expect("start java");
    let out = child.stdout.take().unwrap();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || { for l in BufReader::new(out).lines().map_while(Result::ok) { let _ = tx.send(l); } });
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(150);
    let (mut opening, mut loaded) = (false, false);
    while std::time::Instant::now() < deadline && !loaded {
        if let Ok(l) = rx.recv_timeout(std::time::Duration::from_secs(1)) {
            if l.contains("[Kestrel]") || l.contains("integrated") || l.contains("joined the game") { println!("{l}"); }
            if l.contains("[Kestrel] opening world") { opening = true; }
            if l.contains("joined the game") { loaded = true; }
        }
    }
    let _ = child.kill();
    let _ = std::fs::remove_dir_all(&game);
    assert!(opening, "agent never saw the title screen");
    assert!(loaded, "world never loaded");
}

fn copy_dir(from: &std::path::Path, to: &std::path::Path) {
    std::fs::create_dir_all(to).unwrap();
    for e in std::fs::read_dir(from).unwrap().flatten() {
        let p = e.path();
        if p.is_dir() { copy_dir(&p, &to.join(e.file_name())); } else { std::fs::copy(&p, to.join(e.file_name())).unwrap(); }
    }
}

#[test]
fn library_rules_for_windows() {
    let allow_all = serde_json::json!({"rules":[{"action":"allow"},{"action":"disallow","os":{"name":"osx"}}]});
    let mac_only = serde_json::json!({"rules":[{"action":"allow","os":{"name":"osx"}}]});
    assert!(crate::mojang::allowed(&allow_all));
    assert!(!crate::mojang::allowed(&mac_only));
    assert_eq!(crate::java::major_of("1.8.0_51"), 8);
    assert_eq!(crate::java::major_of("17.0.2"), 17);
}
