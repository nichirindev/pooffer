/* Exact port of unk1911/math-drawings snow village formula
 * (Hamid Naderi Yeganeh's "snow-covered village" plate).
 *
 * Pixel (m,n), m=1..2000, n=1..1200  ->  x=(m-1000)/600, y=(501-n)/600
 *   rgb( F(H_0(x,y)), F(H_1(x,y)), F(H_2(x,y)) )
 *   F(h) = floor( 255 * e^(-e^(-1000 h)) * |h|^(e^(-e^(1000 (h-1)))) )
 *
 * E(x,y)  : fractal terrain, 40 cosine terms, coeff (24/25)^s
 * B(x,y)  : background/ground mask, 40 terms, r=(49/50)^s, q=(107/100)^s*30
 * M(x,y)  : snow silhouette mask around snow_line
 * Houses s=1..67 : rotated local frame (C,V,L,U,P,Q,R), step Ws (0 for s<=50,
 *   1 above), occupancy T, windows J, walls K, detail/snow/window-boost masks,
 *   per-channel accumulators A_v with occlusion product Z (Z_0=1).
 * H_v = 0.9(1-B) + coeff_v * B * (10 A_v + 9 Z_67) * (5+2v+(45-2v) M)
 *
 * Pure: Float64Array in, Uint8Array out. No DOM. Runs in node and browsers.
 * Reference: C:/Users/Ayush/AppData/Local/Temp/opencode/math-drawings
 *   src/gen_math_village_img.py (verified pixel-identical, see probe test).
 */
"use strict";

function safeExp(z) {
  if (z > 700) z = 700;
  else if (z < -700) z = -700;
  return Math.exp(z);
}

/* Render K samples. xs, ys are Float64Array (or plain arrays) of length K.
 * Returns Uint8Array of length 3*K: [r0,g0,b0, r1,g1,b1, ...]. */
