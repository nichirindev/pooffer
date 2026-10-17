/* Engine bridge: village renderer + trace pipeline + canvas drawing + metrics.
 * Ported 1:1 from the vanilla app logic; React owns state, this owns pixels. */
import MAV from './lib/math-art-village.js';
import IP from './lib/image-processing.js';
import ME from './lib/math-engine.js';
import TF from './lib/trig-fit.js';

export const NW = 2000;
export const NH = 1200;

const tick = () => new Promise((r) => setTimeout(r, 0));

/* ---------- snow village: chunked exact evaluation ---------- */
export async function renderVillage(canvas, W, onProgress, job) {
  const H = Math.round((W * NH) / NW);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const xs = new Float64Array(W);
  const ys = new Float64Array(H);
  for (let i = 0; i < W; i++) xs[i] = (1 + (i * (NW - 1)) / (W - 1) - 1000) / 600;
  for (let j = 0; j < H; j++) ys[j] = (501 - (1 + (j * (NH - 1)) / (H - 1))) / 600;
  const img = ctx.createImageData(W, H);
  const t0 = performance.now();
  const ROWS = 8;
  for (let j0 = 0; j0 < H; j0 += ROWS) {
    if (job && job.cancelled) return null;
    const j1 = Math.min(H, j0 + ROWS);
    const n = (j1 - j0) * W;
    const bx = new Float64Array(n);
    const by = new Float64Array(n);
    let k = 0;
    for (let j = j0; j < j1; j++)
      for (let i = 0; i < W; i++) {
        bx[k] = xs[i];
        by[k] = ys[j];
        k++;
      }
    const rgb = MAV.renderVillage(bx, by);
    k = 0;
    for (let j = j0; j < j1; j++)
      for (let i = 0; i < W; i++) {
        const o = (j * W + i) * 4;
        img.data[o] = rgb[3 * k];
        img.data[o + 1] = rgb[3 * k + 1];
        img.data[o + 2] = rgb[3 * k + 2];
        img.data[o + 3] = 255;
        k++;
      }
    ctx.putImageData(img, 0, 0);
    if (onProgress) onProgress(j1 / H, `Rendering… row ${j1}/${H}`);
    await tick();
  }
  return { w: W, h: H, secs: (performance.now() - t0) / 1000 };
}

