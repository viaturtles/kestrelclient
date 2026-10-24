//! Microsoft sign-in for Minecraft: browser sign-in (auth code + PKCE on a
//! loopback port), then Xbox Live, XSTS and Minecraft services. The saved
//! account is encrypted with Windows DPAPI and tokens are never logged.

use crate::core::{data_dir, err, write_log, AppState, Res};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::Digest;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const AUTHORIZE: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const TOKEN: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const SCOPE: &str = "XboxLive.signin offline_access";

#[derive(Serialize, Deserialize, Clone)]
struct Saved { name: String, uuid: String, refresh_token: String, mc_token: String, mc_expires: u64 }

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AccountInfo { pub name: String, pub uuid: String }

fn now() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) }
fn b64(b: &[u8]) -> String { base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(b) }
fn random(n: usize) -> String { let mut b = vec![0u8; n]; getrandom::getrandom(&mut b).expect("random"); b64(&b) }
fn file() -> std::path::PathBuf { data_dir().join("account.dat") }

// ---------------- Storage (DPAPI: only this Windows user can read it) ----------------

#[cfg(windows)]
pub(crate) fn dpapi(data: &[u8], encrypt: bool) -> Option<Vec<u8>> {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::*;
    let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
    let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
    let ok = unsafe {
        if encrypt { CryptProtectData(&input, std::ptr::null(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out) }
        else { CryptUnprotectData(&input, std::ptr::null_mut(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out) }
    };
    if ok == 0 || out.pbData.is_null() { return None; }
    let v = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec() };
    unsafe { LocalFree(out.pbData as _) };
    Some(v)
}
#[cfg(not(windows))]
fn dpapi(data: &[u8], _: bool) -> Option<Vec<u8>> { Some(data.to_vec()) }

/// Remembers (encrypted) that this PC has signed in with an account that owns Minecraft.
/// Kept after sign-out, so owners can still play singleplayer offline.
fn mark_owner(name: &str, uuid: &str) {
    if let Some(enc) = dpapi(serde_json::json!({ "name": name, "uuid": uuid }).to_string().as_bytes(), true) {
        let _ = std::fs::write(data_dir().join("owner.dat"), enc);
    }
}
pub fn owner_verified() -> bool {
    std::fs::read(data_dir().join("owner.dat")).ok().and_then(|b| dpapi(&b, false))
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok()).map(|v| v["uuid"].as_str().is_some_and(|u| u.len() >= 32)).unwrap_or(false)
}

fn load() -> Option<Saved> { serde_json::from_slice(&dpapi(&std::fs::read(file()).ok()?, false)?).ok() }
fn save(s: &Saved) -> Res<()> {
    let enc = dpapi(&serde_json::to_vec(s).unwrap(), true).ok_or("Couldn't protect the saved sign-in")?;
    std::fs::create_dir_all(data_dir()).map_err(err("Save account"))?;
    std::fs::write(file(), enc).map_err(err("Save account"))
}

// ---------------- Token chain ----------------

fn client_id() -> Res<String> {
    let id = crate::config::load().microsoft_client_id;
    if id.is_empty() { return Err("Microsoft sign-in isn't set up in this build of Kestrel yet. You can still play singleplayer offline.".into()); }
    Ok(id)
}

async fn ms_token(http: &reqwest::Client, form: &[(&str, &str)]) -> Res<(String, String)> {
    let r = http.post(TOKEN).form(form).send().await.map_err(err("Microsoft sign-in"))?;
    let v: Value = r.json().await.map_err(err("Microsoft sign-in"))?;
    match (v["access_token"].as_str(), v["refresh_token"].as_str()) {
        (Some(a), Some(r)) => Ok((a.to_string(), r.to_string())),
        _ => Err(match v["error"].as_str() {
            Some("invalid_grant") => "Your Microsoft sign-in expired. Sign in again.".to_string(),
            Some("unauthorized_client") | Some("invalid_client") => "Microsoft rejected Kestrel's app registration. Check the client ID in config.rs and that \"Allow public client flows\" is on in Azure.".to_string(),
            _ => format!("Microsoft sign-in failed: {}", v["error_description"].as_str().unwrap_or("unknown error").lines().next().unwrap_or("")),
        }),
    }
}

