/**
 * Microsoft sign-in works only once Mojang approves Kestrel's Azure app. Until then the sign-in
 * buttons explain that instead of opening a sign-in that can't finish. Flip this together with
 * REQUIRE_OWNED_ACCOUNT in src-tauri/src/config.rs when the approval arrives.
 */
export const MICROSOFT_SIGN_IN_OPEN = true; // Mojang approved Kestrel's app on 2026-10-23

/** Kestrel's online service (same as SERVICE_URL in src-tauri/src/config.rs). Only public data is read from here directly. */
export const SERVICE_URL = "https://kestrel-service.beruberhys.workers.dev";