/* ---------- trace: upload -> contours -> equations ---------- */
export async function traceImage(refImg, opts, onProgress, job) {
  const { fine, W, colorCount, fit, harmonics } = opts;
  const prog = (p, m) => {
    if (onProgress) onProgress(p, m);
  };
  const die = () => job && job.cancelled;
  const procSize = fine ? 640 : 448;
  const natW = refImg.naturalWidth;
  const natH = refImg.naturalHeight;
  const Wp = W;
  const Hp = Math.round((Wp * natH) / natW);
  prog(0.1, 'Tracing edges…');
  await tick();
  if (die()) return null;
  const scale = Math.min(1, procSize / Math.max(natW, natH));
  const w = Math.max(16, Math.round(natW * scale));
  const h = Math.max(16, Math.round(natH * scale));
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const g = off.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.drawImage(refImg, 0, 0, w, h);
  const rgba = g.getImageData(0, 0, w, h).data;
  let gray = IP.toGrayscale(rgba, w, h);
  gray = IP.adjustBrightnessContrast(gray, w, h, 0, 10);
  const blurred = IP.separableBlur(gray, w, h, 1.0);
  prog(0.5, 'Fitting curves…');
  await tick();
  if (die()) return null;
  const { edges } = IP.sobelEdges(blurred, w, h);
  const minLen = Math.max(4, Math.round(Math.max(w, h) * 0.015));
  const tol = fine ? 0.05 : 0.09;
  const perLayerMax = fine ? 450 : 200;
  const trigMode = fit === 'trig';
  const TRIG_BUDGET = fine ? 160 : 80;
  const layers = [];
  if (colorCount >= 3) {
    prog(0.3, 'Quantizing colors…');
    await tick();
    if (die()) return null;
    const q = IP.quantizeColors(rgba, w, h, colorCount, 9000);
    const order = q.counts
      .map((n, i) => ({ n, i }))
      .sort((a, b) => b.n - a.n);
    for (const { i } of order) {
      const mask = IP.maskForLabel(q.labels, w, h, i);
      const opened = IP.morphOpen(mask, w, h);
      const loops = IP.traceBoundaries(opened, w, h, minLen);
      const cleaned = IP.cleanupContours(loops, w, h, minLen);
      const closed = IP.morphClose(mask, w, h);
      const fillLoops = IP.traceBoundaries(closed, w, h, 3).filter(
        (c) => c && c.length >= 3,
      );
      if (!cleaned.length && !fillLoops.length) continue;
      layers.push({
        color: q.hex[i],
        contoursNorm: IP.normalizeContours(cleaned, w, h, 10),
        fillNorm: IP.normalizeContours(fillLoops, w, h, 10),
      });
    }
    if (!layers.length) throw new Error('No color regions found.');
  } else {
    const paths = IP.extractEdgePaths(edges, w, h, minLen);
    const cleaned = IP.cleanupContours(paths, w, h, Math.max(5, minLen - 3));
    if (!cleaned.length) throw new Error('No contours found — try another image.');
    layers.push({
      color: null,
      contoursNorm: IP.normalizeContours(cleaned, w, h, 10),
    });
  }
  if (die()) return null;
  const equations = [];
  let nContours = 0;
  layers.forEach((L, li) => {
    nContours += L.contoursNorm.length;
    if (trigMode) {
      const res = TF.contoursToTrig(L.contoursNorm, {
        harmonics,
        samples: fine ? 192 : 128,
        maxCurves: TRIG_BUDGET,
        colorHex: L.color,
        layer: li,
      });
      equations.push(...res.equations);
    } else {
      const res = ME.processContours(L.contoursNorm, {
        mode: 'outline',
        tolerance: tol,
        maxEquations: perLayerMax,
        preferCurves: true,
        colorHex: L.color,
        layer: li,
      });
      equations.push(...res.equations);
    }
  });
  if (trigMode && equations.length > TRIG_BUDGET) equations.length = TRIG_BUDGET;
  if (!equations.length) throw new Error('Curve fitting found nothing — try Fine detail.');
  prog(0.8, 'Drawing vectors…');
  await tick();
  if (die()) return null;
  return {
    equations,
    layers,
    Wp,
    Hp,
    pw: w,
    ph: h,
    nContours,
    palette: layers.map((L) => L.color).filter(Boolean),
  };
}