/// Microsoft access token -> (Minecraft name, uuid, Minecraft token, expires at).
async fn minecraft_from_ms(http: &reqwest::Client, ms: &str) -> Res<(String, String, String, u64)> {
    let xbl: Value = http.post("https://user.auth.xboxlive.com/user/authenticate")
        .json(&json!({ "Properties": { "AuthMethod": "RPS", "SiteName": "user.auth.xboxlive.com", "RpsTicket": format!("d={ms}") }, "RelyingParty": "http://auth.xboxlive.com", "TokenType": "JWT" }))
        .send().await.map_err(err("Xbox Live"))?.json().await.map_err(|_| "Xbox Live didn't accept the sign-in".to_string())?;
    let xbl_token = xbl["Token"].as_str().ok_or("Xbox Live didn't accept the sign-in")?;
    let uhs = xbl["DisplayClaims"]["xui"][0]["uhs"].as_str().ok_or("Xbox Live didn't return a user")?;

    let xsts: Value = http.post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .json(&json!({ "Properties": { "SandboxId": "RETAIL", "UserTokens": [xbl_token] }, "RelyingParty": "rp://api.minecraftservices.com/", "TokenType": "JWT" }))
        .send().await.map_err(err("Xbox Live"))?.json().await.map_err(err("Xbox Live"))?;
    let Some(xsts_token) = xsts["Token"].as_str() else {
        return Err(match xsts["XErr"].as_u64() {
            Some(2148916233) => "This Microsoft account doesn't have an Xbox profile yet. Sign in once at minecraft.net or xbox.com, then try again.".into(),
            Some(2148916235) => "Xbox Live isn't available in this account's country.".into(),
            Some(2148916236) | Some(2148916237) => "This account needs adult verification on xbox.com first.".into(),
            Some(2148916238) => "This is a child account. An adult needs to add it to a Microsoft Family group first.".into(),
            _ => "Xbox Live refused the sign-in.".into(),
        });
    };

    let r = http.post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&json!({ "identityToken": format!("XBL3.0 x={uhs};{xsts_token}") })).send().await.map_err(err("Minecraft services"))?;
    if r.status().as_u16() == 403 {
        return Err("Waiting for Mojang to approve Kestrel. Microsoft sign-in worked, but Minecraft only accepts launchers Mojang has approved (aka.ms/mce-reviewappid).".into());
    }
    if !r.status().is_success() { return Err(format!("Minecraft services returned {}", r.status().as_u16())); }
    let mc: Value = r.json().await.map_err(err("Minecraft services"))?;
    let token = mc["access_token"].as_str().ok_or("Minecraft services didn't return a token")?.to_string();
    let expires = now() + mc["expires_in"].as_u64().unwrap_or(86400).saturating_sub(300);

    let p = http.get("https://api.minecraftservices.com/minecraft/profile").bearer_auth(&token).send().await.map_err(err("Minecraft profile"))?;
    if p.status().as_u16() == 404 {
        return Err("This Microsoft account doesn't own Minecraft: Java Edition, or hasn't picked a username yet at minecraft.net.".into());
    }
    let prof: Value = p.json().await.map_err(err("Minecraft profile"))?;
    let name = prof["name"].as_str().ok_or("No Minecraft profile on this account")?.to_string();
    let uuid = prof["id"].as_str().ok_or("No Minecraft profile on this account")?.to_string();
    Ok((name, uuid, token, expires))
}

// ---------------- Commands ----------------

#[tauri::command]
pub fn account_status() -> Option<AccountInfo> { load().map(|s| AccountInfo { name: s.name, uuid: s.uuid }) }

#[tauri::command]
pub fn account_sign_out(state: State<'_, AppState>) -> Res<()> {
    let _ = std::fs::remove_file(file());
    write_log(&state, "Signed out of Microsoft");
    Ok(())
}

