//! IDs Kestrel is built with. Players never see or change these.
//! Paste them here before building a release.

/// Azure "Application (client) ID" for Microsoft sign-in. Not a secret.
pub const MICROSOFT_CLIENT_ID: &str = "d2af973a-5360-4e64-80a3-4f64b5e0ec43";
/// Discord Developer Portal "Application ID" (Rich Presence + Sign in with Discord). Not a secret.
pub const DISCORD_APP_ID: &str = "1562583066940018759";

/// Kestrel's online service (the Cloudflare Worker in `service/`), e.g. "https://kestrel-service.<you>.workers.dev".
/// Empty = not deployed yet: staff tools, bans and given cosmetics stay off.
pub const SERVICE_URL: &str = "https://kestrel-service.beruberhys.workers.dev";

/// Offline (singleplayer) play only after this PC has signed in once with a Microsoft account that
/// owns Minecraft, like Prism Launcher. Turn on once Mojang approves Kestrel's sign-in.
pub const REQUIRE_OWNED_ACCOUNT: bool = true; // on since Mojang's approval (2026-10-23)

pub struct Config { pub microsoft_client_id: String, pub discord_app_id: String }

pub fn load() -> Config { Config { microsoft_client_id: MICROSOFT_CLIENT_ID.into(), discord_app_id: DISCORD_APP_ID.into() } }
