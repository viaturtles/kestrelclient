// Three Kestrel commissions, each a far landscape layer + a close-up kestrel layer.
// Usage: node commissions.js <windhover|nightwatch|firstlight|all> <outDir> [preview]
const V = require("./vox3d");
const { kestrel, BOUNDS } = require("./kestrel");
const path = require("path");
const { World, placeShape, hash3, fbm, hex, jit, clamp } = V;
const [, , which = "all", OUT = ".", mode = ""] = process.argv;
const PREVIEW = mode === "preview";
const FW = 2560, FH = 1440;

function camR(yaw, pitch) { const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch); return [[cy, -sy, 0], [sy * cp, cy * cp, -sp], [sy * sp, cy * sp, cp]]; }
function camDir(yaw, pitch, v) { const R = camR(yaw, pitch); return [R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2], R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2], R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2]]; }
function makeView(yaw, pitch, scale, anchor) {
  const R = camR(yaw, pitch), P = anchor.p;
  const X = (x, y) => R[0][0] * x + R[0][1] * y, Z = (x, y, z) => R[2][0] * x + R[2][1] * y + R[2][2] * z;
  const AX = X(P[0], P[1]), AZ = Z(P[0], P[1], P[2]);
  const D = (x, y, z) => R[1][0] * x + R[1][1] * y + R[1][2] * z, AD = D(P[0], P[1], P[2]);
  return (x, y, z) => [anchor.at[0] * FW + (X(x, y) - AX) * scale, anchor.at[1] * FH - (Z(x, y, z) - AZ) * scale, D(x, y, z) - AD];
}
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

function terrain(w, o) {
  const { x0, x1, y0, y1, view } = o, NX = x1 - x0 + 1, NY = y1 - y0 + 1, hs = new Int16Array(NX * NY).fill(-999);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const h = Math.round(o.height(x, y));
    if (view) { const [sx, sy, d] = view(x, y, h); if (sx < -120 || sx > FW + 120 || sy > FH + 120 || sy < -300 || (o.maxDepth && d > o.maxDepth)) continue; }
    hs[(y - y0) * NX + (x - x0)] = h;
  }
  const H = (x, y) => (x < x0 || x > x1 || y < y0 || y > y1 ? -999 : hs[(y - y0) * NX + (x - x0)]);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const h = H(x, y); if (h === -999) continue;
    let lo = Math.min(H(x + 1, y), H(x - 1, y), H(x, y + 1), H(x, y - 1)); if (lo === -999) lo = h - 6;
    for (let z = Math.min(h, lo - 1); z <= h; z++) { const c = z === h ? o.top(x, y, h) : o.sub(x, y, z, h); w.set(x, y, z, c, c[3] || 0); }
    if (o.decor) o.decor(x, y, h, H);
  }
  return H;
}
function oak(w, x, y, z, s = 1, seed = 1) {
  const th = Math.round(4 * s + hash3(x, y, 1, seed) * 2);
  for (let k = 1; k <= th; k++) w.set(x, y, z + k, jit(hex("#5B4330"), hash3(x, y, z + k, 3)));
  const r = 3.4 * s, cz = z + th + 1.2;
  for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) for (let dz = -4; dz <= 5; dz++) {
    const d = Math.hypot(dx / r, dy / r, dz / (r * 0.8)) + (hash3(x + dx, y + dy, cz + dz, seed) - 0.5) * 0.3;
    if (d < 1) { const hh = hash3(x + dx, y + dy, cz + dz, 9); w.set(x + dx, y + dy, Math.round(cz + dz), hh < 0.3 ? hex("#2F5A28") : hh < 0.65 ? hex("#386B2E") : hex("#427833")); }
  }
}
function spruce(w, x, y, z, hgt = 12, seed = 2, dark = false) {
  for (let k = 1; k <= hgt; k++) w.set(x, y, z + k, hex("#4A3426"));
  for (let k = 3; k <= hgt + 2; k++) {
    const r = Math.max(0, Math.round((hgt + 2 - k) * 0.42 + ((k % 3) === 0 ? 0.8 : 0)));
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (Math.abs(dx) + Math.abs(dy) <= r + 0.3 && (dx || dy || k > hgt))
      w.set(x + dx, y + dy, z + k, hash3(x + dx, y + dy, k, seed) < 0.4 ? hex(dark ? "#183326" : "#1F3F2C") : hex(dark ? "#1E3D2E" : "#28503A"));
  }
}