#[tauri::command]
pub async fn account_sign_in(app: AppHandle, state: State<'_, AppState>) -> Res<AccountInfo> {
    let id = client_id()?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(err("Start sign-in"))?;
    let port = listener.local_addr().map_err(err("Start sign-in"))?.port();
    let redirect = format!("http://localhost:{port}");
    let verifier = random(48);
    let challenge = b64(&sha2::Sha256::digest(verifier.as_bytes()));
    let csrf = random(16);
    let mut url = url::Url::parse(AUTHORIZE).unwrap();
    url.query_pairs_mut().append_pair("client_id", &id).append_pair("response_type", "code").append_pair("redirect_uri", &redirect)
        .append_pair("scope", SCOPE).append_pair("code_challenge", &challenge).append_pair("code_challenge_method", "S256")
        .append_pair("state", &csrf).append_pair("prompt", "select_account");
    app.opener().open_url(url.as_str(), None::<&str>).map_err(err("Open browser"))?;

    let code = wait_for_code(listener, &csrf).await?;

    let http = &state.http;
    let (ms, refresh) = ms_token(http, &[("client_id", &id), ("grant_type", "authorization_code"), ("code", &code), ("redirect_uri", &redirect), ("code_verifier", &verifier), ("scope", SCOPE)]).await?;
    let (name, uuid, mc_token, mc_expires) = minecraft_from_ms(http, &ms).await?;
    save(&Saved { name: name.clone(), uuid: uuid.clone(), refresh_token: refresh, mc_token, mc_expires })?;
    mark_owner(&name, &uuid);
    write_log(&state, &format!("Signed in as {name}"));
    Ok(AccountInfo { name, uuid })
}

/// Waits (up to 5 minutes) for the browser to come back to our loopback port with ?code=.
pub(crate) async fn wait_for_code(listener: tokio::net::TcpListener, csrf: &str) -> Res<String> {
    tokio::time::timeout(std::time::Duration::from_secs(300), async {
        loop {
            let (mut sock, _) = listener.accept().await.map_err(err("Sign-in"))?;
            let mut buf = vec![0u8; 8192];
            let n = sock.read(&mut buf).await.unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let path = req.split_whitespace().nth(1).unwrap_or("/").to_string();
            let u = url::Url::parse(&format!("http://localhost{path}")).map_err(err("Sign-in"))?;
            let q: std::collections::HashMap<String, String> = u.query_pairs().into_owned().collect();
            if q.is_empty() { let _ = sock.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n").await; continue; }
            let ok = q.get("state").map(String::as_str) == Some(csrf) && q.contains_key("code");
            let body = format!("<!doctype html><meta charset=utf-8><title>Kestrel</title><body style=\"background:#0c0d0f;color:#f2f3f5;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0\"><div style=text-align:center><h2>{}</h2><p style=color:#a3a8b0>You can close this tab and go back to Kestrel.</p></div>",
                if ok { "Signed in" } else { "Sign-in was cancelled" });
            let _ = sock.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await;
            if ok { return Ok::<String, String>(q["code"].clone()); }
            return Err(q.get("error_description").map(|d| d.lines().next().unwrap_or("").to_string()).filter(|d| !d.is_empty()).unwrap_or_else(|| "Sign-in was cancelled.".into()));
        }
    }).await.map_err(|_| "Sign-in timed out. Try again.".to_string())?
}

pub(crate) fn pkce() -> (String, String) { let v = random(48); let c = b64(&sha2::Sha256::digest(v.as_bytes())); (v, c) }
pub(crate) fn nonce() -> String { random(16) }

/// For launching: (name, uuid, Minecraft token), refreshing it when it's old.
pub async fn for_launch(http: &reqwest::Client) -> Res<Option<(String, String, String)>> {
    let Some(mut s) = load() else { return Ok(None) };
    if s.mc_expires > now() { return Ok(Some((s.name, s.uuid, s.mc_token))); }
    let id = client_id()?;
    let (ms, refresh) = ms_token(http, &[("client_id", &id), ("grant_type", "refresh_token"), ("refresh_token", &s.refresh_token), ("scope", SCOPE)]).await?;
    let (name, uuid, token, expires) = minecraft_from_ms(http, &ms).await?;
    s = Saved { name, uuid, refresh_token: refresh, mc_token: token, mc_expires: expires };
    save(&s)?;
    mark_owner(&s.name, &s.uuid);
    Ok(Some((s.name, s.uuid, s.mc_token)))
}

// ---------------- Minecraft profile: skin and capes ----------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McCape { pub id: String, pub alias: String, pub active: bool, pub image: String }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McProfile { pub name: String, pub uuid: String, pub skin: Option<String>, pub slim: bool, pub capes: Vec<McCape> }

/// A texture from Mojang as a data URL, so the page can draw it (textures.minecraft.net sends no CORS headers).
async fn texture(http: &reqwest::Client, url: &str) -> Option<String> {
    if !url.starts_with("http://textures.minecraft.net/") && !url.starts_with("https://textures.minecraft.net/") { return None; }
    let b = http.get(url.replacen("http://", "https://", 1)).send().await.ok()?.error_for_status().ok()?.bytes().await.ok()?;
    if b.len() > 2 * 1024 * 1024 || !b.starts_with(b"\x89PNG") { return None; }
    Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(&b)))
}