function renderVillage(xs, ys) {
  const K = xs.length;
  const E = new Float64Array(K);
  let s, i;

  // ---- E: fractal terrain texture ----
  for (s = 1; s <= 40; s++) {
    const coeff = Math.pow(24 / 25, s);
    const scale = Math.pow(6 / 5, s) * 10;
    const cs2 = Math.cos(s * s);
    const ss2 = Math.sin(s * s);
    const c17 = 2 * Math.cos(17 * s);
    const c5 = 2 * Math.cos(5 * s);
    const c15 = 2 * Math.cos(15 * s);
    const c7 = 2 * Math.cos(7 * s);
    for (i = 0; i < K; i++) {
      const x = xs[i], y = ys[i];
      E[i] += coeff * Math.cos(scale * (-cs2 * x + ss2 * y + c17) + c5) *
                      Math.cos(scale * (cs2 * y + ss2 * x + c15) + c7);
    }
  }

  // ---- B: background / ground mask (via log_B) ----
  const B = new Float64Array(K);
  {
    const logB = new Float64Array(K);
    for (s = 1; s <= 40; s++) {
      const r = Math.pow(49 / 50, s);
      const q = Math.pow(107 / 100, s) * 30;
      const s2 = s * s;
      const cos15 = Math.cos(15 * s2), sin15 = Math.sin(15 * s2);
      const c5s2 = 2 * Math.cos(5 * s2);
      const c17s2 = 2 * Math.cos(17 * s2);
      const c18s2 = 2 * Math.cos(18 * s2);
      for (i = 0; i < K; i++) {
        const x = xs[i], y = ys[i];
        const denom = 3 - 2 * y;
        const baseX = (2 * x + c5s2) / denom;
        const baseY = 2 / denom;
        const ang = q * (cos15 * baseX + sin15 * baseY);
        const ang2 = q * (sin15 * baseX - cos15 * baseY);
        const inner = Math.cos(ang + c17s2) * Math.cos(ang2 + c18s2) + (E[i] - 99) / 100;
        const exponent = (28 - 20 * y) * r * inner;
        logB[i] -= safeExp(exponent > 700 ? 700 : exponent < -700 ? -700 : exponent);
      }
    }
    for (i = 0; i < K; i++) B[i] = safeExp(logB[i]);
  }

  // ---- M: snow silhouette mask ----
  const M = new Float64Array(K);
  for (i = 0; i < K; i++) {
    const x = xs[i], y = ys[i];
    const snowLine = y + x / 15 - (x * x) / 7 +
      Math.cos(3 * x + Math.cos(2 * x)) / 12 + 57 / 50;
    M[i] = safeExp(-safeExp(-50 * (Math.abs(snowLine) - 0.1 - E[i] / 200)));
  }

  // ---- Houses s = 1..67 ----
  const A0 = new Float64Array(K), A1 = new Float64Array(K), A2 = new Float64Array(K);
  const Z = new Float64Array(K).fill(1);
  for (s = 1; s <= 67; s++) {
    const s2 = s * s;
    // Ws: 0 for s<=50, 1 for s>=51 (double exp is a hard step here)
    const Ws = safeExp(-safeExp(50500 - 1000 * s));
    const hue0 = (Math.cos(12 * s2) - 0 + 5) / 20;
    const hue1 = (Math.cos(12 * s2) - 1 + 5) / 20;
    const hue2 = (Math.cos(12 * s2) - 2 + 5) / 20;
    const fadeS = ((100 - s) / 100);
    const snowBase = (() => { const t = safeExp(2 * Math.abs(s - 40) - 10); return t; })();
    for (i = 0; i < K; i++) {
      const x = xs[i], y = ys[i];
      const C = (400 + s) / (480 - 320 * y);
      const V = Math.atan(Math.tan(40 * C));
      const L = x * C + 0.25 * Math.cos(7 * Math.pow(40 * C - V, 2));
      const U = Math.atan(Math.tan(10 * L));
      const dU = 10 * L - U;
      const dV = 40 * C - V;
      const Nloc = dU * dU + dV * dV;
      const cosN = Math.cos(Nloc), sinN = Math.sin(Nloc);
      const P = cosN * V - sinN * U;
      const Q = cosN * U + sinN * V;
      const R = 1 - 0.3 * Math.cos(2 * dU * dU + 3 * dV * dV);

      const cosHouse = Math.cos(6 * dU * dU + 8 * dV * dV);
      const cosRoof = Math.cos(2 * dU * dU + dV * dV);
      let roofDist = 500 * (6 + cosRoof) * dU * dU +
        1000 * Math.pow(40 * (C - 27 / 20) - V, 2) - 1e6;
      if (roofDist > 700) roofDist = 700;
      else if (roofDist < -700) roofDist = -700;
      let tExp = -100 * (s - 0.5) - safeExp(1000 * (cosHouse - 0.8)) - safeExp(roofDist);
      if (tExp > 700) tExp = 700;
      else if (tExp < -700) tExp = -700;
      const T = safeExp(-safeExp(tExp));

      const jExp = -safeExp(100 * Math.abs(Q) - 2 * s * R - 15) -
                    safeExp(100 * (Math.abs(P) - R));
      const J = T * (1 - Ws) * safeExp(jExp);

      const wallExp = 200 * Math.abs(Q) - (4 * s * (1 - Ws) + (190 + 4 * E[i]) * Ws) * R;
      const kExp = -safeExp(wallExp) - safeExp(100 * Math.abs(P) - R * (100 + 2 * E[i]));
      const Kw = T * safeExp(kExp);

      const detail = safeExp(-safeExp(1e3 * (Math.cos(8 * dU * dU + 3 * dV * dV) - 0.4)));
      const snowFade = safeExp(-safeExp(20 * Math.abs(Q) - 6 * R - snowBase));
      const boost = 1 + 6 * snowFade;
      const contrib = (J + Kw * (1 - J)) * detail * boost * fadeS;
      const zp = Z[i];
      A0[i] += zp * contrib * hue0;
      A1[i] += zp * contrib * hue1;
      A2[i] += zp * contrib * hue2;
      if (s < 67) Z[i] = zp * (1 - J) * (1 - Kw);
    }
  }

  // ---- H_v -> F -> rgb ----
  const out = new Uint8Array(3 * K);
  const As = [A0, A1, A2];
  for (let v = 0; v < 3; v++) {
    const coeff = (13 * v * v - 16 * v + 103) / 50000;
    const mult = 5 + 2 * v;
    const mMult = 45 - 2 * v;
    const Av = As[v];
    for (i = 0; i < K; i++) {
      const H = 0.9 * (1 - B[i]) +
        coeff * B[i] * (10 * Av[i] + 9 * Z[i]) * (mult + mMult * M[i]);
      const inner = safeExp(-1000 * H);
      const pExp = safeExp(-safeExp(1000 * (H - 1)));
      const F = 255 * safeExp(-inner) * Math.pow(Math.abs(H), pExp);
      let c = Math.floor(F);
      if (c < 0) c = 0;
      else if (c > 255) c = 255;
      out[3 * i + v] = c;
    }
  }
  return out;
}

function villageXY(m, n) {
  return [(m - 1000) / 600, (501 - n) / 600];
}

/* Single native-grid pixel (m=1..2000, n=1..1200) -> [r,g,b]. */
function villagePixel(m, n) {
  const p = villageXY(m, n);
  const o = renderVillage([p[0]], [p[1]]);
  return [o[0], o[1], o[2]];
}

const MAV = { W: 2000, H: 1200, renderVillage, villagePixel, villageXY, safeExp };
if (typeof module !== "undefined" && module.exports) module.exports = MAV;
if (typeof window !== "undefined") window.MAV = MAV;
