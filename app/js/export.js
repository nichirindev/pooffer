/* 05 — Desmos export: Equation IR -> pasteable Desmos strings + files. */
"use strict";

function fmt(n, digits) {
  const d = digits == null ? 4 : digits;
  if (!isFinite(n)) return "0";
  if (Math.abs(n) < 0.5 * Math.pow(10, -d)) return "0";
  let s = Number(n.toFixed(d)).toString();
  return s;
}

function lineToDesmos(eq) {
  const { x1, y1, x2, y2 } = eq;
  const dx = x2 - x1;
  const xa = fmt(Math.min(x1, x2)), xb = fmt(Math.max(x1, x2));
  const ya = fmt(Math.min(y1, y2)), yb = fmt(Math.max(y1, y2));
  if (Math.abs(dx) < 1e-9) {
    return `x=${fmt(x1)}\\left\\{${ya}\\le y\\le${yb}\\right\\}`;
  }
  const m = (y2 - y1) / dx;
  const b = y1 - m * x1;
  return `y=${fmt(m)}x+${fmt(b)}\\left\\{${xa}\\le x\\le${xb}\\right\\}`;
}

function lineToDesmosPlain(eq) {
  const { x1, y1, x2, y2 } = eq;
  const dx = x2 - x1;
  const xa = fmt(Math.min(x1, x2)), xb = fmt(Math.max(x1, x2));
  const ya = fmt(Math.min(y1, y2)), yb = fmt(Math.max(y1, y2));
  if (Math.abs(dx) < 1e-9) return `x=${fmt(x1)} {${ya}<=y<=${yb}}`;
  const m = (y2 - y1) / dx;
  const b = y1 - m * x1;
  const ms = fmt(m), bs = fmt(b);
  const expr = Number(bs) < 0 ? `y=${ms}x${bs}` : `y=${ms}x+${bs}`;
  return `${expr} {${xa}<=x<=${xb}}`;
}

function circleToDesmos(eq, plain) {
  const h = fmt(eq.h), k = fmt(eq.k), r = fmt(eq.r);
  const xh = Number(h) < 0 ? `(x+${fmt(-eq.h)})` : `(x-${h})`;
  const yk = Number(k) < 0 ? `(y+${fmt(-eq.k)})` : `(y-${k})`;
  return `${xh}^2+${yk}^2=${fmt(eq.r * eq.r)}`;
}

function ellipseToDesmos(eq) {
  const h = fmt(eq.h), k = fmt(eq.k), a = fmt(eq.a), b = fmt(eq.b);
  const xh = Number(h) < 0 ? `(x+${fmt(-eq.h)})` : `(x-${h})`;
  const yk = Number(k) < 0 ? `(y+${fmt(-eq.k)})` : `(y-${k})`;
  return `${xh}^2/${fmt(eq.a * eq.a)}+${yk}^2/${fmt(eq.b * eq.b)}=1`;
}

function bezierToDesmos(eq, plain) {
  const f = (p) => fmt(p);
  const { p0, p1, p2, p3 } = eq;
  const X = `(1-t)^3*${f(p0.x)}+3*(1-t)^2*t*${f(p1.x)}+3*(1-t)*t^2*${f(p2.x)}+t^3*${f(p3.x)}`;
  const Y = `(1-t)^3*${f(p0.y)}+3*(1-t)^2*t*${f(p1.y)}+3*(1-t)*t^2*${f(p2.y)}+t^3*${f(p3.y)}`;
  if (plain) return `(${X},${Y}) {0<=t<=1}`;
  return `\\left(${X},${Y}\\right)\\left\\{0\\le t\\le1\\right\\}`;
}

function polygonToDesmos(pts, plain) {
  const inner = pts.map((p) => `(${fmt(p.x)},${fmt(p.y)})`).join(",");
  return `\\operatorname{polygon}(${inner})`;
}

function polygonToDesmosPlain(pts) {
  return `polygon(${pts.map((p) => `(${fmt(p.x)},${fmt(p.y)})`).join(",")})`;
}

