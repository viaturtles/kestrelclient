// Kestrel auto-updates: checks GitHub Releases for a newer signed build.
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { inApp } from "./api";

/** Returns the available update, or null when Kestrel is up to date. */
export async function checkForUpdate(): Promise<Update | null> {
  if (!inApp) return null;
  return await check();
}

/** Downloads and installs the update, then restarts Kestrel. `onProgress` gets 0..1. */
export async function installUpdate(update: Update, onProgress?: (p: number) => void) {
  let total = 0, done = 0;
  await update.downloadAndInstall((e) => {
    if (e.event === "Started") total = e.data.contentLength ?? 0;
    else if (e.event === "Progress") { done += e.data.chunkLength; if (total) onProgress?.(done / total); }
  });
  await relaunch();
}