// =====================================================================
// 1. WINDHOVER — hovering into the sunset, farmland far below
// =====================================================================
function windhover() {
  // Far layer: farmland seen from the sky
  const byaw = 0.42, bpitch = 0.3, bscale = 4, w = new World();
  const banchor = { p: [0, 0, 14], at: [0.5, 0.95] }, view = makeView(byaw, bpitch, bscale, banchor);
  const fieldOf = (x, y) => { const xw = x + 18 * (fbm(x * 0.012, y * 0.012, 41) - 0.5), yw = y + 18 * (fbm(x * 0.012 + 9, y * 0.012, 42) - 0.5); return [Math.floor(xw / 70), Math.floor(yw / 52)]; };
  const kind = (f) => { const h = hash3(f[0], f[1], 0, 77); return h < 0.3 ? "wheat" : h < 0.42 ? "plough" : h < 0.92 ? "meadow" : "flowers"; };
  const riverX = (y) => 60 + 80 * Math.sin(y * 0.008) + 26 * Math.sin(y * 0.021 + 1);
  const isRiver = (x, y) => Math.abs(x - riverX(y)) < 6 + 2 * Math.sin(y * 0.05);
  const ground = (x, y) => 12 + 5 * fbm(x * 0.014, y * 0.014, 3) + 10 * fbm(x * 0.005 + 5, y * 0.005, 9) + smooth(300, 520, y) * 26 * fbm(x * 0.008, y * 0.008, 15);
  const height = (x, y) => (isRiver(x, y) ? Math.round(ground(riverX(y), y)) - 2 : ground(x, y));
  terrain(w, {
    x0: -480, x1: 620, y0: -300, y1: 620, height, view, maxDepth: 540,
    top: (x, y, h) => {
      if (isRiver(x, y)) return [0.98, 0.8, 0.56, 0.3];
      if (Math.abs(x - riverX(y)) < 8.5) return jit(hex("#8C9A54"), hash3(x, y, h, 4));
      const k = kind(fieldOf(x, y)), r = hash3(x, y, h, 5);
      if (k === "plough") return (x + 2 * y) % 4 < 2 ? jit(hex("#5E412B"), r) : jit(hex("#6E4D33"), r);
      if (k === "wheat") return jit(hex("#8C8A40"), r);
      return r < 0.2 ? hex("#5E8D3E") : r < 0.55 ? hex("#679842") : hex("#70A146");
    },
    sub: (x, y, z, h) => (h - z < 3 ? jit(hex("#6B4A31"), hash3(x, y, z, 6)) : jit(hex("#6E6C6A"), hash3(x, y, z, 6))),
    decor: (x, y, h) => {
      if (Math.abs(x - riverX(y)) < 8.5) { if (!isRiver(x, y) && hash3(x, y, 0, 12) < 0.02) oak(w, x, y, h, 1.1, x + y); return; }
      const f = fieldOf(x, y), k = kind(f), r = hash3(x, y, 0, 8);
      if (fieldOf(x + 1, y)[0] !== f[0] || fieldOf(x, y + 1)[1] !== f[1]) {
        if (hash3(f[0], f[1], Math.floor((x + y) / 11), 3) < 0.2) return;
        w.set(x, y, h + 1, r < 0.5 ? hex("#2E5426") : hex("#36602C")); if (r < 0.5) w.set(x, y, h + 2, hex("#3A6830"));
        if (r < 0.003) oak(w, x, y, h, 1 + hash3(x, y, 2, 4) * 0.5, x * 7 + y);
        return;
      }
      if (k === "wheat") { w.set(x, y, h + 1, jit(r < 0.5 ? hex("#E3BC5C") : hex("#D9AE4E"), hash3(x, y, 1, 9))); if (r < 0.2) w.set(x, y, h + 2, hex("#ECCB72")); }
      else if (k === "flowers" && r < 0.05) w.set(x, y, h + 1, r < 0.02 ? hex("#E04A3A") : r < 0.035 ? hex("#F2D04A") : hex("#F2EEE6"));
      else if (k === "meadow" && r < 0.0005) oak(w, x, y, h, 1.25, x + y * 3);
    },
  });
  const sun = { x: 0.3, y: 0.47 };
  const bg = {
    world: w, yaw: byaw, pitch: bpitch, scale: bscale, anchor: banchor,
    light: { dir: camDir(byaw, bpitch, [-0.5, 0.7, 0.5]), color: [1.2, 0.86, 0.56], ambient: [0.52, 0.46, 0.64], ground: [0.32, 0.26, 0.26], fill: { dir: camDir(byaw, bpitch, [0.3, -1, 0.35]), color: [0.26, 0.22, 0.24] } },
    fog: { start: 0, pow: 1.4, max: 1 }, glowRadius: 28, glowFromBg: { threshold: 0.86, k: 2.2 },
    paintBg: (c, W, H) => {
      c.vgrad([[0, hex("#252946")], [0.2, hex("#4C4064")], [0.34, hex("#B6727A")], [0.44, hex("#F0A06A")], [0.52, hex("#FFCB86")], [1, hex("#F8BC7C")]]); c.markFog();
      const blk = Math.round(W / 320);
      const sx = sun.x * W, sy = sun.y * H, sr = 0.045 * W;
      c.glow(sx, sy, sr * 10, [1.0, 0.6, 0.3], 0.55); c.glow(sx, sy, sr * 3.2, [1.0, 0.85, 0.55], 0.6);
      c.pixelDisc(sx, sy, sr, blk * 2, () => [1.0, 0.97, 0.84]);
    },
  };
  // Near layer: the kestrel, seen from behind, hovering into the sun
  const fw = new World(), fyaw = 0.42, fpitch = 0.24, bird = [0, 0, 0];
  placeShape(fw, kestrel({ tilt: 0.5, headTilt: -0.4, wings: "open", dih: 0.3, fwd: 0.12, fan: 0.85 }), { origin: bird, res: 2.2, yaw: 1.2 - fyaw, bounds: BOUNDS });
  const fg = {
    world: fw, yaw: fyaw, pitch: fpitch, scale: 6.6, anchor: { p: bird, at: [0.66, 0.31] },
    light: { dir: camDir(fyaw, fpitch, [-0.5, 0.66, 0.55]), color: [1.25, 0.88, 0.58], ambient: [0.56, 0.48, 0.64], ground: [0.38, 0.3, 0.3], fill: { dir: camDir(fyaw, fpitch, [0.3, -1, 0.35]), color: [0.3, 0.24, 0.26] } },
    vignette: 0.3, glowRadius: 22,
  };
  return [bg, fg];
}