/* ---------- draw fitted equations to canvas ---------- */
export function drawEquations(canvas, equations, layers, pw, ph) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  const R = 10;
  const sc = (2 * R) / Math.max(pw, ph);
  const rx = (pw * sc) / 2;
  const ry = (ph * sc) / 2;
  const X = (x) => ((x + rx) / (2 * rx)) * W;
  const Y = (y) => ((ry - y) / (2 * ry)) * H;
  const S = W / (2 * rx);
  const colorful = layers.some((L) => L.color);
  if (colorful) {
    ctx.fillStyle = layers[0].color;
    ctx.fillRect(0, 0, W, H);
    for (const L of layers) {
      const loops = L.fillNorm && L.fillNorm.length ? L.fillNorm : L.contoursNorm;
      const p = new Path2D();
      for (const c of loops) {
        c.forEach((pt, i) => (i === 0 ? p.moveTo(X(pt.x), Y(pt.y)) : p.lineTo(X(pt.x), Y(pt.y))));
        p.closePath();
      }
      ctx.fillStyle = L.color;
      ctx.fill(p, 'evenodd');
      ctx.strokeStyle = L.color;
      ctx.lineWidth = Math.max(1.5, W / 600);
      ctx.stroke(p);
    }
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, W / 900);
  for (const e of equations) {
    ctx.strokeStyle = e.color || '#111827';
    ctx.fillStyle = e.color ? e.color + '55' : 'rgba(17,24,39,.08)';
    ctx.beginPath();
    if (e.type === 'line') {
      ctx.moveTo(X(e.x1), Y(e.y1));
      ctx.lineTo(X(e.x2), Y(e.y2));
      ctx.stroke();
    } else if (e.type === 'circle') {
      ctx.arc(X(e.h), Y(e.k), e.r * S, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.type === 'ellipse') {
      ctx.ellipse(X(e.h), Y(e.k), e.a * S, e.b * S, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.type === 'bezier') {
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const u = 1 - t;
        const x =
          u * u * u * e.p0.x +
          3 * u * u * t * e.p1.x +
          3 * u * t * t * e.p2.x +
          t * t * t * e.p3.x;
        const y =
          u * u * u * e.p0.y +
          3 * u * u * t * e.p1.y +
          3 * u * t * t * e.p2.y +
          t * t * t * e.p3.y;
        if (i === 0) ctx.moveTo(X(x), Y(y));
        else ctx.lineTo(X(x), Y(y));
      }
      ctx.stroke();
    } else if (e.type === 'trig') {
      for (let i = 0; i <= 160; i++) {
        const t = i / 160;
        const a = 2 * Math.PI * t;
        let x = e.x0;
        let y = e.y0;
        for (const tm of e.terms) {
          const wgt = tm.n * a;
          x += tm.ax * Math.cos(wgt) + tm.bx * Math.sin(wgt);
          y += tm.ay * Math.cos(wgt) + tm.by * Math.sin(wgt);
        }
        if (i === 0) ctx.moveTo(X(x), Y(y));
        else ctx.lineTo(X(x), Y(y));
      }
      ctx.closePath();
      ctx.stroke();
    } else if (e.type === 'polygon') {
      e.points.forEach((p, i) =>
        i === 0 ? ctx.moveTo(X(p.x), Y(p.y)) : ctx.lineTo(X(p.x), Y(p.y)),
      );
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}

/* ---------- reference canvas ---------- */
function coverCrop(sw, sh, tw, th) {
  const sA = sw / sh;
  const tA = tw / th;
  if (sA > tA) {
    const w = sh * tA;
    return { sx: (sw - w) / 2, sy: 0, sw: w, sh };
  }
  const h = sw / tA;
  return { sx: 0, sy: (sh - h) / 2, sw, sh: h };
}

export function paintRef(refCanvas, refImg, w, h) {
  refCanvas.width = w;
  refCanvas.height = h;
  const ctx = refCanvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  if (!refImg) {
    ctx.fillStyle = '#666';
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillText('Upload a reference image to compare.', 20, 30);
    return;
  }
  const crop = coverCrop(refImg.naturalWidth, refImg.naturalHeight, w, h);
  ctx.drawImage(refImg, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
}

/* ---------- MAE / RMSE / PSNR / correlation ---------- */
export function computeMetrics(artCanvas, refCanvas, w, h) {
  const actx = artCanvas.getContext('2d');
  const rctx = refCanvas.getContext('2d');
  const a = actx.getImageData(0, 0, w, h).data;
  const rp = rctx.getImageData(0, 0, w, h).data;
  const n = w * h;
  let sad = 0;
  let ssd = 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const va = a[4 * i + c];
      const vb = rp[4 * i + c];
      const d = va - vb;
      sad += Math.abs(d);
      ssd += d * d;
      sumA += va;
      sumB += vb;
    }
  }
  const m = 3 * n;
  const mae = sad / m;
  const rmse = Math.sqrt(ssd / m);
  const psnr = rmse > 0 ? 20 * Math.log10(255 / rmse) : Infinity;
  const meanA = sumA / m;
  const meanB = sumB / m;
  let cov = 0;
  let vA = 0;
  let vB = 0;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const da = a[4 * i + c] - meanA;
      const db = rp[4 * i + c] - meanB;
      cov += da * db;
      vA += da * da;
      vB += db * db;
    }
  }
  const r = vA > 0 && vB > 0 ? cov / Math.sqrt(vA * vB) : 0;
  return { mae, rmse, psnr, r };
}
