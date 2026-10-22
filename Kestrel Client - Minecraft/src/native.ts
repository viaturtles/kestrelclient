import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type WindowAction =
  "minimize" | "toggleMaximize" | "close" | "startDragging";
export async function windowAction(action: WindowAction): Promise<void> {
  if (!isTauri())
    throw new Error("Window controls are available in the desktop app.");
  await getCurrentWindow()[action]();
}
