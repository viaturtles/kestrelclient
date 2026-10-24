import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { api, inApp } from "./api";
import { errText, type AppState, type Installation } from "./store";

/** Opens (or focuses) the Launch Control window. */
export async function openMissionControl() {
  if (!inApp) { window.open("/?view=mission", "_blank", "width=980,height=640"); return; }
  const existing = await WebviewWindow.getByLabel("mission");
  if (existing) { await existing.show(); await existing.setFocus(); return; }
  new WebviewWindow("mission", {
    url: "/?view=mission", title: "Kestrel · Launch Control", width: 1000, height: 640,
    resizable: false, maximizable: false, decorations: false, center: true, backgroundColor: "#0C0D0F",
  });
}

/**
 * Starts the real launch pipeline and shows it in Launch Control.
 * `server` joins a server on start; `world` opens a singleplayer world folder on start.
 * With neither, the installation's "Join on launch" server is used (if set).
 */
export async function launchInstallation(app: AppState, inst: Installation, server: string | null = null, world: string | null = null) {
  if (!server && !world && inst.autoJoin) server = inst.autoJoin;
  try {
    await api.launch({
      instanceId: inst.id, name: inst.name, version: inst.version, mode: inst.mode, memoryGb: inst.memoryGb,
      javaPath: inst.javaPath, jvmArgs: inst.jvmArgs, width: inst.width, height: inst.height, fullscreen: inst.fullscreen,
      server, world, optifine: inst.optifine ?? null, offlineName: app.settings.offlineName || null, backupWorlds: app.settings.backupBeforeLaunch,    });
    app.updateInstallation(inst.id, { lastPlayed: Date.now() });
    if (server) {
      const known = app.servers.find((s) => s.address.toLowerCase() === server!.toLowerCase());
      app.addHistory({ kind: "server", name: known?.name ?? server, detail: server, version: inst.version, at: Date.now(), serverAddress: server, installationId: inst.id });
    }
    await openMissionControl();
  } catch (e) {
    app.notify(errText(e), "error");
  }
}
