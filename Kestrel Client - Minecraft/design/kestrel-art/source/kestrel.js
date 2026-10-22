// The Kestrel: a male common kestrel as an implicit voxel shape.
// Local frame (units): +y = forward (beak), +z = up (back), +x = right wing.
const { hash3, hex, rotX } = require("./vox3d");

const C = {
  ruf: hex("#B5622F"), ruf2: hex("#97502A"), rufL: hex("#CF8A55"), spot: hex("#2B1F19"),
  cream: hex("#EEDFC4"), buff: hex("#D8B68A"), streak: hex("#6E4A35"),
  grey: hex("#7E8690"), grey2: hex("#646C77"), greyL: hex("#A7ADB5"), slate: hex("#4A5463"),
  dark: hex("#26272C"), prim: hex("#33292A"), prim2: hex("#463834"),
  yellow: hex("#F0B53A"), beak: hex("#4A5462"), eye: hex("#0B0C0F"), white: hex("#F6F2EA"), talon: hex("#1C1C1F"),
};

/**
 * pose: { tilt (body pitch, rad), headTilt, wings: 'open'|'folded', dih (wing rise per unit), fwd (wing sweep), fan (tail spread 0..1), feet }
 */
function kestrel(pose = {}) {
  const P = Object.assign({ tilt: 0, headTilt: 0, wings: "open", dih: 0.08, fwd: 0, fan: 0.15, feet: false, wingDroop: 0 }, pose);
  const hcLocal = [0, 6.4, 2.0];
  const hc = rotX(hcLocal, P.tilt);
  return (x, y, z, ix, iy, iz) => {
    const h = hash3(ix, iy, iz, 7), h2 = hash3(ix, iy, iz, 13);
    // ---- Head (kept level, optional nod) ----
    const q = rotX([x - hc[0], y - hc[1], z - hc[2]], -P.headTilt);
    const head = (q[0] / 2.8) ** 2 + (q[1] / 3.2) ** 2 + (q[2] / 2.8) ** 2;
    if (head <= 1) {
      const ax = Math.abs(q[0]);
      const de = Math.hypot(q[1] - 1.35, q[2] - 0.75);
      if (ax > 1.7 && de < 0.62) return C.eye;
      if (ax > 1.6 && de < 1.0) return C.yellow;                                   // eye ring
      if (ax > 1.35 && q[1] > 0.35 && q[1] < 1.55 && q[2] < -0.05 && q[2] > -2.3) return C.dark; // "moustache"
      if (q[2] > 0.45 || q[1] < -1.0) return h < 0.1 ? C.grey2 : C.grey;          // blue-grey crown
      return h < 0.05 ? C.buff : C.white;                                            // pale face
    }
    // ---- Beak (hooked) ----
    if (q[1] > 2.6 && q[1] < 4.6 && Math.abs(q[0]) < 0.85) {
      const top = 1.15 - (q[1] - 2.6) * 0.55, bot = -0.9 - (q[1] - 2.6) * 0.35;
      if (q[2] < top && q[2] > bot) return q[1] < 3.2 ? C.yellow : (q[1] > 4.0 ? C.dark : C.beak);
    }
    // ---- Body frame ----
    const b = rotX([x, y, z], -P.tilt), bx = b[0], by = b[1], bz = b[2];
    // Folded wings sit over the body sides and back
    if (P.wings === "folded") {
      for (const s of [-1, 1]) {
        const wx = (bx - s * 2.55) / 1.35, wy = (by + 3.6) / 8.6, wz = (bz - 1.0) / 2.5;
        if (wx * wx + wy * wy + wz * wz <= 1 && s * bx > 1.2) {
          if (by < -5.2) return h < 0.3 ? C.prim2 : C.prim;               // primaries over the tail
          if (by > 3.2 && bz > 1.6) return C.rufL;                            // shoulder edge
          return h < 0.17 ? C.spot : h < 0.36 ? C.ruf2 : C.ruf;
        }
      }
    }
    const body = (bx / 3.25) ** 2 + (by / 6.2) ** 2 + (bz / 3.35) ** 2;
    if (body <= 1) {
      if (by > 3.6 && bz > 0.4) return h < 0.1 ? C.grey2 : C.grey;          // grey nape
      if (bz > 0.7) return h < 0.16 ? C.spot : h < 0.35 ? C.ruf2 : C.ruf;   // spotted rufous back
      if (bz > -0.2 && Math.abs(bx) > 2.4) return h < 0.2 ? C.streak : C.buff;
      return h < 0.12 ? C.streak : h2 < 0.35 ? C.buff : C.cream;              // streaked buff chest
    }
    // ---- Tail (grey, black band, pale tip) ----
    if (by < -4.6 && by > -16.6) {
      const t = (-4.6 - by) / 12, w = 1.5 + t * (0.9 + P.fan * 5.5), zc = 0.55 - t * 0.4;
      const tipRound = t > 0.9 ? 1 - (t - 0.9) * 4 : 1;
      if (Math.abs(bx) <= w * tipRound && Math.abs(bz - zc) <= 0.62) {
        if (t > 0.92) return C.white;
        if (t > 0.78) return C.dark;
        if (bz < zc) return h < 0.25 ? C.greyL : C.cream;
        return h < 0.12 ? C.grey2 : C.grey;
      }
    }
    // ---- Open wings: long, pointed falcon wings ----
    if (P.wings === "open") {
      const u = Math.abs(bx);
      if (u >= 2.4 && u <= 26) {
        const t = (u - 2.4) / 23.6, ys = P.fwd * (u - 2.4);
        const zc = 1.0 + P.dih * (u - 2.4) - P.wingDroop * t * t * 8;
        const le = (t < 0.42 ? 2.7 - 1.4 * t : 2.112 - (t - 0.42) * 13.6) + ys;
        const te = (t < 0.42 ? -5.9 + 1.3 * t : -5.354 - (t - 0.42) * 3.3) + ys;
        const th = 0.95 - 0.45 * t;
        if (by <= le && by >= te && Math.abs(bz - zc) <= th) {
          const cpos = (by - te) / Math.max(0.01, le - te);
          if (t > 0.74 && Math.floor(u * 0.85) % 2 === 0 && cpos < 0.42) return null; // separated primaries
          if (bz >= zc) {
            if (t > 0.47) return cpos > 0.86 ? C.prim2 : h < 0.25 ? C.dark : C.prim;  // dark outer wing
            if (cpos < 0.34) return h < 0.4 ? C.prim2 : C.prim;                       // dark secondaries
            if (cpos > 0.88) return C.rufL;
            return h < 0.17 ? C.spot : h < 0.36 ? C.ruf2 : C.ruf;                     // spotted coverts
          }
          if (t > 0.47) return (Math.floor(by * 1.4 + u * 0.3) % 2 === 0) ? C.greyL : C.white; // barred underwing
          return h < 0.13 ? C.streak : C.cream;
        }
      }
    }
    // ---- Feet (perched) ----
    if (P.feet) {
      // in the root frame: legs from body to perch at z = feetZ
      const fz = P.feetZ ?? -5.2;
      for (const s of [-1, 1]) {
        const lx = x - s * 1.15;
        if (Math.abs(lx) < 0.75 && y > -0.2 && y < 1.6 && z > fz && z < fz + 2.4) return z < fz + 0.8 ? C.yellow : C.buff;
        if (Math.abs(lx) < 0.75 && y >= 1.6 && y < 3.1 && z > fz && z < fz + 0.8) return y > 2.6 ? C.talon : C.yellow;
      }
    }
    return null;
  };
}
const BOUNDS = [[-27, 27], [-17.5, 11], [-8, 16]];
module.exports = { kestrel, KESTREL_COLORS: C, BOUNDS };
