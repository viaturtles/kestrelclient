import { useEffect, useState } from "react";
import { Check, EyeOff, Footprints, Lock, Shirt, User } from "lucide-react";
import { api, inApp, type CapeInfo } from "../lib/api";
import { errText, useApp } from "../lib/store";
import { Seg } from "../components/ui";
import { SERVICE_URL } from "../lib/config";
import { signInDialog } from "../components/Shell";
import { CapeModel, SkinViewer } from "../components/SkinViewer";

/** The front of a cape, cut out of its Minecraft texture (64x32 layout, any resolution; first frame if animated). */
export function CapeFront({ url, frames = 1, width }: { url: string; frames?: number; width: number }) {
  const s = width / 10; // one vanilla cape pixel
  return <span className="cape-front" style={{ width, height: s * 16, backgroundImage: `url("${url}")`, backgroundSize: `${64 * s}px ${32 * s * frames}px`, backgroundPosition: `${-s}px ${-s}px` }} />;
}

/**
 * Cosmetics: capes on the left, a 3D preview of you on the right. Click any cape to try it on in the
 * preview (even locked ones); Wear puts it on in game. Minecraft's own capes and skins need Microsoft
 * sign-in, so those tabs wait for Mojang's approval.
 */
export function Cosmetics() {
  const app = useApp();
  const [tab, setTab] = useState("kestrel");
  const [capes, setCapes] = useState<CapeInfo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const wearing = app.me?.cape?.id ?? null;
  const [preview, setPreview] = useState<string | null | undefined>(undefined); // undefined = show what you wear
  const [walking, setWalking] = useState(false);
  const linked = !!app.discordUser;
  // The cape list is public, so it's read straight from the service (works without Discord too).
  useEffect(() => { fetch(`${SERVICE_URL}/v1/capes`).then((r) => r.json()).then((r: { capes: CapeInfo[] }) => setCapes(r.capes)).catch(() => setCapes([])); }, []);

  const shown = preview === undefined ? wearing : preview;
  const cape = capes?.find((c) => c.id === shown) ?? null;
  const owned = (id: string) => !!app.me?.cosmetics.includes(id);
  const name = app.account?.name ?? app.settings.offlineName ?? "Steve";
  // Your real skin from Mojang when signed in; otherwise the skin for your offline name.
  const skin = app.mcProfile?.skin ?? `https://mc-heads.net/skin/${encodeURIComponent(name)}`;
  // Minecraft (Mojang) capes: the one shown on your account, and the one being previewed.
  const mcCapes = app.mcProfile?.capes ?? [];
  const mcActive = mcCapes.find((c) => c.active)?.id ?? null;
  const [mcPreview, setMcPreview] = useState<string | null | undefined>(undefined);
  const mcShown = mcPreview === undefined ? mcActive : mcPreview;
  const mcCape = mcCapes.find((c) => c.id === mcShown) ?? null;
  const mcWear = async (id: string | null) => {
    setBusy(id ?? "mc-off");
    try { await api.minecraftSetCape(id); await app.refreshMcProfile(); setMcPreview(undefined); app.notify(id ? "Minecraft cape changed. Everyone sees it on servers." : "Minecraft cape hidden."); }
    catch (e) { app.notify(errText(e), "error"); }
    setBusy(null);
  };
  // In game your Kestrel cape covers your Minecraft one; with no Kestrel cape your Minecraft cape shows.
  const viewerCape = tab === "minecraft" ? mcCape?.image ?? null : cape?.url ?? (shown === null ? mcCapes.find((c) => c.active)?.image ?? null : null);

  const wear = async (id: string | null) => {
    setBusy(id ?? "off");
    try { await api.service("POST", "/v1/me/cape", { cape: id }); await app.refreshMe(); setPreview(undefined); app.notify(id ? "Cape on. It shows in game from your next launch (F5 to see it)." : "Cape taken off."); }
    catch (e) { app.notify(errText(e), "error"); }
    setBusy(null);
  };
  const link = async () => {
    setBusy("link");
    try { const u = await api.discordLink(); app.setDiscordUser(u); app.notify(`Discord linked: ${u.displayName}.`); }
    catch (e) { app.notify(errText(e), "error"); }
    setBusy(null);
  };

  // The one button under the preview says what clicking it does for the cape being previewed.
  const action = tab === "minecraft" ? (
    !app.account ? <button className="btn cos-action" onClick={() => signInDialog(app)}>Sign in with Microsoft</button>
      : mcShown === mcActive ? <button className="btn cos-action" disabled><Check size={15} />{mcActive ? `Showing ${mcCape?.alias ?? "cape"}` : "No Minecraft cape shown"}</button>
      : mcShown === null ? <button className="btn cos-action" disabled={busy !== null} onClick={() => mcWear(null)}>{busy === "mc-off" ? <span className="spinner" /> : <EyeOff size={15} />}Hide Minecraft cape</button>
      : <button className="btn green cos-action" disabled={busy !== null} onClick={() => mcWear(mcShown)}>{busy === mcShown ? <span className="spinner" /> : <Shirt size={15} />}Show {mcCape?.alias}</button>
  ) : !linked ? <button className="btn discord cos-action" disabled={!inApp || busy !== null} onClick={link}>{busy === "link" ? <span className="spinner" /> : null}Link Discord to wear capes</button>
    : shown === wearing ? <button className="btn cos-action" disabled><Check size={15} />{wearing ? `Wearing ${cape?.name ?? "cape"}` : "No cape on"}</button>
    : shown === null ? <button className="btn cos-action" disabled={busy !== null} onClick={() => wear(null)}>{busy === "off" ? <span className="spinner" /> : <EyeOff size={15} />}Take off cape</button>
    : owned(shown) ? <button className="btn green cos-action" disabled={busy !== null} onClick={() => wear(shown)}>{busy === shown ? <span className="spinner" /> : <Shirt size={15} />}Wear {cape?.name}</button>
    : <button className="btn cos-action" disabled><Lock size={14} />Coming to the shop</button>;

  return (
    <div className="cos-page">
      <section className="cos-left">
        <div className="st" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <div><h1 className="t-display">Cosmetics</h1><p className="muted" style={{ marginTop: 4 }}>Click a cape to try it on, then wear it in game.</p></div>
          <Seg label="Cosmetics sections" value={tab} onChange={setTab} items={[{ value: "kestrel", label: "Kestrel capes" }, { value: "minecraft", label: "Minecraft capes" }, { value: "skin", label: "Skin" }]} />
        </div>
        {tab === "kestrel" && (
          <div className="cos-tiles st" style={{ ["--i" as string]: 1 }}>
            <button className={"cos-tile" + (shown === null ? " sel" : "")} onClick={() => setPreview(null)}>
              <span className="cos-tile-art"><EyeOff size={30} color="var(--text3)" /></span>
              <b>No cape</b><span className="t-cap">{wearing === null ? "On now" : "Hide your cape"}</span>
            </button>
            {capes === null ? <div className="skeleton" style={{ height: 210 }} /> : capes.map((c) => (
              <button key={c.id} className={"cos-tile" + (shown === c.id ? " sel" : "")} onClick={() => setPreview(c.id)}>
                {wearing === c.id && <span className="cos-badge"><Check size={11} strokeWidth={3} /></span>}
                <span className="cos-tile-art">{c.url ? <CapeModel url={c.url} frames={c.frames} width={66} /> : <Shirt size={30} color="var(--text3)" />}</span>
                <b>{c.name}</b>
                <span className="t-cap">{wearing === c.id ? "Wearing" : owned(c.id) ? "Yours" : <><Lock size={10} style={{ verticalAlign: -1 }} /> Locked</>}</span>
              </button>
            ))}
            {capes?.length === 0 && <p className="t-cap" style={{ gridColumn: "1 / -1" }}>{inApp ? "Couldn't load capes. Check your connection." : "Capes load in the Kestrel desktop app."}</p>}
          </div>
        )}
        {tab === "minecraft" && (
          !app.account ? <div className="empty st" style={{ ["--i" as string]: 1 }}><Shirt size={22} /><b>Your Minecraft capes</b><span>Sign in with Microsoft and the capes on your Minecraft account show here.</span></div>
          : (
            <div className="cos-tiles st" style={{ ["--i" as string]: 1 }}>
              <button className={"cos-tile" + (mcShown === null ? " sel" : "")} onClick={() => setMcPreview(null)}>
                <span className="cos-tile-art"><EyeOff size={30} color="var(--text3)" /></span>
                <b>No cape</b><span className="t-cap">{mcActive === null ? "Showing now" : "Hide it"}</span>
              </button>
              {mcCapes.map((c) => (
                <button key={c.id} className={"cos-tile" + (mcShown === c.id ? " sel" : "")} onClick={() => setMcPreview(c.id)}>
                  {c.active && <span className="cos-badge"><Check size={11} strokeWidth={3} /></span>}
                  <span className="cos-tile-art"><CapeModel url={c.image} width={66} pixelArt /></span>
                  <b>{c.alias}</b><span className="t-cap">{c.active ? "Showing" : "Yours"}</span>
                </button>
              ))}
              {app.mcProfile && mcCapes.length === 0 && <p className="t-cap" style={{ gridColumn: "1 / -1" }}>Your Minecraft account has no capes yet.</p>}
              {!app.mcProfile && <div className="skeleton" style={{ height: 210 }} />}
            </div>
          )
        )}
        {tab === "skin" && (
          <div className="empty st" style={{ ["--i" as string]: 1 }}><User size={22} /><b>Change your skin</b><span>{app.account ? "Changing your skin from Kestrel is coming in the next update." : "Skins are saved to your Microsoft account: sign in (Settings → Account) to change yours."} The preview shows the skin for "{name}".</span></div>
        )}
      </section>
      <aside className="cos-right st" style={{ ["--i" as string]: 2 }}>
        <div className="cos-stage3d">
          <SkinViewer skin={skin} slim={app.mcProfile ? app.mcProfile.slim : undefined} cape={viewerCape} frames={tab === "minecraft" ? 1 : cape?.frames} walking={walking} />
          <span className="cos-hint">Drag to turn</span>
          <button className={"ibtn grey sm cos-walk" + (walking ? " on" : "")} aria-pressed={walking} title={walking ? "Stand still" : "Walk"} onClick={() => setWalking((w) => !w)}><Footprints size={14} /></button>
        </div>
        {action}
        <span className="cos-name"><User size={13} />{name}{cape && shown !== wearing ? <span className="t-cap"> · previewing {cape.name}</span> : null}</span>
      </aside>
    </div>
  );
}
