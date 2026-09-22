/* 03 — Mathematics Engine: contours -> compact Desmos equations. Pure, no DOM. */
"use strict";

function perpDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

function rdp(points, eps) {
  if (!points || points.length < 3) return points ? points.slice() : [];
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let dmax = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(points[i], points[s], points[e]);
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > eps && idx > 0) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function isClosed(contour) {
  if (!contour || contour.length < 4) return false;
  const a = contour[0], b = contour[contour.length - 1];
  const diag = bboxDiag(contour);
  return Math.hypot(a.x - b.x, a.y - b.y) < Math.max(diag * 0.05, 1e-6);
}

function bboxDiag(c) {
  let minX = 1e18, maxX = -1e18, minY = 1e18, maxY = -1e18;
  for (const p of c) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

// Kasa least-squares circle fit. Returns {h,k,r,rmse}.
function fitCircle(contour) {
  const n = contour.length;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  let count = 0;
  for (const p of contour) {
    const z = p.x * p.x + p.y * p.y;
    sx += p.x; sy += p.y; sxx += p.x * p.x; syy += p.y * p.y;
    sxy += p.x * p.y; sxz += p.x * z; syz += p.y * z; sz += z; count++;
  }
  // Solve [sxx sxy sx; sxy syy sy; sx sy n] [D E F]^T = -[sxz syz sz]^T
  const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const B = [-sxz, -syz, -sz];
  const sol = solve3(A, B);
  if (!sol) return null;
  const [D, E, F] = sol;
  const h = -D / 2, k = -E / 2;
  const r2 = (D * D + E * E) / 4 - F;
  if (!(r2 > 0)) return null;
  const r = Math.sqrt(r2);
  let se = 0;
  for (const p of contour) {
    const d = Math.hypot(p.x - h, p.y - k) - r;
    se += d * d;
  }
  return { h, k, r, rmse: Math.sqrt(se / n) };
}

function solve3(A, B) {
  // gaussian elimination 3x3
  const M = [A[0].concat(B[0]), A[1].concat(B[1]), A[2].concat(B[2])];
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let j = col; j < 4; j++) M[col][j] /= d;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let j = col; j < 4; j++) M[r][j] -= f * M[col][j];
    }
  }
  return [M[0][3], M[1][3], M[2][3]];
}

function isCircleLike(contour, fit, tol) {
  if (!fit || !(fit.r > 1e-9)) return false;
  const rel = fit.rmse / fit.r;
  if (rel > (tol == null ? 0.06 : tol)) return false;
  // must be reasonably closed and fill its bbox
  if (!isClosed(contour) && contour.length > 6) {
    // open arcs can still be circles — allow if arc covers enough angle
    const cx = fit.h, cy = fit.k;
    let a0 = Math.atan2(contour[0].y - cy, contour[0].x - cx);
    let sweep = 0, prev = a0;
    for (let i = 1; i < contour.length; i++) {
      const a = Math.atan2(contour[i].y - cy, contour[i].x - cx);
      let d = a - prev;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      sweep += d; prev = a;
    }
    if (Math.abs(sweep) < Math.PI * 0.8) return false;
  }
  return true;
}

// Catmull-Rom -> cubic Bezier chain. Returns array of [p0,p1,p2,p3].
function polylineToBeziers(pts, closed) {
  const n = pts.length;
  if (n < 2) return [];
  if (n === 2) return [[pts[0], pts[0], pts[1], pts[1]]];
  const P = (i) => {
    if (closed) return pts[((i % n) + n) % n];
    return pts[Math.min(n - 1, Math.max(0, i))];
  };
  const segs = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i), p1 = P(i + 1);
    const t0 = P(i - 1), t1 = P(i + 2);
    const c1 = { x: p0.x + (p1.x - t0.x) / 6, y: p0.y + (p1.y - t0.y) / 6 };
    const c2 = { x: p1.x - (t1.x - p0.x) / 6, y: p1.y - (t1.y - p0.y) / 6 };
    segs.push([p0, c1, c2, p1]);
  }
  return segs;
}

function bezierPoint(seg, t) {
  const [p0, p1, p2, p3] = seg;
  const u = 1 - t;
  return {
    x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
    y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
  };
}

function meanErrorContourVsBeziers(pts, segs, closed) {
  // sample each original point's distance to nearest bezier sample
  const samples = [];
  for (const s of segs) for (let i = 0; i <= 8; i++) samples.push(bezierPoint(s, i / 8));
  let se = 0;
  const diag = bboxDiag(pts) || 1;
  for (const p of pts) {
    let bd = 1e18;
    for (const q of samples) {
      const d = (p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y);
      if (d < bd) bd = d;
    }
    se += bd;
  }
  return Math.sqrt(se / pts.length) / diag;
}

/* ---------- main entry: contours -> equations ---------- */

