/* 02 — Image Processing Engine (pure, no DOM). Works in browser + Node. */
"use strict";

/* ---------- grayscale / adjust ---------- */

function toGrayscale(rgba, w, h, out) {
  const g = out || new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4], gg = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    g[i] = 0.299 * r + 0.587 * gg + 0.114 * b;
  }
  return g;
}

function adjustBrightnessContrast(gray, w, h, brightness, contrast) {
  // brightness -100..100, contrast -100..100
  const b = brightness || 0;
  const c = contrast || 0;
  const factor = (259 * (c + 255)) / (255 * (259 - c));
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    let v = factor * (gray[i] - 128) + 128 + b;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

/* ---------- blur ---------- */

function gaussianKernel1D(sigma) {
  if (!sigma || sigma < 0.3) return [1];
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const k = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k.push(v);
    sum += v;
  }
  return k.map((v) => v / sum);
}

function separableBlur(gray, w, h, sigma) {
  const k = gaussianKernel1D(sigma);
  const r = Math.floor(k.length / 2);
  if (r === 0) return Float32Array.from(gray);
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const xx = Math.min(w - 1, Math.max(0, x + i));
        s += gray[y * w + xx] * k[i + r];
      }
      tmp[y * w + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const yy = Math.min(h - 1, Math.max(0, y + i));
        s += tmp[yy * w + x] * k[i + r];
      }
      out[y * w + x] = s;
    }
  }
  return out;
}

/* ---------- threshold ---------- */

function otsuThreshold(gray, w, h) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < w * h; i++) hist[Math.min(255, Math.max(0, Math.round(gray[i])))]++;
  const total = w * h;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thresh = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thresh = i; }
  }
  return thresh;
}

function applyThreshold(gray, w, h, threshold) {
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = gray[i] > threshold ? 1 : 0;
  return out;
}

function adaptiveThreshold(gray, w, h, blockSize, C) {
  const bs = Math.max(3, blockSize | 0 || 15);
  const half = Math.floor(bs / 2);
  const out = new Uint8Array(w * h);
  // integral image for speed
  const integ = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + row;
    }
  }
  const c = C == null ? 5 : C;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - half), y1 = Math.max(0, y - half);
      const x2 = Math.min(w - 1, x + half), y2 = Math.min(h - 1, y + half);
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integ[(y2 + 1) * (w + 1) + x2 + 1] - integ[y1 * (w + 1) + x2 + 1] -
        integ[(y2 + 1) * (w + 1) + x1] + integ[y1 * (w + 1) + x1];
      const mean = sum / area;
      out[y * w + x] = gray[y * w + x] > mean - c ? 1 : 0;
    }
  }
  return out;
}

/* ---------- morphology ---------- */

function morphOpen(binary, w, h) {
  return morphClose(morphErode(binary, w, h), w, h, true);
}

function morphErode(binary, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let dy = -1; dy <= 1 && v; dy++) {
        for (let dx = -1; dx <= 1 && v; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) { v = 0; break; }
          if (!binary[yy * w + xx]) v = 0;
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function morphDilate(binary, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = -1; dy <= 1 && !v; dy++) {
        for (let dx = -1; dx <= 1 && !v; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          if (binary[yy * w + xx]) v = 1;
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function morphClose(binary, w, h, skipDilate) {
  const d = skipDilate ? binary : morphDilate(binary, w, h);
  return morphErode(d, w, h);
}

/* ---------- edges (Sobel) ---------- */

function sobelEdges(gray, w, h, lowT, highT) {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const mag = new Float32Array(w * h);
  const KX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const KY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sx = 0, sy = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = gray[(y + dy) * w + x + dx];
          sx += v * KX[k]; sy += v * KY[k]; k++;
        }
      }
      gx[y * w + x] = sx; gy[y * w + x] = sy;
      mag[y * w + x] = Math.sqrt(sx * sx + sy * sy);
    }
  }
  // auto thresholds from magnitude histogram if not given
  let max = 0;
  for (let i = 0; i < w * h; i++) if (mag[i] > max) max = mag[i];
  const lo = lowT != null ? lowT : max * 0.15;
  const hi = highT != null ? highT : max * 0.35;
  const edges = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) edges[i] = mag[i] >= hi ? 1 : 0;
  // hysteresis: connect weak edges adjacent to strong
  let changed = true;
  const weak = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) weak[i] = mag[i] >= lo ? 1 : 0;
  while (changed) {
    changed = false;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!edges[i] && weak[i]) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (edges[(y + dy) * w + x + dx]) { edges[i] = 1; changed = true; break; }
            }
            if (edges[i]) break;
          }
        }
      }
    }
    break; // single pass is enough for speed; strong+adjacent weak included
  }
  return { edges, mag, max };
}

/* ---------- contour extraction ---------- */

// Chain unordered edge pixels into ordered paths (8-connectivity greedy walk).
function extractEdgePaths(edgeBinary, w, h, minLen) {
  const minL = minLen == null ? 8 : minLen;
  const visited = new Uint8Array(w * h);
  const paths = [];
  const NB = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  function walk(sx, sy) {
    const path = [{ x: sx, y: sy }];
    visited[sy * w + sx] = 1;
    let cx = sx, cy = sy;
    while (true) {
      let found = false;
      for (const [dx, dy] of NB) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (edgeBinary[ni] && !visited[ni]) {
          visited[ni] = 1;
          path.push({ x: nx, y: ny });
          cx = nx; cy = ny; found = true;
          break;
        }
      }
      if (!found) break;
      if (path.length > w * h) break;
    }
    return path;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (edgeBinary[i] && !visited[i]) {
        const p = walk(x, y);
        if (p.length >= minL) paths.push(p);
      }
    }
  }
  return paths;
}