// =====================================================================
// 2. NIGHT WATCH — close-up on a fence post, the valley and moon far behind
// =====================================================================
function nightwatch() {
  const byaw = 0.62, bpitch = 0.36, bscale = 3, w = new World();
  const banchor = { p: [0, 160, 30], at: [0.5, 0.62] }, view = makeView(byaw, bpitch, bscale, banchor);
  // We stand on a hilltop: ground falls away into a valley, mountains beyond
  const height = (x, y) => 4 + 5 * fbm(x * 0.02, y * 0.02, 5) + 46 * smooth(90, -60, y) + smooth(130, 300, y) * (14 + 42 * fbm(x * 0.008, y * 0.01, 11));
  terrain(w, {
    x0: -760, x1: 600, y0: -720, y1: 420, height, view,
    top: (x, y, h) => { const r = hash3(x, y, h, 3); return r < 0.2 ? hex("#2E5A3A") : r < 0.6 ? hex("#356541") : hex("#3C6E46"); },
    sub: (x, y, z, h) => (h - z < 3 ? jit(hex("#4D3A2C"), hash3(x, y, z, 4)) : jit(hex("#55565C"), hash3(x, y, z, 4))),
    decor: (x, y, h) => {
      const r = hash3(x, y, 0, 21);
      if (r < 0.012) w.set(x, y, h + 1, hex("#427F4D"));
      if (y > 60 && r > (y > 180 ? 0.985 : 0.996)) spruce(w, x, y, h, 8 + Math.round(hash3(x, y, 1, 2) * 8), x, true);
    },
  });
  // A few warm cottage windows down in the valley
  for (const [x, y] of [[-150, 150], [-60, 190], [120, 170], [40, 230]]) {
    const H0 = Math.round(height(x, y));
    for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 6; dy++) for (let dz = 1; dz <= 5; dz++) w.set(x + dx, y + dy, H0 + dz, hex("#5A4636"));
    for (let dx = -1; dx < 8; dx++) for (let dy = -1; dy < 7; dy++) { const roofH = 6 + Math.min(dy + 1, 6 - dy); for (let dz = 6; dz <= roofH; dz++) w.set(x + dx, y + dy, H0 + dz, hex("#3A2E2E")); }
    w.set(x + 2, y - 1 + 0, H0 + 3, [1, 0.78, 0.42], 1.6); w.set(x + 4, y - 1 + 0, H0 + 3, [1, 0.78, 0.42], 1.6);
    w.del(x + 2, y, H0 + 3); w.del(x + 4, y, H0 + 3); w.set(x + 2, y, H0 + 3, [1, 0.78, 0.42], 1.6); w.set(x + 4, y, H0 + 3, [1, 0.78, 0.42], 1.6);
  }
  const bg = {
    world: w, yaw: byaw, pitch: bpitch, scale: bscale, anchor: banchor,
    light: { dir: camDir(byaw, bpitch, [0.45, 0.75, 0.5]), color: [0.5, 0.58, 0.82], ambient: [0.2, 0.25, 0.42], ground: [0.1, 0.12, 0.2], fill: { dir: camDir(byaw, bpitch, [-0.2, -1, 0.25]), color: [0.1, 0.12, 0.2] } },
    fog: { start: 0, pow: 1.1, max: 0.9 }, glowRadius: 14, glowStrength: 1.3, glowFromBg: { threshold: 0.7, k: 0.9 },
    paintBg: (c, W, H) => {
      c.vgrad([[0, hex("#05070F")], [0.45, hex("#0B1224")], [0.7, hex("#142038")], [1, hex("#1A2840")]]); c.markFog();
      const r = V.rng(9), blk = Math.round(W / 640);
      for (let i = 0; i < 560; i++) { const s = r() < 0.06 ? blk * 2 : blk; c.rect(r() * W, r() * H * 0.7, s, s, [0.9, 0.92, 1], 0.25 + r() * 0.6); }
      const mx = 0.62 * W, my = 0.34 * H, mr = 0.15 * H, mb = Math.round(W / 256);
      c.glow(mx, my, mr * 4.2, [0.35, 0.45, 0.7], 0.45); c.glow(mx, my, mr * 1.8, [0.7, 0.75, 0.85], 0.35);
      c.pixelDisc(mx, my, mr, mb, (bx, by) => {
        const h = hash3(Math.floor(bx / 2), Math.floor(by / 2), 0, 3), crater = hash3(Math.floor(bx / 5), Math.floor(by / 5), 1, 4);
        return crater < 0.22 ? [0.82, 0.81, 0.76] : h < 0.25 ? [0.9, 0.89, 0.82] : [0.97, 0.95, 0.88];
      });
    },
  };
  // Close-up: weathered post, rail, hanging lantern, the kestrel on top
  const fw = new World(), fyaw = 0.5, fpitch = 0.1, wood = hex("#7A5A3B"), wood2 = hex("#664A30"), woodD = hex("#4E3826"), moss = hex("#4E6B3A");
  const PS = 16;
  for (let x = 0; x < PS; x++) for (let y = 0; y < PS; y++) for (let z = -170; z <= 0; z++) {
    const edge = x === 0 || y === 0 || x === PS - 1 || y === PS - 1; if (edge && (x === y || x + y === PS - 1) && z > -3) continue; // worn corners
    if (!edge && z < 0) continue;
    const grain = (x * 3 + y * 5) % 7 === 0 || hash3(x, y, Math.floor(z / 9), 3) < 0.08, h = hash3(x, y, z, 2);
    let c = grain ? woodD : h < 0.35 ? wood2 : wood;
    if (z === 0 && h < 0.18) c = moss;
    fw.set(x, y, z, jit(c, hash3(x, y, z, 5), 0.1));
  }
  // Rails running off to the left into the dark
  for (const [zt, zb] of [[-20, -34], [-96, -110]]) for (let x = -260; x < 0; x++) for (let y = 4; y < 11; y++) for (let z = zb; z <= zt; z++) {
    if (y > 4 && y < 10 && z > zb && z < zt) continue;
    fw.set(x, y, z, jit((x * 7 + z) % 13 === 0 ? woodD : hash3(x, y, z, 6) < 0.4 ? wood2 : wood, hash3(x, y, z, 8), 0.1));
  }
  // Lantern on an iron hook under the top rail
  const iron = hex("#26272C"), ironL = hex("#3A3B42"), glass = [1.0, 0.72, 0.34], LX = -36, LY = 1, LZ = -35;
  for (let z = LZ; z > LZ - 6; z--) fw.set(LX + 6, LY + 6, z, iron);
  for (let x = 0; x < 13; x++) for (let y = 0; y < 13; y++) for (let z = 0; z < 22; z++) {
    const ex = x === 0 || x === 12, ey = y === 0 || y === 12, ez = z < 3 || z > 18;
    if (!(ex || ey || ez)) continue;
    const frame = (ex && ey) || ez || (ex && (y === 6)) || (ey && (x === 6));
    if (z > 18) { const inset = z - 18; if (x < inset || x > 12 - inset || y < inset || y > 12 - inset) continue; }
    fw.set(LX + x, LY + y, LZ - 27 + z, frame ? (z > 19 ? ironL : iron) : glass, frame ? 0 : 1.6);
  }
  
  // The kestrel
  const res = 2.25, bird = [PS / 2, PS / 2, 1 + 5.2 * res];
  placeShape(fw, kestrel({ tilt: 1.1, headTilt: 0.05, wings: "folded", feet: true, feetZ: -5.2, fan: 0 }), { origin: bird, res, yaw: Math.PI / 2 - fyaw - 0.42, bounds: BOUNDS });
  const fire = [], rr = V.rng(5);
  for (let i = 0; i < 60; i++) { const x = rr(), y = 0.45 + rr() * 0.52; if (x > 0.55 && x < 0.8) continue; fire.push({ x, y, size: 2 + rr() * 3.5, color: rr() < 0.75 ? [0.62, 1.0, 0.6] : [0.9, 1.0, 0.55], glow: 1.4 }); }
  const fg = {
    world: fw, yaw: fyaw, pitch: fpitch, scale: 9.6, anchor: { p: bird, at: [0.675, 0.44] },
    light: {
      dir: camDir(fyaw, fpitch, [0.5, 0.7, 0.5]), color: [0.6, 0.68, 0.92], ambient: [0.16, 0.2, 0.34], ground: [0.08, 0.1, 0.16],
      fill: { dir: camDir(fyaw, fpitch, [-0.2, -1, 0.2]), color: [0.1, 0.12, 0.2] },
      points: [{ pos: [LX + 6.5, LY + 6.5, LZ - 16], color: [3.2, 1.8, 0.8], radius: 240 }],
    },
    sprites: fire, vignette: 0.45, glowRadius: 20, glowStrength: 1.3,
  };
  return [bg, fg];
}