/// The signed-in player's skin and the Minecraft capes they own (from Mojang's profile API).
#[tauri::command]
pub async fn minecraft_profile(state: State<'_, AppState>) -> Res<Option<McProfile>> {
    let http = &state.http;
    let Some((name, uuid, token)) = for_launch(http).await? else { return Ok(None) };
    let p: Value = http.get("https://api.minecraftservices.com/minecraft/profile").bearer_auth(&token).send().await.map_err(err("Minecraft profile"))?
        .json().await.map_err(err("Minecraft profile"))?;
    let skin = p["skins"].as_array().and_then(|s| s.iter().find(|x| x["state"] == "ACTIVE").cloned());
    let skin_image = match skin.as_ref().and_then(|s| s["url"].as_str()) { Some(u) => texture(http, u).await, None => None };
    let mut capes = Vec::new();
    for c in p["capes"].as_array().cloned().unwrap_or_default() {
        let (Some(id), Some(url)) = (c["id"].as_str(), c["url"].as_str()) else { continue };
        if let Some(image) = texture(http, url).await {
            capes.push(McCape { id: id.into(), alias: c["alias"].as_str().unwrap_or("Cape").into(), active: c["state"] == "ACTIVE", image });
        }
    }
    Ok(Some(McProfile { name, uuid, skin: skin_image, slim: skin.is_some_and(|s| s["variant"] == "SLIM"), capes }))
}

/// Your Minecraft capes and skin for Kestrel Core: PNGs in `<kestrel>/mc-capes/<id>.png` and `<kestrel>/skin.png`,
/// and the lines for cosmetics.properties (`mc.capes`, `mc.<id>.name`, `mc.equipped`, `skin.slim`). Empty when not signed in.
pub(crate) async fn game_capes(http: &reqwest::Client, kestrel_dir: &std::path::Path) -> Res<String> {
    let Some((_, _, token)) = for_launch(http).await? else { return Ok(String::new()) };
    let p: Value = http.get("https://api.minecraftservices.com/minecraft/profile").bearer_auth(&token).send().await.map_err(err("Minecraft profile"))?
        .json().await.map_err(err("Minecraft profile"))?;
    // Your skin as <kestrel>/skin.png, so Kestrel Core's own player model (title screen, Cosmetics) never has to
    // ask Mojang's session server, which rate-limits quick relaunches and then hands back Steve.
    let skin_file = kestrel_dir.join("skin.png");
    let skin = p["skins"].as_array().and_then(|s| s.iter().find(|x| x["state"] == "ACTIVE").cloned());
    let mut skin_ok = false;
    if let Some(url) = skin.as_ref().and_then(|s| s["url"].as_str()).filter(|u| u.contains("://textures.minecraft.net/")) {
        if let Ok(r) = http.get(url.replacen("http://", "https://", 1)).send().await {
            if let Ok(b) = r.bytes().await {
                skin_ok = b.starts_with(b"\x89PNG") && b.len() < 2 * 1024 * 1024 && std::fs::write(&skin_file, &b).is_ok();
            }
        }
    }
    if !skin_ok { let _ = std::fs::remove_file(&skin_file); }
    let slim = skin.is_some_and(|s| s["variant"] == "SLIM");
    let dir = kestrel_dir.join("mc-capes");
    std::fs::create_dir_all(&dir).map_err(err("Capes folder"))?;
    let (mut ids, mut lines, mut active) = (Vec::new(), String::new(), String::new());
    for c in p["capes"].as_array().cloned().unwrap_or_default() {
        let (Some(id), Some(url)) = (c["id"].as_str(), c["url"].as_str()) else { continue };
        if !id.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-') || !url.contains("://textures.minecraft.net/") { continue }
        let Ok(r) = http.get(url.replacen("http://", "https://", 1)).send().await else { continue };
        let Ok(b) = r.bytes().await else { continue };
        if !b.starts_with(b"\x89PNG") { continue }
        if std::fs::write(dir.join(format!("{id}.png")), &b).is_err() { continue }
        let alias: String = c["alias"].as_str().unwrap_or("Cape").chars().filter(|ch| !ch.is_control()).collect();
        lines += &format!("mc.{id}.name={alias}\n");
        if c["state"] == "ACTIVE" { active = id.to_string(); }
        ids.push(id.to_string());
    }
    Ok(format!("{lines}mc.capes={}\nmc.equipped={active}\nskin.slim={slim}\n", ids.join(",")))
}