// Moore-neighbor boundary tracing for binary foreground (1=fg). Returns closed loops.
function traceBoundaries(binary, w, h, minLen) {
  const minL = minLen == null ? 10 : minLen;
  const visitedStart = new Set();
  const loops = [];
  const NB = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  function isFg(x, y) {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    return !!binary[y * w + x];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isFg(x, y) || isFg(x, y - 1)) continue; // top edge of component
      const key = y * w + x;
      if (visitedStart.has(key)) continue;
      // Moore trace
      const loop = [];
      let cx = x, cy = y, dir = 6; // start looking up-left-ish
      let guard = 0;
      do {
        loop.push({ x: cx, y: cy });
        visitedStart.add(cy * w + cx);
        let found = false;
        for (let k = 0; k < 8; k++) {
          const nd = (dir + k) % 8;
          const nx = cx + NB[nd][0], ny = cy + NB[nd][1];
          if (isFg(nx, ny)) {
            cx = nx; cy = ny;
            dir = (nd + 5) % 8;
            found = true;
            break;
          }
        }
        if (!found) break;
        guard++;
        if (guard > w * h * 2) break;
      } while (!(cx === x && cy === y) && guard < 20000);
      if (loop.length >= minL) loops.push(loop);
    }
  }
  return loops;
}

function cleanupContours(contours, w, h, minLen) {
  const minL = minLen == null ? 8 : minLen;
  const minAreaDim = Math.max(w, h) * 0.004;
  return contours.filter((c) => {
    if (!c || c.length < minL) return false;
    // drop tiny bounding boxes (noise)
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const p of c) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const diag = Math.hypot(maxX - minX, maxY - minY);
    if (diag < minAreaDim) return false;
    // drop full-frame border loop (outer image edge, not part of the artwork)
    if (minX <= 1 && minY <= 1 && maxX >= w - 2 && maxY >= h - 2) return false;
    return true;
  });
}

// Image coords (0,0 top-left, y down) -> graph coords (centered, y up, range ~[-10,10]).
function normalizeContours(contours, w, h, range) {
  const R = range || 10;
  const scale = (2 * R) / Math.max(w, h);
  const ox = w / 2, oy = h / 2;
  return contours.map((c) =>
    c.map((p) => ({ x: (p.x - ox) * scale, y: (oy - p.y) * scale }))
  );
}

/* ---------- color quantization (simple k-means on sampled pixels) ---------- */

function quantizeColors(rgba, w, h, k, maxSamples) {
  k = Math.min(8, Math.max(2, k | 0 || 4));
  const n = w * h;
  const step = Math.max(1, Math.floor(n / (maxSamples || 8000)));
  const samples = [];
  for (let i = 0; i < n; i += step) samples.push([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
  // k-means++ style seeding: each new center is the sample farthest from
  // the centers chosen so far (evenly-spaced init collapses on banded images)
  const dist2 = (a, b) => {
    const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
    return dx * dx + dy * dy + dz * dz;
  };
  const centers = [samples[0].slice()];
  while (centers.length < k) {
    let bi = -1, bd = 0;
    for (let i = 0; i < samples.length; i++) {
      let md = 1e18;
      for (const c of centers) { const d = dist2(samples[i], c); if (d < md) md = d; }
      if (md > bd) { bd = md; bi = i; }
    }
    if (bi < 0 || bd <= 0) break; // no distinct color left
    centers.push(samples[bi].slice());
  }
  while (centers.length < k) centers.push(samples[centers.length % samples.length].slice());
  const assign = new Array(samples.length).fill(0);
  for (let iter = 0; iter < 8; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i++) {
      let best = 0, bd = 1e18;
      for (let c = 0; c < k; c++) {
        const dx = samples[i][0] - centers[c][0], dy = samples[i][1] - centers[c][1], dz = samples[i][2] - centers[c][2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bd) { bd = d; best = c; }
      }
      assign[i] = best;
      sums[best][0] += samples[i][0]; sums[best][1] += samples[i][1]; sums[best][2] += samples[i][2]; sums[best][3]++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3] > 0) {
        centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
      } else {
        // rescue dead cluster: re-seed at the sample farthest from all centers
        let bi = 0, bd = -1;
        for (let i = 0; i < samples.length; i++) {
          let md = 1e18;
          for (const cc of centers) { const d = dist2(samples[i], cc); if (d < md) md = d; }
          if (md > bd) { bd = md; bi = i; }
        }
        centers[c] = samples[bi].slice();
      }
    }
  }
  // assign every pixel
  const labels = new Uint8Array(n);
  const counts = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    let best = 0, bd = 1e18;
    for (let c = 0; c < k; c++) {
      const dx = r - centers[c][0], dy = g - centers[c][1], dz = b - centers[c][2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = c; }
    }
    labels[i] = best; counts[best]++;
  }
  const hex = centers.map((c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""));
  return { labels, centers, hex, counts };
}

function maskForLabel(labels, w, h, label) {
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = labels[i] === label ? 1 : 0;
  return out;
}

// Node + browser export
const IP = {
  toGrayscale, adjustBrightnessContrast, separableBlur, gaussianKernel1D,
  otsuThreshold, applyThreshold, adaptiveThreshold,
  morphOpen, morphErode, morphDilate, morphClose,
  sobelEdges, extractEdgePaths, traceBoundaries, cleanupContours,
  normalizeContours, quantizeColors, maskForLabel,
};
if (typeof module !== "undefined" && module.exports) module.exports = IP;
if (typeof window !== "undefined") window.IP = IP;
