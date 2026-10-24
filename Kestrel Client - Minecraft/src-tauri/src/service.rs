//! Calls Kestrel's online service (the Cloudflare Worker in `service/`) with the player's Discord sign-in.
//! The token is attached here, so the page never sees it. Only `/v1/...` paths on Kestrel's own service.

use crate::core::{err, AppState, Res};
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub fn service_ready() -> bool { !crate::config::SERVICE_URL.is_empty() }

#[tauri::command]
pub async fn service_call(state: State<'_, AppState>, method: String, path: String, body: Option<Value>) -> Res<Value> {
    call(&state.http, &method, &path, body).await
}

/// One call to the service as the linked Discord account (used by the page and by launching).
pub(crate) async fn call(http: &reqwest::Client, method: &str, path: &str, body: Option<Value>) -> Res<Value> {
    let base = crate::config::SERVICE_URL;
    if base.is_empty() { return Err("Kestrel's online service isn't set up in this build yet.".into()); }
    if !path.starts_with("/v1/") || path.contains("..") || path.contains("://") { return Err("Bad service path".into()); }
    let method = match method { "GET" => reqwest::Method::GET, "POST" => reqwest::Method::POST, "DELETE" => reqwest::Method::DELETE, _ => return Err("Bad method".into()) };
    let mut token = crate::discord_account::access_token().ok_or("Link your Discord account first (Settings → Discord).")?;
    for attempt in 0..2 {
        let mut req = http.request(method.clone(), format!("{}{}", base.trim_end_matches('/'), path)).bearer_auth(&token);
        if let Some(b) = &body { req = req.json(b); }
        let res = req.send().await.map_err(err("Kestrel service"))?;
        let status = res.status();
        let v: Value = res.json().await.unwrap_or(Value::Null);
        if status.is_success() { return Ok(v); }
        // An expired Discord token is swapped once for a fresh one, then the call is retried.
        if attempt == 0 && v["error"] == "discord_expired" {
            token = crate::discord_account::refresh(http).await?;
            continue;
        }
        return Err(v["message"].as_str().map(String::from).unwrap_or_else(|| format!("Kestrel service error ({status})")));
    }
    Err("Your Discord sign-in expired. Link Discord again in Settings → Discord.".into())
}