function processContours(contours, opts) {
  const o = Object.assign({
    mode: "outline", tolerance: 0.08, maxEquations: 250,
    preferCurves: true, colorHex: null, layer: 0,
  }, opts || {});
  let equations = [];
  let totalIn = 0, totalSimp = 0;

  // sort largest first so budget goes to important shapes
  const order = contours
    .map((c, i) => ({ c, i, d: bboxDiag(c) }))
    .sort((a, b) => b.d - a.d)
    .map((o2) => o2.c);

  for (let li = 0; li < order.length; li++) {
    const contour = order[li];
    totalIn += contour.length;
    if (equations.length >= o.maxEquations) break;

    const closed = isClosed(contour);
    const simp = rdp(contour, o.tolerance);
    totalSimp += simp.length;
    if (simp.length < 2) continue;

    // 1) circle / ellipse shortcut for closed blobs
    if (closed && simp.length >= 8) {
      const fit = fitCircle(simp);
      if (isCircleLike(simp, fit, 0.05 + o.tolerance * 0.1)) {
        equations.push({
          type: "circle", h: fit.h, k: fit.k, r: fit.r,
          layer: o.layer, color: o.colorHex, closed: true,
        });
        continue;
      }
      // ellipse via bbox when circle fails but shape is oval-ish
      const ell = fitEllipsebboxFallback(simp);
      if (ell && ell.score < 0.08) {
        equations.push({
          type: "ellipse", h: ell.h, k: ell.k, a: ell.a, b: ell.b,
          layer: o.layer, color: o.colorHex, closed: true,
        });
        continue;
      }
    }

    // 2) few points -> straight lines
    if (simp.length <= 4 || !o.preferCurves) {
      pushLines(equations, simp, closed, o);
      continue;
    }

    // 3) curves -> bezier chain (decimate control density by tolerance)
    const stride = o.tolerance > 0.15 ? 3 : o.tolerance > 0.06 ? 2 : 1;
    const ctrl = simp.filter((_, i) => i % stride === 0);
    if (ctrl.length >= 2 && ctrl[ctrl.length - 1] !== simp[simp.length - 1]) ctrl.push(simp[simp.length - 1]);
    const segs = polylineToBeziers(ctrl, false);
    for (const s of segs) {
      if (equations.length >= o.maxEquations) break;
      // skip degenerate
      if (Math.hypot(s[3].x - s[0].x, s[3].y - s[0].y) < 1e-9) continue;
      equations.push({
        type: "bezier",
        p0: s[0], p1: s[1], p2: s[2], p3: s[3],
        layer: o.layer, color: o.colorHex, closed: false,
      });
    }
  }

  // enforce budget: keep largest first (already ordered) — truncate
  if (equations.length > o.maxEquations) equations = equations.slice(0, o.maxEquations);

  const err = totalIn ? 1 - totalSimp / totalIn : 0;
  return {
    equations,
    stats: {
      contours: contours.length, pointsIn: totalIn,
      pointsSimp: totalSimp, equations: equations.length,
      approxError: err,
    },
  };
}

function fitEllipsebboxFallback(pts) {
  // axis-aligned ellipse from bbox + center; score = mean radial deviation
  let minX = 1e18, maxX = -1e18, minY = 1e18, maxY = -1e18;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const h = (minX + maxX) / 2, k = (minY + maxY) / 2;
  const a = (maxX - minX) / 2, b = (maxY - minY) / 2;
  if (!(a > 1e-9 && b > 1e-9)) return null;
  let se = 0;
  for (const p of pts) {
    const v = ((p.x - h) / a) ** 2 + ((p.y - k) / b) ** 2;
    se += (v - 1) * (v - 1);
  }
  const score = Math.sqrt(se / pts.length);
  // reject if too circle-like (circle branch handles) — still allow
  return { h, k, a, b, score };
}

function pushLines(equations, pts, closed, o) {
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    if (equations.length >= o.maxEquations) break;
    const a = pts[i], b = pts[(i + 1) % n];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
    equations.push({
      type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      layer: o.layer, color: o.colorHex, closed: false,
    });
  }
}

/* ---------- polygon builder for silhouette / color fills ---------- */

function contoursToPolygons(contours, tolerance, maxPoints) {
  return contours.map((c) => {
    let s = rdp(c, tolerance);
    if (s.length > (maxPoints || 60)) {
      const stride = Math.ceil(s.length / (maxPoints || 60));
      s = s.filter((_, i) => i % stride === 0);
    }
    return s;
  }).filter((p) => p.length >= 3);
}

const ME = {
  rdp, perpDist, fitCircle, isCircleLike, polylineToBeziers,
  processContours, contoursToPolygons, isClosed, bboxDiag,
};
if (typeof module !== "undefined" && module.exports) module.exports = ME;
if (typeof window !== "undefined") window.ME = ME;