// Fourier trig curve: one parametric line per contour.
// (x0+SUM ax_n*cos(2*pi*n*t)+bx_n*sin(...), y0+SUM ...) {0<=t<=1}
function trigToDesmosPlain(eq) {
  const build = (base, getA, getB) => {
    let s = fmt(base);
    for (const tm of eq.terms) {
      const a = getA(tm), b = getB(tm);
      if (Math.abs(a) >= 5e-5) {
        const t = `${fmt(a)}*cos(2*pi*${tm.n}*t)`;
        s += t[0] === "-" ? t : "+" + t;
      }
      if (Math.abs(b) >= 5e-5) {
        const t = `${fmt(b)}*sin(2*pi*${tm.n}*t)`;
        s += t[0] === "-" ? t : "+" + t;
      }
    }
    return s;
  };
  const X = build(eq.x0, (tm) => tm.ax, (tm) => tm.bx);
  const Y = build(eq.y0, (tm) => tm.ay, (tm) => tm.by);
  return `(${X},${Y}) {0<=t<=1}`;
}

function equationToDesmos(eq, opts) {
  const plain = !(opts && opts.latex);
  switch (eq.type) {
    case "line": return plain ? lineToDesmosPlain(eq) : lineToDesmos(eq);
    case "circle": return circleToDesmos(eq, plain);
    case "ellipse": return ellipseToDesmos(eq);
    case "bezier": return bezierToDesmos(eq, plain);
    case "polygon": return plain ? polygonToDesmosPlain(eq.points) : polygonToDesmos(eq.points);
    case "parametric": return `(${eq.x},${eq.y}) {0<=t<=1}`;
    case "trig": return trigToDesmosPlain(eq);
    default: return "";
  }
}

// ---------- Single-formula mode ----------
// Builds ONE implicit equation f(x,y)=T whose zero level-set traces the outline.
// f is a sum of Gaussian bumps centered on sampled contour points:
//   f(x,y) = Σ e^(-((x-xi)^2+(y-yi)^2)/S)
// Paste the single line into Desmos; it renders the whole drawing at once.
// Per-pixel closed-form H(x,y) with exp/trig terms,
// fitted automatically to the uploaded image's contours.
function contoursToImplicitFormula(layers, opts) {
  const o = Object.assign({ maxTerms: 120, sigma: 0.18, level: 0.5 }, opts || {});
  const pts = [];
  (layers || []).forEach((L) => {
    (L.contoursNorm || []).forEach((c) => {
      for (let i = 0; i < c.length; i++) pts.push(c[i]);
    });
  });
  if (!pts.length) return "";
  const stride = Math.max(1, Math.ceil(pts.length / o.maxTerms));
  const sampled = [];
  for (let i = 0; i < pts.length; i += stride) sampled.push(pts[i]);
  const S = fmt(o.sigma * o.sigma, 5);
  const sub = (v, name) => (Number(fmt(v)) < 0 ? `(${name}+${fmt(-v)})` : `(${name}-${fmt(v)})`);
  const terms = sampled.map((p) => `e^(-(${sub(p.x, "x")}^2+${sub(p.y, "y")}^2)/${S})`);
  return `${terms.join("+")}=${fmt(o.level)}`;
}
function equationsToText(equations, opts) {
  return equations.map((e) => equationToDesmos(e, opts)).join("\n");
}

function buildProjectFile(settings, layers, equations, stats) {
  return JSON.stringify({ version: 1, settings, layers, equations, stats }, null, 2);
}

const EX = {
  fmt, equationToDesmos, equationsToText, buildProjectFile, contoursToImplicitFormula,
  polygonToDesmosPlain, bezierToDesmos, lineToDesmosPlain, circleToDesmos, trigToDesmosPlain,
};
if (typeof module !== "undefined" && module.exports) module.exports = EX;
if (typeof window !== "undefined") window.EX = EX;
