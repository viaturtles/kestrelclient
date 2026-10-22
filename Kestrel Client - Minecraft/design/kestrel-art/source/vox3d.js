// Tiny voxel renderer: orthographic z-buffer raster, per-vertex AO, shadow map, fog, glow.
const sharp = require(process.env.LOCALAPPDATA + "/Temp/kz_conv/node_modules/sharp");

// ---------- utils ----------
function hash3(x, y, z, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1440662683) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; h = Math.imul(h, 2246822519 | 0); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash3(xi, yi, 0, seed), b = hash3(xi + 1, yi, 0, seed), c = hash3(xi, yi + 1, 0, seed), d = hash3(xi + 1, yi + 1, 0, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, seed, oct = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, seed + i * 17); n += a; a *= 0.5; f *= 2.03; } return s / n; }
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const jit = (c, h, amt = 0.12) => mul(c, 1 + (h - 0.5) * amt);
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const rotX = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
const rotZ = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; };

// ---------- world ----------
class World {
  constructor() { this.m = new Map(); }
  key(x, y, z) { return ((x + 4096) * 8192 + (y + 4096)) * 8192 + (z + 4096); }
  set(x, y, z, c, e = 0) { this.m.set(this.key(x, y, z), [x, y, z, c[0], c[1], c[2], e]); }
  has(x, y, z) { return this.m.has(this.key(x, y, z)); }
  get(x, y, z) { return this.m.get(this.key(x, y, z)); }
  del(x, y, z) { this.m.delete(this.key(x, y, z)); }
}

/** Samples an implicit shape f(lx,ly,lz,wx,wy,wz)->color|null into the world. */
function placeShape(world, f, o) {
  const { origin, res = 1, yaw = 0, roll = 0, pitch = 0, bounds } = o;
  const toLocal = (wx, wy, wz) => {
    let d = [(wx - origin[0]) / res, (wy - origin[1]) / res, (wz - origin[2]) / res];
    d = rotZ(d, -yaw); d = rotY(d, -roll); d = rotX(d, -pitch); return d;
  };
  const toWorld = (l) => { let d = rotX(l, pitch); d = rotY(d, roll); d = rotZ(d, yaw); return [d[0] * res + origin[0], d[1] * res + origin[1], d[2] * res + origin[2]]; };
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const x of bounds[0]) for (const y of bounds[1]) for (const z of bounds[2]) { const w = toWorld([x, y, z]); for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], w[i]); mx[i] = Math.max(mx[i], w[i]); } }
  let n = 0;
  for (let wx = Math.floor(mn[0]); wx <= Math.ceil(mx[0]); wx++) for (let wy = Math.floor(mn[1]); wy <= Math.ceil(mx[1]); wy++) for (let wz = Math.floor(mn[2]); wz <= Math.ceil(mx[2]); wz++) {
    const l = toLocal(wx + 0.5, wy + 0.5, wz + 0.5);
    const c = f(l[0], l[1], l[2], wx, wy, wz);
    if (c) { world.set(wx, wy, wz, c, c[3] || 0); n++; }
  }
  return n;
}