// =====================================================================
// 3. FIRST LIGHT — gliding above a sea of clouds at sunrise
// =====================================================================
function firstlight() {
  const byaw = 0.3, bpitch = 0.4, bscale = 3.6, w = new World();
  const banchor = { p: [0, 100, 20], at: [0.5, 0.62] }, view = makeView(byaw, bpitch, bscale, banchor);
  const r = V.rng(77), blobs = [];
  for (let i = 0; i < 1300; i++) blobs.push([-760 + r() * 1360, -760 + r() * 1200, 14 + r() * 30, 6 + r() * 16]);
  const grid = new Map(); for (const b of blobs) { const k = Math.floor(b[0] / 50) + "," + Math.floor(b[1] / 50); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b); }
  const cloudTop = (x, y) => {
    const bank = 0, n = 2.4 * fbm(x * 0.09, y * 0.09, 23, 2);
    let h = 8 + 4 * fbm(x * 0.012, y * 0.012, 21, 2) + bank + n;
    const gx = Math.floor(x / 50), gy = Math.floor(y / 50);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [bx, by, br, bh] of grid.get(gx + i + "," + (gy + j)) || []) {
      const d = Math.hypot(x - bx, y - by) / br; if (d < 1) h = Math.max(h, 7 + bh * Math.sqrt(1 - d * d) + bank + n);
    }
    return h;
  };
  terrain(w, {
    x0: -760, x1: 600, y0: -760, y1: 440, height: cloudTop, view, maxDepth: 300,
    top: (x, y, h) => (hash3(x, y, h, 31) < 0.3 ? hex("#F6F3F8") : hex("#FDFBFD")),
    sub: (x, y, z, h) => (h - z < 2 ? hex("#EEE9F4") : hex("#E2DBEE")),
  });
  const spire = (sx, sy, height, r0, seed) => {
    for (let z = -2; z <= height; z++) {
      const rr = r0 * (1 - (z / height) * 0.45) + 2.6 * (fbm(z * 0.1, seed, seed) - 0.5);
      for (let dx = -Math.ceil(rr + 3); dx <= rr + 3; dx++) for (let dy = -Math.ceil(rr + 3); dy <= rr + 3; dy++) {
        const a = Math.atan2(dy, dx), wob = 2.8 * (fbm(a * 1.6 + 10, z * 0.08, seed + 1) - 0.5);
        if (Math.hypot(dx, dy) > rr + wob) continue;
        const x = sx + dx, y = sy + dy, h = hash3(x, y, z, seed);
        let c = h < 0.25 ? hex("#6F6E73") : h < 0.6 ? hex("#7D7B80") : hex("#8B888C");
        if (z === height) c = h < 0.5 ? hex("#5E8F45") : hex("#6A9C4C"); else if (z > height - 3 && h < 0.5) c = hex("#5C7F45");
        w.set(x, y, z, c);
      }
    }
  };
  spire(150, 150, 120, 17, 3);
  spruce(w, 152, 147, 120, 10, 5); spruce(w, 144, 154, 120, 7, 6); spruce(w, 158, 155, 120, 6, 8);
  spire(-230, 330, 70, 11, 7);
  const glide = (yaw) => Math.atan2(-Math.cos(yaw), -Math.sin(yaw)) + Math.PI + 0.35;
  placeShape(w, kestrel({ tilt: 0.04, wings: "open", dih: 0.1, fan: 0.1 }), { origin: [-170, 110, 150], res: 1.0, yaw: glide(byaw) + 0.2, roll: -0.12, bounds: BOUNDS });
  const bg = {
    world: w, yaw: byaw, pitch: bpitch, scale: bscale, anchor: banchor,
    light: { dir: camDir(byaw, bpitch, [-0.8, 0.45, 0.55]), color: [1.15, 0.8, 0.66], ambient: [0.64, 0.68, 0.88], ground: [0.52, 0.46, 0.58], fill: { dir: camDir(byaw, bpitch, [0.3, -1, 0.2]), color: [0.14, 0.13, 0.18] } },
    fog: { start: 0, pow: 1.3, max: 0.96 }, glowRadius: 30, glowFromBg: { threshold: 0.92, k: 1.2 },
    paintBg: (c, W, H) => {
      c.vgrad([[0, hex("#2C3E66")], [0.12, hex("#5E6E9C")], [0.22, hex("#C9A0B6")], [0.3, hex("#F7BFA2")], [0.38, hex("#FFDDB0")], [1, hex("#F6CDB8")]]); c.markFog();
      const sx = 0.13 * W, sy = 0.27 * H, sr = 0.04 * W, blk = Math.round(W / 320);
      c.glow(sx, sy, sr * 9, [1.0, 0.6, 0.45], 0.28); c.glow(sx, sy, sr * 2.8, [1.0, 0.85, 0.62], 0.3);
      c.pixelDisc(sx, sy, sr, blk * 2, () => [1.0, 0.98, 0.88]);
    },
  };
  const fw = new World(), fyaw = 0.3, fpitch = 0.17, bird = [0, 0, 0];
  placeShape(fw, kestrel({ tilt: 0.06, wings: "open", dih: 0.07, fan: 0.08, wingDroop: 0.04 }), { origin: bird, res: 2.0, yaw: glide(fyaw), roll: -0.22, bounds: BOUNDS });
  const fg = {
    world: fw, yaw: fyaw, pitch: fpitch, scale: 7.2, anchor: { p: bird, at: [0.54, 0.35] },
    light: { dir: camDir(fyaw, fpitch, [-0.8, 0.5, 0.36]), color: [1.15, 0.8, 0.66], ambient: [0.64, 0.68, 0.88], ground: [0.52, 0.46, 0.58], fill: { dir: camDir(fyaw, fpitch, [0.3, -1, 0.2]), color: [0.14, 0.13, 0.18] } },
    vignette: 0.22, glowRadius: 24,
  };
  return [bg, fg];
}

(async () => {
  const scenes = { windhover, nightwatch, firstlight };
  for (const name of which === "all" ? Object.keys(scenes) : which.split(",")) {
    const t = Date.now(), [bg, fg] = scenes[name]();
    const W = PREVIEW ? 1280 : FW, H = PREVIEW ? 720 : FH, ss = PREVIEW ? 1 : 2, k = W / FW;
    const back = await V.render(bg.world, { ...bg, W, H, ss, scale: bg.scale * k, raw: true });
    const r = await V.render(fg.world, { ...fg, W, H, ss, scale: fg.scale * k, bgBuffer: back.buf, out: path.join(OUT, `${name}${PREVIEW ? "-preview" : ""}.jpg`) });
    console.log(name, back.faces + r.faces, "voxels", ((Date.now() - t) / 1000).toFixed(1) + "s");
  }
})();
