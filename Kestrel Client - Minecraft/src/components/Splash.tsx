import { useEffect, useRef, useState } from "react";
import { api, inApp } from "../lib/api";
import { useApp } from "../lib/store";
import { checkForUpdate, installUpdate } from "../lib/updates";

// Figma 53:559 "Kestrel - Loading Screen". The design is unchanged; the line under the
// bar now names the real step in progress, and the bar advances as steps finish.
const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);

const ART = ["/assets/imgHypixelBackground1.png", "/assets/v3/complementary.jpg", "/assets/v3/bsl.jpg", "/assets/imgRectangle.png", "/assets/v3/texture.jpg", "/assets/imgHypixelOfficialLogo.png", "/assets/v3/mc.png", "/assets/imgOptiFineIcon.png"];

export function Splash({ onDone }: { onDone: () => void }) {
  const app = useApp();
  const [text, setText] = useState("Starting Kestrel");
  const [done, setDone] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const ran = useRef(false);
  const steps = 6;

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const step = async (label: string, work: () => Promise<unknown>) => {
        setText(label);
        try { await work(); } catch { /* each step reports problems on its own page later */ }
        setDone((d) => d + 1);
      };
      // A waiting update installs here, so people who ignored the prompt just restart Kestrel.
      await step("Checking for updates", async () => {
        if (!inApp) return;
        const u = await withTimeout(checkForUpdate(), 6000);
        if (!u) return;
        setText(`Updating Kestrel to ${u.version}`);
        await installUpdate(u, (p) => setText(`Updating Kestrel to ${u.version} · ${Math.round(p * 100)}%`)); // restarts Kestrel when done
      });
      await step("Loading your settings", async () => { if (inApp) app.setPaths(await api.paths()); await new Promise((r) => setTimeout(r, 120)); });
      await step("Finding Java on this PC", async () => { if (inApp) await withTimeout(app.refreshJava(), 15000); });
      await step("Checking Minecraft versions", async () => { if (inApp) await withTimeout(api.mcVersions(), 8000); });
      await step(`Checking ${app.selected.name}`, async () => { if (inApp) { await api.prepareInstance(app.selected.id); await api.gameStatus(app.selected.version); } });
      await step("Loading artwork", () => Promise.all(ART.map((src) => new Promise((r) => { const im = new Image(); im.onload = im.onerror = r; im.src = src; }))));
      setText("Ready");
      setTimeout(() => setLeaving(true), 250);
      setTimeout(onDone, 250 + 450);
    })();
  }, []);

  return (
    <div className={"splash" + (leaving ? " leaving" : "")} role="status" aria-live="polite">
      <div className="front">
        <img className="bird" src="/assets/imgKestrelOriginalWhiteBird.svg" alt="" />
        <div className="bar"><span style={{ width: `${Math.round((done / steps) * 100)}%` }} /></div>
        <p><span key={text}>{text}{text !== "Ready" ? "…" : ""}</span></p>
      </div>
    </div>
  );
}
