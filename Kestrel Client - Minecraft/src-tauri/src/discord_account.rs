//! "Sign in with Discord": links a player's Discord account to Kestrel
//! (OAuth2 public client + PKCE, scope `identify`). Used later for perks like capes.
//! Saved encrypted with DPAPI; tokens are never logged.

use crate::account::{dpapi, nonce, pkce, wait_for_code};
use crate::core::{data_dir, err, write_log, AppState, Res};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

/// Must be added exactly like this under OAuth2 → Redirects in the Discord Developer Portal.
pub const REDIRECT_PORT: u16 = 53134;
fn redirect() -> String { format!("http://127.0.0.1:{REDIRECT_PORT}/discord") }

#[derive(Serialize, Deserialize, Clone)]
struct Saved { id: String, username: String, global_name: Option<String>, avatar: Option<String>, access_token: String, refresh_token: String, linked_at: u64 }

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiscordUser { pub id: String, pub username: String, pub display_name: String, pub avatar_url: Option<String>, pub linked_at: u64 }

fn file() -> std::path::PathBuf { data_dir().join("discord.dat") }
fn load() -> Option<Saved> { serde_json::from_slice(&dpapi(&std::fs::read(file()).ok()?, false)?).ok() }
fn public(s: &Saved) -> DiscordUser {
    DiscordUser {
        id: s.id.clone(), username: s.username.clone(), display_name: s.global_name.clone().unwrap_or_else(|| s.username.clone()),
        avatar_url: s.avatar.as_ref().map(|a| format!("https://cdn.discordapp.com/avatars/{}/{a}.png?size=128", s.id)), linked_at: s.linked_at,
    }
}

#[tauri::command]
pub fn discord_user() -> Option<DiscordUser> { load().map(|s| public(&s)) }

#[tauri::command]
pub fn discord_unlink(state: State<'_, AppState>) -> Res<()> {
    let _ = std::fs::remove_file(file());
    write_log(&state, "Unlinked Discord");
    Ok(())
}

#[tauri::command]
pub async fn discord_link(app: AppHandle, state: State<'_, AppState>) -> Res<DiscordUser> {
    let id = crate::config::load().discord_app_id;
    if id.is_empty() { return Err("Discord sign-in isn't set up in this build of Kestrel yet.".into()); }
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", REDIRECT_PORT)).await
        .map_err(|_| "Another Discord sign-in is already open. Finish or close it, then try again.".to_string())?;
    let (verifier, challenge) = pkce();
    let csrf = nonce();
    let mut url = url::Url::parse("https://discord.com/oauth2/authorize").unwrap();
    url.query_pairs_mut().append_pair("client_id", &id).append_pair("response_type", "code").append_pair("redirect_uri", &redirect())
        .append_pair("scope", "identify").append_pair("state", &csrf).append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256").append_pair("prompt", "consent");
    app.opener().open_url(url.as_str(), None::<&str>).map_err(err("Open browser"))?;
    let code = wait_for_code(listener, &csrf).await?;

    let http = &state.http;
    let t: Value = http.post("https://discord.com/api/v10/oauth2/token")
        .form(&[("client_id", id.as_str()), ("grant_type", "authorization_code"), ("code", &code), ("redirect_uri", &redirect()), ("code_verifier", &verifier)])
        .send().await.map_err(err("Discord"))?.json().await.map_err(err("Discord"))?;
    let (Some(access), Some(refresh)) = (t["access_token"].as_str(), t["refresh_token"].as_str()) else {
        return Err(match t["error"].as_str() {
            Some("invalid_client") | Some("unauthorized_client") => "Discord rejected Kestrel. Check that Public Client is on and the redirect is added in the Discord Developer Portal.".into(),
            _ => format!("Discord sign-in failed: {}", t["error_description"].as_str().unwrap_or("unknown error")),
        });
    };
    let me: Value = http.get("https://discord.com/api/v10/users/@me").bearer_auth(access).send().await.map_err(err("Discord"))?.json().await.map_err(err("Discord"))?;
    let s = Saved {
        id: me["id"].as_str().ok_or("Discord didn't return your account")?.into(),
        username: me["username"].as_str().unwrap_or("").into(), global_name: me["global_name"].as_str().map(String::from),
        avatar: me["avatar"].as_str().map(String::from), access_token: access.into(), refresh_token: refresh.into(),
        linked_at: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0),
    };
    let enc = dpapi(&serde_json::to_vec(&s).unwrap(), true).ok_or("Couldn't protect the saved Discord sign-in")?;
    std::fs::write(file(), enc).map_err(err("Save Discord account"))?;
    write_log(&state, &format!("Linked Discord account {}", s.username));
    Ok(public(&s))
}