// ---------- background painting helpers (Uint8 RGB at render res) ----------
class Canvas {
  constructor(W, H) { this.W = W; this.H = H; this.d = new Float32Array(W * H * 3); this.fogD = null; }
  /** Remember the current sky (before sun/moon) as the fog colour. */
  markFog() { this.fogD = this.d.slice(); }
  vgrad(stops) { // stops: [[v, [r,g,b]], ...]
    const { W, H, d } = this;
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1); let i = 0; while (i < stops.length - 2 && v > stops[i + 1][0]) i++;
      const [v0, c0] = stops[i], [v1, c1] = stops[i + 1]; const c = mixc(c0, c1, clamp((v - v0) / (v1 - v0)));
      for (let x = 0; x < W; x++) { const k = (y * W + x) * 3; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; }
    }
  }
  rect(x, y, w, h, c, a = 1) {
    const { W, H, d } = this;
    for (let yy = Math.max(0, Math.round(y)); yy < Math.min(H, Math.round(y + h)); yy++) for (let xx = Math.max(0, Math.round(x)); xx < Math.min(W, Math.round(x + w)); xx++) {
      const k = (yy * W + xx) * 3; d[k] += (c[0] - d[k]) * a; d[k + 1] += (c[1] - d[k + 1]) * a; d[k + 2] += (c[2] - d[k + 2]) * a;
    }
  }
  /** Blocky (pixel-art) disc. fn(dx,dy)->color lets you texture it. */
  pixelDisc(cx, cy, r, block, fn, a = 1) {
    for (let by = -Math.ceil(r / block); by <= Math.ceil(r / block); by++) for (let bx = -Math.ceil(r / block); bx <= Math.ceil(r / block); bx++) {
      const px = (bx + 0.5) * block, py = (by + 0.5) * block;
      if (px * px + py * py > r * r) continue;
      this.rect(cx + bx * block, cy + by * block, block, block, fn(bx, by), a);
    }
  }
  /** Soft radial glow added (not blended). */
  glow(cx, cy, r, c, k = 1) {
    const { W, H, d } = this;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(H, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(W, Math.ceil(cx + r)); x++) {
      const t = Math.hypot(x - cx, y - cy) / r; if (t >= 1) continue; const g = (1 - t) ** 2.2 * k, i = (y * W + x) * 3;
      d[i] += c[0] * g; d[i + 1] += c[1] * g; d[i + 2] += c[2] * g;
    }
  }
}

// ---------- renderer ----------
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const AOL = [0.52, 0.7, 0.86, 1];

