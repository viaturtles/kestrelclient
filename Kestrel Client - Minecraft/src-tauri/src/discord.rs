//! Discord Rich Presence. One background thread owns the Discord connection;
//! the launcher and the running game send it what to show.

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use serde::Deserialize;
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::time::Duration;
use tauri::State;

#[derive(Clone, PartialEq, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Presence { pub details: String, pub state: String, pub start_ms: Option<i64>, pub in_game: bool, pub small_text: String }

enum Msg { Shutdown(Sender<()>), Prefs { enabled: bool, show_server: bool, in_launcher: bool }, Launcher(Option<Presence>), Game(Option<GameInfo>), Place(Place) }

#[derive(Clone, PartialEq)]
pub struct GameInfo { pub version: String, pub mode: String, pub place: Place, pub start_ms: i64 }
#[derive(Clone, PartialEq)]
pub enum Place { Menus, Singleplayer, Server(String) }

pub struct Discord { tx: Sender<Msg> }

pub fn now_ms() -> i64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0) }

impl Discord {
    pub fn start(app_id: String) -> Self {
        let (tx, rx) = channel::<Msg>();
        std::thread::Builder::new().name("discord".into()).spawn(move || {
            let id = app_id;
            let (mut enabled, mut show_server, mut in_launcher) = (true, false, true);
            let (mut launcher, mut game): (Option<Presence>, Option<GameInfo>) = (None, None);
            let mut client: Option<(String, DiscordIpcClient)> = None;
            let mut shown: Option<Presence> = None;
            loop {
                match rx.recv_timeout(Duration::from_secs(15)) {
                    Ok(Msg::Shutdown(done)) => {
                        if let Some((_, mut c)) = client.take() { let _ = c.clear_activity(); let _ = c.close(); }
                        let _ = done.send(());
                        break;
                    }
                    Ok(Msg::Prefs { enabled: e, show_server: s, in_launcher: l }) => { enabled = e; show_server = s; in_launcher = l; }
                    Ok(Msg::Launcher(p)) => { launcher = p; }
                    Ok(Msg::Game(g)) => { game = g; }
                    Ok(Msg::Place(p)) => { if let Some(g) = game.as_mut() { g.place = p; } }
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => break,
                }
                let want: Option<Presence> = if !enabled || id.is_empty() { None } else if let Some(g) = &game {
                    let state = match &g.place {
                        Place::Menus => "In the menus".to_string(),
                        Place::Singleplayer => "In singleplayer".to_string(),
                        Place::Server(h) if show_server => format!("On {h}"),
                        Place::Server(_) => "In multiplayer".to_string(),
                    };
                    Some(Presence { details: format!("Playing Minecraft {}", g.version), state, start_ms: Some(g.start_ms), in_game: true, small_text: g.mode.clone() })
                } else if in_launcher { launcher.clone() } else { None };

                // Drop the connection if the app ID changed.
                if client.as_ref().is_some_and(|(cid, _)| *cid != id) {
                    if let Some((_, mut c)) = client.take() { let _ = c.close(); }
                    shown = None;
                }
                match want {
                    None => {
                        if shown.is_some() { if let Some((_, c)) = client.as_mut() { let _ = c.clear_activity(); } shown = None; }
                    }
                    Some(p) => {
                        if shown.as_ref() == Some(&p) && client.is_some() { continue; }
                        if client.is_none() {
                            let mut c = DiscordIpcClient::new(&id);
                            if c.connect().is_err() { continue; } // Discord isn't open; try again later.
                            client = Some((id.clone(), c));
                        }
                        let mut a = activity::Activity::new().details(p.details.as_str())
                            .assets({
                                let x = activity::Assets::new().large_image("kestrel").large_text("Kestrel");
                                if p.in_game { x.small_image("minecraft").small_text(p.small_text.as_str()) } else { x }
                            });
                        if !p.state.is_empty() { a = a.state(p.state.as_str()); }
                        if let Some(s) = p.start_ms { a = a.timestamps(activity::Timestamps::new().start(s)); }
                        let ok = client.as_mut().map(|(_, c)| c.set_activity(a).is_ok()).unwrap_or(false);
                        if ok { shown = Some(p); } else { client = None; shown = None; } // reconnect next time
                    }
                }
            }
        }).expect("discord thread");
        Discord { tx }
    }
    pub fn game(&self, g: Option<GameInfo>) { let _ = self.tx.send(Msg::Game(g)); }
    /// Clears the status and disconnects from Discord (waits up to a second).
    pub fn shutdown(&self) {
        let (tx, rx) = channel();
        if self.tx.send(Msg::Shutdown(tx)).is_ok() { let _ = rx.recv_timeout(Duration::from_millis(1000)); }
    }
    pub fn place(&self, p: Place) { let _ = self.tx.send(Msg::Place(p)); }
}

#[tauri::command]
pub fn discord_prefs(state: State<'_, crate::core::AppState>, enabled: bool, show_server: bool, in_launcher: bool) {
    let _ = state.discord.tx.send(Msg::Prefs { enabled, show_server, in_launcher });
}

#[tauri::command]
pub fn discord_launcher(state: State<'_, crate::core::AppState>, presence: Option<Presence>) {
    let _ = state.discord.tx.send(Msg::Launcher(presence));
}
