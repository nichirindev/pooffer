/* 06 — Trigonometric fitting: closed contours -> compact Fourier series.
 *
 * Each closed loop becomes ONE parametric Desmos line:
 *   (x0 + SUM ax_n*cos(2*pi*n*t) + bx_n*sin(2*pi*n*t),
 *    y0 + SUM ay_n*cos(2*pi*n*t) + by_n*sin(2*pi*n*t)) {0<=t<=1}
 *
 * Open paths cannot be periodic, so they fall back to a small decimated
 * set of straight lines (same IR shape as the segment fitter).
 * Pure, no DOM. Works in browser + Node.
 */
"use strict";

function bboxDiagT(c) {
  let minX = 1e18, maxX = -1e18, minY = 1e18, maxY = -1e18;
  for (const p of c) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

function isClosedT(contour) {
  if (!contour || contour.length < 4) return false;
  const a = contour[0], b = contour[contour.length - 1];
  return Math.hypot(a.x - b.x, a.y - b.y) < Math.max(bboxDiagT(contour) * 0.05, 1e-6);
}

// Arc-length uniform resampling to M points. Closed loop: wraps last->first.
function resampleUniform(contour, M) {
  const n = contour.length;
  const cum = new Array(n + 1);
  cum[0] = 0;
  for (let i = 1; i <= n; i++) {
    const a = contour[i - 1], b = contour[i % n];
    cum[i] = cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y);
  }
  const L = cum[n] || 1;
  const out = [];
  let j = 0;
  for (let i = 0; i < M; i++) {
    const s = (i / M) * L;
    while (j < n - 1 && cum[j + 1] < s) j++;
    const segLen = cum[j + 1] - cum[j] || 1;
    const f = Math.min(1, Math.max(0, (s - cum[j]) / segLen));
    const a = contour[j], b = contour[(j + 1) % n];
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}

// Real DFT, harmonics 0..M/2. Returns {re:[], im:[]} (unscaled sums).
function dftHalf(vals) {
  const M = vals.length, H = M >> 1;
  const re = new Array(H + 1).fill(0), im = new Array(H + 1).fill(0);
  for (let k = 0; k <= H; k++) {
    let r = 0, s = 0;
    for (let m = 0; m < M; m++) {
      const a = (2 * Math.PI * k * m) / M;
      r += vals[m] * Math.cos(a);
      s -= vals[m] * Math.sin(a);
    }
    re[k] = r; im[k] = s;
  }
  return { re, im };
}

// Fit closed contour with DC + top-K harmonics. Returns null if degenerate.
function fourierFit(contour, K, M) {
  const m = M || 128;
  const k = Math.max(1, Math.min(24, K | 0 || 8));
  if (!contour || contour.length < 6) return null;
  const P = resampleUniform(contour, m);
  const xs = P.map((p) => p.x), ys = P.map((p) => p.y);
  const FX = dftHalf(xs), FY = dftHalf(ys);
  const x0 = FX.re[0] / m, y0 = FY.re[0] / m;
  const H = m >> 1;
  const cands = [];
  for (let n = 1; n <= H; n++) {
    // inverse DFT: v[m] = DC + SUM (2*re/M)*cos - (2*im/M)*sin
    const ax = (2 * FX.re[n]) / m, bx = (-2 * FX.im[n]) / m;
    const ay = (2 * FY.re[n]) / m, by = (-2 * FY.im[n]) / m;
    const amp = Math.hypot(ax, bx, ay, by);
    if (amp > 1e-12) cands.push({ n, ax, bx, ay, by, amp });
  }
  cands.sort((a, b) => b.amp - a.amp);
  // drop negligible tail (keeps Desmos lines short); then take top-K
  const maxAmp = cands.length ? cands[0].amp : 0;
  const kept = cands.filter((c) => c.amp >= maxAmp * 0.002);
  const terms = kept.slice(0, k).sort((a, b) => a.n - b.n)
    .map(({ n, ax, bx, ay, by }) => ({ n, ax, bx, ay, by }));
  if (!terms.length) return null;
  // relative reconstruction error
  const diag = bboxDiagT(contour) || 1;
  let se = 0;
  for (let i = 0; i < m; i++) {
    const a = (2 * Math.PI * i) / m;
    let x = x0, y = y0;
    for (const tm of terms) {
      const w = tm.n * a;
      x += tm.ax * Math.cos(w) + tm.bx * Math.sin(w);
      y += tm.ay * Math.cos(w) + tm.by * Math.sin(w);
    }
    se += (x - P[i].x) * (x - P[i].x) + (y - P[i].y) * (y - P[i].y);
  }
  return { x0, y0, terms, error: Math.sqrt(se / m) / diag };
}

// Decimated straight-line fallback for open paths (caps output size).
function pushDecimatedLines(equations, pts, o, cap) {
  const stride = Math.max(1, Math.ceil((pts.length - 1) / (cap || 24)));
  for (let i = 0; i < pts.length - 1; i += stride) {
    if (equations.length >= o.maxCurves) break;
    const a = pts[i], b = pts[Math.min(pts.length - 1, i + stride)];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
    equations.push({
      type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      layer: o.layer, color: o.colorHex, closed: false,
    });
  }
}

/* ---------- main entry: contours -> trig equations (budgeted) ---------- */

function contoursToTrig(contours, opts) {
  const o = Object.assign({
    harmonics: 8, samples: 128, maxCurves: 80,
    colorHex: null, layer: 0,
  }, opts || {});
  const equations = [];
  let nTrig = 0, nFallback = 0, errSum = 0, errN = 0;

  const order = (contours || [])
    .map((c) => ({ c, d: c && c.length ? bboxDiagT(c) : 0 }))
    .sort((a, b) => b.d - a.d)
    .map((o2) => o2.c);

  for (const contour of order) {
    if (equations.length >= o.maxCurves) break;
    if (!contour || contour.length < 4) continue;
    if (isClosedT(contour) && contour.length >= 8) {
      const fit = fourierFit(contour, o.harmonics, o.samples);
      if (fit) {
        equations.push({
          type: "trig", x0: fit.x0, y0: fit.y0, terms: fit.terms,
          layer: o.layer, color: o.colorHex, closed: true,
        });
        nTrig++;
        errSum += fit.error; errN++;
        continue;
      }
    }
    // open path or degenerate loop -> few straight lines
    const before = equations.length;
    pushDecimatedLines(equations, contour, o, 24);
    nFallback += equations.length - before;
  }

  return {
    equations,
    stats: {
      contours: (contours || []).length,
      trigCurves: nTrig, fallbackLines: nFallback,
      equations: equations.length,
      approxError: errN ? errSum / errN : 0,
    },
  };
}

const TF = {
  resampleUniform, dftHalf, fourierFit, isClosedT, bboxDiagT, contoursToTrig,
};
if (typeof module !== "undefined" && module.exports) module.exports = TF;
if (typeof window !== "undefined") window.TF = TF;
