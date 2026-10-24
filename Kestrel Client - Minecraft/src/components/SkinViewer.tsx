import { useEffect, useRef } from "react";
import { IdleAnimation, SkinViewer as Viewer, WalkingAnimation } from "skinview3d";

/** First frame of an animated cape sheet (frames stacked top to bottom), as a data URL; plain capes pass through. */
async function firstFrame(url: string, frames: number): Promise<string> {
  if (frames <= 1) return url;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalWidth / 2;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return c.toDataURL("image/png");
}

/** Lunar-style 3D player preview (skinview3d): drag to turn, idle or walking. */
export function SkinViewer({ skin, slim, cape, frames = 1, walking }: { skin: string; slim?: boolean; cape: string | null; frames?: number; walking: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<Viewer | null>(null);

  useEffect(() => {
    const v = new Viewer({ canvas: canvas.current!, width: 300, height: 400, skin, zoom: 0.5, fov: 38 });
    v.background = null;
    v.autoRotate = false;
    v.controls.enableZoom = false;
    v.playerObject.rotation.y = 0.5;
    viewer.current = v;
    // Keep the canvas the size of its box.
    const ro = new ResizeObserver(() => { const r = host.current!.getBoundingClientRect(); if (r.width && r.height) v.setSize(r.width, r.height); });
    ro.observe(host.current!);
    return () => { ro.disconnect(); v.dispose(); viewer.current = null; };
  }, []);
  useEffect(() => { viewer.current?.loadSkin(skin, { model: slim === undefined ? "auto-detect" : slim ? "slim" : "default" })?.catch?.(() => {}); }, [skin, slim]);
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    if (!cape) { v.resetCape(); v.playerObject.rotation.y = 0.5; return; }
    // Turn round to show the cape (three-quarter back view); dragging still works from there.
    v.playerObject.rotation.y = Math.PI - 0.55;
    firstFrame(cape, frames).then((u) => v.loadCape(u)).catch(() => v.resetCape());
  }, [cape, frames]);
  useEffect(() => { if (viewer.current) viewer.current.animation = walking ? new WalkingAnimation() : new IdleAnimation(); }, [walking]);

  return <div ref={host} className="skin-viewer"><canvas ref={canvas} /></div>;
}

/**
 * A cape on its own in 3D (CSS, no WebGL), cut from its Minecraft texture: outside, inside, edges, top and bottom.
 * `width` is the cape's width in pixels; it turns a little more on hover.
 */
export function CapeModel({ url, frames = 1, width, pixelArt }: { url: string; frames?: number; width: number; pixelArt?: boolean }) {
  const s = width / 10; // one cape pixel
  // Mojang's 64x32 capes are pixel art: scale them up with hard pixels, not blur.
  const face = (x: number, y: number, w: number, h: number, transform: string) => (
    <i style={{ width: w * s, height: h * s, marginLeft: (-w * s) / 2, marginTop: (-h * s) / 2, transform, backgroundImage: `url("${url}")`, backgroundSize: `${64 * s}px ${32 * s * frames}px`, backgroundPosition: `${-x * s}px ${-y * s}px`, imageRendering: pixelArt ? "pixelated" : "auto" }} />
  );
  const d = s / 2;
  return (
    <span className="cape-3d" style={{ width: width, height: 16 * s }}>
      <span className="cape-3d-body">
        {face(1, 1, 10, 16, `translateZ(${d}px)`)}
        {face(12, 1, 10, 16, `rotateY(180deg) translateZ(${d}px)`)}
        {face(11, 1, 1, 16, `rotateY(90deg) translateZ(${5 * s}px)`)}
        {face(0, 1, 1, 16, `rotateY(-90deg) translateZ(${5 * s}px)`)}
        {face(1, 0, 10, 1, `rotateX(90deg) translateZ(${8 * s}px)`)}
        {face(11, 0, 10, 1, `rotateX(-90deg) translateZ(${8 * s}px)`)}
      </span>
    </span>
  );
}
