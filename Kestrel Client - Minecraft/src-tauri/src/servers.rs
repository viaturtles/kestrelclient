//! Minecraft Server List Ping (the same status request the multiplayer menu sends).

use crate::core::*;
use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub online: bool,
    pub players_online: Option<i64>,
    pub players_max: Option<i64>,
    pub version: Option<String>,
    pub motd: Option<String>,
    pub favicon: Option<String>,
    pub ping_ms: Option<u64>,
    pub error: Option<String>,
}

fn varint(mut v: i32, out: &mut Vec<u8>) {
    loop {
        let mut b = (v & 0x7f) as u8;
        v = ((v as u32) >> 7) as i32;
        if v != 0 { b |= 0x80; }
        out.push(b);
        if v == 0 { break; }
    }
}

async fn read_varint(s: &mut TcpStream) -> Res<i32> {
    let mut n = 0i32;
    for i in 0..5 {
        let b = s.read_u8().await.map_err(err("Read"))?;
        n |= ((b & 0x7f) as i32) << (7 * i);
        if b & 0x80 == 0 { return Ok(n); }
    }
    Err("Bad response from server".into())
}

fn packet(id: i32, body: &[u8]) -> Vec<u8> {
    let mut inner = Vec::new();
    varint(id, &mut inner);
    inner.extend_from_slice(body);
    let mut out = Vec::new();
    varint(inner.len() as i32, &mut out);
    out.extend(inner);
    out
}

fn flatten(c: &Value) -> String {
    match c {
        Value::String(s) => s.clone(),
        Value::Object(o) => {
            let mut s = o.get("text").and_then(|t| t.as_str()).unwrap_or("").to_string();
            if let Some(extra) = o.get("extra").and_then(|e| e.as_array()) { for e in extra { s.push_str(&flatten(e)); } }
            s
        }
        Value::Array(a) => a.iter().map(flatten).collect(),
        _ => String::new(),
    }
}

/// Removes Minecraft § formatting codes.
fn strip_codes(s: &str) -> String {
    let mut out = String::new();
    let mut skip = false;
    for ch in s.chars() {
        if skip { skip = false; continue; }
        if ch == '§' { skip = true; continue; }
        out.push(ch);
    }
    out.trim().to_string()
}

pub(crate) async fn ping_inner(host: &str, port: u16) -> Res<ServerStatus> {
    let mut s = timeout(Duration::from_secs(5), TcpStream::connect((host, port))).await.map_err(|_| "Timed out".to_string())?.map_err(err("Can't reach server"))?;
    let mut hs = Vec::new();
    varint(47, &mut hs); // protocol 47 = 1.8.x
    varint(host.len() as i32, &mut hs);
    hs.extend_from_slice(host.as_bytes());
    hs.extend_from_slice(&port.to_be_bytes());
    varint(1, &mut hs);
    s.write_all(&packet(0, &hs)).await.map_err(err("Send"))?;
    s.write_all(&packet(0, &[])).await.map_err(err("Send"))?;
    let read = async {
        let _len = read_varint(&mut s).await?;
        let _id = read_varint(&mut s).await?;
        let n = read_varint(&mut s).await? as usize;
        if n > 1_000_000 { return Err("Response too large".to_string()); }
        let mut buf = vec![0u8; n];
        s.read_exact(&mut buf).await.map_err(err("Read"))?;
        Ok::<Vec<u8>, String>(buf)
    };
    let json = timeout(Duration::from_secs(5), read).await.map_err(|_| "Timed out".to_string())??;
    let v: Value = serde_json::from_slice(&json).map_err(err("Status"))?;
    // Latency: ping/pong round trip
    let start = Instant::now();
    let ping_ms = async {
        s.write_all(&packet(1, &42i64.to_be_bytes())).await.ok()?;
        let _ = read_varint(&mut s).await.ok()?;
        let _ = read_varint(&mut s).await.ok()?;
        let mut b = [0u8; 8];
        s.read_exact(&mut b).await.ok()?;
        Some(start.elapsed().as_millis() as u64)
    };
    let ping_ms = timeout(Duration::from_secs(3), ping_ms).await.ok().flatten();
    Ok(ServerStatus {
        online: true,
        players_online: v["players"]["online"].as_i64(),
        players_max: v["players"]["max"].as_i64(),
        version: v["version"]["name"].as_str().map(strip_codes),
        motd: Some(strip_codes(&flatten(&v["description"]))).filter(|m| !m.is_empty()),
        favicon: v["favicon"].as_str().filter(|f| f.starts_with("data:image/png;base64,")).map(String::from),
        ping_ms,
        error: None,
    })
}

#[tauri::command]
pub async fn ping_server(address: String) -> Res<ServerStatus> {
    let address = address.trim().to_string();
    let (host, port) = match address.rsplit_once(':') {
        Some((h, p)) if p.chars().all(|c| c.is_ascii_digit()) => (h.to_string(), p.parse().unwrap_or(25565)),
        _ => (address.clone(), 25565),
    };
    if host.is_empty() || host.len() > 253 || !host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
        return Err("Enter an address like play.example.net".into());
    }
    match ping_inner(&host, port).await {
        Ok(s) => Ok(s),
        Err(e) => Ok(ServerStatus { online: false, players_online: None, players_max: None, version: None, motd: None, favicon: None, ping_ms: None, error: Some(e) }),
    }
}
