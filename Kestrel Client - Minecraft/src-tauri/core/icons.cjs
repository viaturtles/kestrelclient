// Renders the in-game icons (Lucide, ISC licence), the Kestrel bird and the news picture to PNG.
// Run: node icons.cjs   (needs the "sharp" package; set SHARP to its folder if it isn't installed here)
const path = require("path"), fs = require("fs");
const sharp = require(process.env.SHARP || "sharp");
const out = path.join(__dirname, "res", "kestrel", "icons");
fs.mkdirSync(out, { recursive: true });

const ICONS = {
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  blocks: '<rect width="7" height="7" x="14" y="3" rx="1"/><path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3"/>',
  shirt: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
  layout: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  click: '<path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/>',
  compass: '<path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/><circle cx="12" cy="12" r="10"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
};

// More icons straight from the launcher's lucide-react package (same ISC licence), by Lucide name.
const LUCIDE = ["zoom-in", "sun", "crosshair", "box", "heart-crack", "footprints", "repeat", "party-popper", "bell", "wifi", "activity",
  "keyboard", "navigation", "camera", "message-square", "folder-open", "image", "copy", "log-out", "palette"];
const toSvg = ([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}="${v}"`).join(" ")}/>`;
for (const name of LUCIDE) {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "node_modules", "lucide-react", "dist", "esm", "icons", name + ".js"), "utf8");
  const node = Function(`return ${src.slice(src.indexOf("[", src.indexOf("createLucideIcon(")), src.lastIndexOf("]") + 1)}`)();
  ICONS[name] = node.map(toSvg).join("");
}

(async () => {
  for (const [name, body] of Object.entries(ICONS)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(out, name + ".png"));
  }
  // Kestrel bird (same paths as website/assets/kestrel.svg, without the drop shadow).
  const bird = fs.readFileSync(path.join(__dirname, "..", "..", "website", "assets", "kestrel.svg"), "utf8")
    .replace(/filter="[^"]*"/g, "").replace(/<defs>[\s\S]*<\/defs>/, "")
    .replace(/width="[\d.]+" height="[\d.]+"/, 'width="128" height="128"');
  await sharp(Buffer.from(bird)).resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(out, "kestrel.png"));
  // News picture for the main menu card: the left of the sunset art (sun and pillar, no bird).
  const cta = path.join(__dirname, "..", "..", "website", "assets", "cta.webp");
  const meta = await sharp(cta).metadata();
  const cw = Math.round(meta.width * 0.42);
  await sharp(cta).extract({ left: 0, top: 0, width: cw, height: meta.height }).resize(240, 200, { fit: "cover" }).png().toFile(path.join(out, "news.png"));
  console.log("icons:", fs.readdirSync(out).length);
})();