async function render(world, o) {
  const ss = o.ss || 2, W = o.W * ss, H = o.H * ss, S = o.scale * ss;
  const cyw = Math.cos(o.yaw), syw = Math.sin(o.yaw), cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
  const R = [[cyw, -syw, 0], [syw * cp, cyw * cp, -sp], [syw * sp, cyw * sp, cp]];
  const toCam = (x, y, z) => [R[0][0] * x + R[0][1] * y, R[1][0] * x + R[1][1] * y + R[1][2] * z, R[2][0] * x + R[2][1] * y + R[2][2] * z];
  const A = toCam(...o.anchor.p); const cx = o.anchor.at[0] * W - A[0] * S, cy = o.anchor.at[1] * H + A[2] * S;
  const proj = (x, y, z) => { const c = toCam(x, y, z); return [cx + c[0] * S, cy - c[2] * S, c[1]]; };

  // Background canvas (painted at render res)
  const bg = new Canvas(W, H);
  if (o.bgBuffer) bg.d.set(o.bgBuffer); else o.paintBg(bg, W, H, ss, proj);
  const glowW = Math.ceil(W / 4), glowH = Math.ceil(H / 4), glow = new Float32Array(glowW * glowH * 3);
  const addGlow = (px, py, c, k) => { const gx = (px / 4) | 0, gy = (py / 4) | 0; if (gx < 0 || gy < 0 || gx >= glowW || gy >= glowH) return; const i = (gy * glowW + gx) * 3; glow[i] += c[0] * k; glow[i + 1] += c[1] * k; glow[i + 2] += c[2] * k; };

  const zb = new Float32Array(W * H).fill(Infinity), cb = new Float32Array(W * H * 3), nb = new Uint8Array(W * H).fill(255), eb = new Float32Array(W * H);
  const camN = DIRS.map((d) => toCam(...d)[1]);
  const L = norm(o.light.dir);

  function tri(v0, v1, v2, col, ni, em) {
    const minX = Math.max(0, Math.floor(Math.min(v0[0], v1[0], v2[0]))), maxX = Math.min(W - 1, Math.ceil(Math.max(v0[0], v1[0], v2[0])));
    const minY = Math.max(0, Math.floor(Math.min(v0[1], v1[1], v2[1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(v0[1], v1[1], v2[1])));
    if (minX > maxX || minY > maxY) return;
    const area = (v1[0] - v0[0]) * (v2[1] - v0[1]) - (v1[1] - v0[1]) * (v2[0] - v0[0]); if (Math.abs(area) < 1e-6) return;
    const inv = 1 / area;
    for (let py = minY; py <= maxY; py++) {
      const y = py + 0.5;
      for (let px = minX; px <= maxX; px++) {
        const x = px + 0.5;
        const w0 = ((v2[0] - v1[0]) * (y - v1[1]) - (v2[1] - v1[1]) * (x - v1[0])) * inv; if (w0 < -1e-4) continue;
        const w1 = ((v0[0] - v2[0]) * (y - v2[1]) - (v0[1] - v2[1]) * (x - v2[0])) * inv; if (w1 < -1e-4) continue;
        const w2 = 1 - w0 - w1; if (w2 < -1e-4) continue;
        const d = w0 * v0[2] + w1 * v1[2] + w2 * v2[2], i = py * W + px; if (d >= zb[i]) continue;
        zb[i] = d; const a = w0 * v0[3] + w1 * v1[3] + w2 * v2[3];
        cb[i * 3] = col[0] * a; cb[i * 3 + 1] = col[1] * a; cb[i * 3 + 2] = col[2] * a; nb[i] = ni; eb[i] = em;
      }
    }
  }
  function quadCorners(v, di) {
    const d = DIRS[di], a = d[0] ? 0 : d[1] ? 1 : 2, s = d[a], b = (a + 1) % 3, c = (a + 2) % 3;
    const out = [];
    for (const [bi, ci] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const p = [v[0], v[1], v[2]]; p[a] = v[a] + (s > 0 ? 1 : 0); p[b] = v[b] + bi; p[c] = v[c] + ci;
      out.push([p, bi ? 1 : -1, ci ? 1 : -1, a, b, c]);
    }
    return out;
  }
  // Camera pass
  for (const v of world.m.values()) {
    for (let di = 0; di < 6; di++) {
      if (camN[di] >= 0) continue; const d = DIRS[di];
      if (world.has(v[0] + d[0], v[1] + d[1], v[2] + d[2])) continue;
      const qs = quadCorners(v, di).map(([p, db, dc, a, b, c]) => {
        let ao = 3;
        if (!v[6]) {
          const base = [v[0] + d[0], v[1] + d[1], v[2] + d[2]];
          const e1 = [0, 0, 0], e2 = [0, 0, 0]; e1[b] = db; e2[c] = dc;
          const s1 = world.has(base[0] + e1[0], base[1] + e1[1], base[2] + e1[2]) ? 1 : 0, s2 = world.has(base[0] + e2[0], base[1] + e2[1], base[2] + e2[2]) ? 1 : 0;
          const cc = world.has(base[0] + e1[0] + e2[0], base[1] + e1[1] + e2[1], base[2] + e1[2] + e2[2]) ? 1 : 0;
          ao = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
        }
        const q = proj(...p); return [q[0], q[1], q[2], AOL[ao]];
      });
      const col = [v[3], v[4], v[5]];
      if (qs[0][3] + qs[2][3] >= qs[1][3] + qs[3][3]) { tri(qs[0], qs[1], qs[2], col, di, v[6]); tri(qs[0], qs[2], qs[3], col, di, v[6]); }
      else { tri(qs[1], qs[2], qs[3], col, di, v[6]); tri(qs[1], qs[3], qs[0], col, di, v[6]); }
    }
  }

  // Shadow map from the key light
  const f = mul(L, -1), up = Math.abs(f[2]) > 0.95 ? [0, 1, 0] : [0, 0, 1], r = norm(cross(f, up)), u = cross(r, f);
  let rmin = 1e9, rmax = -1e9, umin = 1e9, umax = -1e9;
  for (const v of world.m.values()) { const pr = v[0] * r[0] + v[1] * r[1] + v[2] * r[2], pu = v[0] * u[0] + v[1] * u[1] + v[2] * u[2]; rmin = Math.min(rmin, pr); rmax = Math.max(rmax, pr); umin = Math.min(umin, pu); umax = Math.max(umax, pu); }
  rmin -= 3; umin -= 3; rmax += 3; umax += 3;
  const smS = Math.min(12, 4096 / Math.max(rmax - rmin, umax - umin)), SW = Math.ceil((rmax - rmin) * smS), SH = Math.ceil((umax - umin) * smS);
  const sm = new Float32Array(SW * SH).fill(Infinity);
  const lproj = (p) => [(dot(p, r) - rmin) * smS, (umax - dot(p, u)) * smS, dot(p, f)];
  const lightN = DIRS.map((d) => dot(d, L));
  function triS(v0, v1, v2) {
    const minX = Math.max(0, Math.floor(Math.min(v0[0], v1[0], v2[0]))), maxX = Math.min(SW - 1, Math.ceil(Math.max(v0[0], v1[0], v2[0])));
    const minY = Math.max(0, Math.floor(Math.min(v0[1], v1[1], v2[1]))), maxY = Math.min(SH - 1, Math.ceil(Math.max(v0[1], v1[1], v2[1])));
    const area = (v1[0] - v0[0]) * (v2[1] - v0[1]) - (v1[1] - v0[1]) * (v2[0] - v0[0]); if (Math.abs(area) < 1e-6) return; const inv = 1 / area;
    for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
      const x = px + 0.5, y = py + 0.5;
      const w0 = ((v2[0] - v1[0]) * (y - v1[1]) - (v2[1] - v1[1]) * (x - v1[0])) * inv; if (w0 < -1e-3) continue;
      const w1 = ((v0[0] - v2[0]) * (y - v2[1]) - (v0[1] - v2[1]) * (x - v2[0])) * inv; if (w1 < -1e-3) continue;
      const w2 = 1 - w0 - w1; if (w2 < -1e-3) continue;
      const d = w0 * v0[2] + w1 * v1[2] + w2 * v2[2], i = py * SW + px; if (d < sm[i]) sm[i] = d;
    }
  }
  if (o.shadows !== false) for (const v of world.m.values()) {
    if (v[6] >= 1) continue; // emitters cast no shadow
    for (let di = 0; di < 6; di++) {
      if (lightN[di] <= 0) continue; const d = DIRS[di];
      if (world.has(v[0] + d[0], v[1] + d[1], v[2] + d[2])) continue;
      const qs = quadCorners(v, di).map(([p]) => lproj(p));
      triS(qs[0], qs[1], qs[2]); triS(qs[0], qs[2], qs[3]);
    }
  }

  // Compose
  if (o.fog && o.fog.end == null) { // auto: fully fogged at the farthest visible surface
    let mx = -Infinity; for (let i = 0; i < zb.length; i += 7) if (zb[i] !== Infinity && zb[i] > mx) mx = zb[i];
    o.fog = { ...o.fog, end: mx };
  }
  const out = new Float32Array(W * H * 3);
  const amb = o.light.ambient, ambG = o.light.ground || amb, key = o.light.color, fill = o.light.fill, F = fill ? norm(fill.dir) : null;
  const pts = o.light.points || [];
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const i = py * W + px, k = i * 3, d = zb[i];
    if (d === Infinity) { out[k] = bg.d[k]; out[k + 1] = bg.d[k + 1]; out[k + 2] = bg.d[k + 2]; continue; }
    const n = DIRS[nb[i]], X = (px + 0.5 - cx) / S, Z = (cy - (py + 0.5)) / S;
    const w = [R[0][0] * X + R[1][0] * d + R[2][0] * Z, R[0][1] * X + R[1][1] * d + R[2][1] * Z, R[1][2] * d + R[2][2] * Z];
    let ndl = dot(n, L), sh = 0;
    if (ndl > 0 && o.shadows !== false) {
      const q = lproj([w[0] + n[0] * 0.35, w[1] + n[1] * 0.35, w[2] + n[2] * 0.35]); let lit = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const sx = Math.round(q[0]) + ox * 2, sy = Math.round(q[1]) + oy * 2;
        if (sx < 0 || sy < 0 || sx >= SW || sy >= SH || q[2] - 0.2 <= sm[sy * SW + sx]) lit++;
      }
      sh = lit / 9;
    } else if (ndl > 0) sh = 1;
    const t = (n[2] + 1) / 2;
    let lr = ambG[0] + (amb[0] - ambG[0]) * t, lg = ambG[1] + (amb[1] - ambG[1]) * t, lb = ambG[2] + (amb[2] - ambG[2]) * t;
    if (ndl > 0) { lr += key[0] * ndl * sh; lg += key[1] * ndl * sh; lb += key[2] * ndl * sh; }
    if (F) { const fd = Math.max(0, dot(n, F)); lr += fill.color[0] * fd; lg += fill.color[1] * fd; lb += fill.color[2] * fd; }
    for (const p of pts) {
      const vx = p.pos[0] - w[0], vy = p.pos[1] - w[1], vz = p.pos[2] - w[2], dist = Math.hypot(vx, vy, vz) + 1e-6;
      if (dist > p.radius) continue; const att = (1 - dist / p.radius) ** 2, nd = Math.max(0, (n[0] * vx + n[1] * vy + n[2] * vz) / dist) * 0.8 + 0.2;
      lr += p.color[0] * att * nd; lg += p.color[1] * att * nd; lb += p.color[2] * att * nd;
    }
    let cr = cb[k] * lr, cg = cb[k + 1] * lg, cbb = cb[k + 2] * lb;
    const em = eb[i]; if (em > 0) { cr = cb[k] * (0.6 + em); cg = cb[k + 1] * (0.6 + em); cbb = cb[k + 2] * (0.6 + em); addGlow(px, py, [cb[k], cb[k + 1], cb[k + 2]], em * 0.08); }
    // Fog toward the sky colour behind the pixel
    if (o.fog) {
      let fa = clamp((d - o.fog.start) / (o.fog.end - o.fog.start)); fa = fa ** (o.fog.pow || 1);
      if (o.fog.height) fa = Math.max(fa, clamp((o.fog.height.top - w[2]) / o.fog.height.range) * o.fog.height.amount);
      fa *= o.fog.max ?? 1;
      const fd = bg.fogD || bg.d, fc = o.fog.color || [fd[k], fd[k + 1], fd[k + 2]];
      cr += (fc[0] - cr) * fa; cg += (fc[1] - cg) * fa; cbb += (fc[2] - cbb) * fa;
    }
    out[k] = cr; out[k + 1] = cg; out[k + 2] = cbb;
  }
  // Sprites drawn on top (fireflies, sparkles) + their glow
  for (const s of o.sprites || []) {
    const sx = s.x * W, sy = s.y * H, sz = s.size * ss;
    if (s.depth != null) { const zi = Math.round(sy) * W + Math.round(sx); if (zi >= 0 && zi < W * H && zb[zi] < s.depth) continue; }
    for (let y = Math.round(sy - sz / 2); y < Math.round(sy + sz / 2); y++) for (let x = Math.round(sx - sz / 2); x < Math.round(sx + sz / 2); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue; const k = (y * W + x) * 3; out[k] = s.color[0]; out[k + 1] = s.color[1]; out[k + 2] = s.color[2];
    }
    for (let a = 0; a < 6; a++) addGlow(sx + (a % 3 - 1) * 4, sy + ((a / 3) | 0) * 4, s.color, s.glow ?? 0.6);
  }
  // Glow: blur the quarter-res buffer (3 box passes) and add
  if (o.glowFromBg) for (let y = 0; y < glowH; y++) for (let x = 0; x < glowW; x++) {
    const k = ((y * 4) * W + x * 4) * 3, g = (y * glowW + x) * 3, lum = (bg.d[k] + bg.d[k + 1] + bg.d[k + 2]) / 3;
    if (zb[(y * 4) * W + x * 4] === Infinity && lum > o.glowFromBg.threshold) { const kk = (lum - o.glowFromBg.threshold) * o.glowFromBg.k; glow[g] += bg.d[k] * kk; glow[g + 1] += bg.d[k + 1] * kk; glow[g + 2] += bg.d[k + 2] * kk; }
  }
  const tmp = new Float32Array(glow.length), rad = Math.max(2, Math.round((o.glowRadius || 10) * ss / 2));
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < glowH; y++) { let s0 = 0, s1 = 0, s2 = 0; for (let x = -rad; x < glowW + rad; x++) { const a = Math.min(glowW - 1, Math.max(0, x + rad)), b = x - rad - 1; if (x + rad < glowW) { const i = (y * glowW + x + rad) * 3; s0 += glow[i]; s1 += glow[i + 1]; s2 += glow[i + 2]; } if (b >= 0) { const i = (y * glowW + b) * 3; s0 -= glow[i]; s1 -= glow[i + 1]; s2 -= glow[i + 2]; } if (x >= 0 && x < glowW) { const i = (y * glowW + x) * 3, n = 2 * rad + 1; tmp[i] = s0 / n; tmp[i + 1] = s1 / n; tmp[i + 2] = s2 / n; } } }
    for (let x = 0; x < glowW; x++) { let s0 = 0, s1 = 0, s2 = 0; for (let y = -rad; y < glowH + rad; y++) { const b = y - rad - 1; if (y + rad < glowH) { const i = ((y + rad) * glowW + x) * 3; s0 += tmp[i]; s1 += tmp[i + 1]; s2 += tmp[i + 2]; } if (b >= 0) { const i = (b * glowW + x) * 3; s0 -= tmp[i]; s1 -= tmp[i + 1]; s2 -= tmp[i + 2]; } if (y >= 0 && y < glowH) { const i = (y * glowW + x) * 3, n = 2 * rad + 1; glow[i] = s0 / n; glow[i + 1] = s1 / n; glow[i + 2] = s2 / n; } } }
  }
  const gk = o.glowStrength ?? 1;
  if (o.raw) { // background layer: return linear buffer (with glow) for the next pass
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 3, gx = Math.min(glowW - 1.001, x / 4), gy = Math.min(glowH - 1.001, y / 4), x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0;
      for (let c = 0; c < 3; c++) {
        const g = (glow[(y0 * glowW + x0) * 3 + c] * (1 - fx) + glow[(y0 * glowW + x0 + 1) * 3 + c] * fx) * (1 - fy) + (glow[((y0 + 1) * glowW + x0) * 3 + c] * (1 - fx) + glow[((y0 + 1) * glowW + x0 + 1) * 3 + c] * fx) * fy;
        out[k + c] += g * gk;
      }
    }
    return { buf: out, faces: world.m.size };
  }
  const px8 = Buffer.alloc(W * H * 3);
  const tone = (v) => (v <= 0.85 ? v : 0.85 + 0.15 * (1 - Math.exp(-(v - 0.85) / 0.15)));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 3;
    const gx = Math.min(glowW - 1.001, x / 4), gy = Math.min(glowH - 1.001, y / 4), x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0;
    for (let c = 0; c < 3; c++) {
      const g00 = glow[(y0 * glowW + x0) * 3 + c], g10 = glow[(y0 * glowW + x0 + 1) * 3 + c], g01 = glow[((y0 + 1) * glowW + x0) * 3 + c], g11 = glow[((y0 + 1) * glowW + x0 + 1) * 3 + c];
      const g = (g00 * (1 - fx) + g10 * fx) * (1 - fy) + (g01 * (1 - fx) + g11 * fx) * fy;
      let v = out[k + c] + g * gk;
      if (o.vignette) { const dx = x / W - 0.5, dy = y / H - 0.5; v *= 1 - o.vignette * clamp((dx * dx + dy * dy) * 2.2 - 0.12); }
      px8[k + c] = Math.round(clamp(tone(v)) * 255);
    }
  }
  const img = sharp(px8, { raw: { width: W, height: H, channels: 3 } }).resize(o.W, o.H, { kernel: "lanczos3" });
  await img.jpeg({ quality: 90, mozjpeg: true }).toFile(o.out);
  return { faces: world.m.size, out: o.out };
}

module.exports = { World, placeShape, render, hash3, rng, vnoise, fbm, hex, mixc, mul, jit, clamp, norm, rotX, rotY, rotZ, Canvas };