/// Links your Minecraft account to your Kestrel (Discord) account on Kestrel's service, proven the way
/// servers do it: Mojang's session server confirms you joined the one-time server id. No token leaves this PC
/// except to Mojang. Returns the linked Minecraft name.
#[tauri::command]
pub async fn service_link_minecraft(state: State<'_, AppState>) -> Res<String> {
    let http = &state.http;
    let Some((name, uuid, token)) = for_launch(http).await? else { return Err("Sign in with Microsoft first.".into()) };
    let start = crate::service::call(http, "POST", "/v1/me/minecraft/start", None).await?;
    let sid = start["serverId"].as_str().ok_or("Kestrel's service didn't start the link")?;
    let r = http.post("https://sessionserver.mojang.com/session/minecraft/join")
        .json(&json!({ "accessToken": token, "selectedProfile": uuid.replace('-', ""), "serverId": sid })).send().await.map_err(err("Mojang"))?;
    if !r.status().is_success() { return Err(format!("Mojang didn't accept the link ({})", r.status().as_u16())); }
    crate::service::call(http, "POST", "/v1/me/minecraft/finish", Some(json!({ "name": name }))).await?;
    write_log(&state, &format!("Linked Minecraft account {name} to Kestrel"));
    Ok(name)
}

/// Shows one of your Minecraft capes (or none) on your Minecraft account.
#[tauri::command]
pub async fn minecraft_set_cape(state: State<'_, AppState>, cape: Option<String>) -> Res<()> {
    set_cape(&state.http, cape.clone()).await?;
    write_log(&state, if cape.is_some() { "Changed Minecraft cape" } else { "Hid Minecraft cape" });
    Ok(())
}

pub(crate) async fn set_cape(http: &reqwest::Client, cape: Option<String>) -> Res<()> {
    let Some((_, _, token)) = for_launch(http).await? else { return Err("Sign in with Microsoft first.".into()) };
    let url = "https://api.minecraftservices.com/minecraft/profile/capes/active";
    let r = match &cape {
        Some(id) => http.put(url).bearer_auth(&token).json(&json!({ "capeId": id })).send().await,
        None => http.delete(url).bearer_auth(&token).send().await,
    }.map_err(err("Minecraft profile"))?;
    if !r.status().is_success() { return Err(format!("Mojang didn't change the cape ({})", r.status().as_u16())); }
    Ok(())
}

/// Offline player UUID, the same way vanilla Minecraft makes one.
pub fn offline_uuid(name: &str) -> String {
    let mut b: [u8; 16] = md5::Md5::digest(format!("OfflinePlayer:{name}").as_bytes()).into();
    b[6] = (b[6] & 0x0f) | 0x30;
    b[8] = (b[8] & 0x3f) | 0x80;
    hex::encode(b)
}
pub fn valid_offline_name(n: &str) -> bool { (3..=16).contains(&n.len()) && n.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') }
