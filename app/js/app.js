/* 04 — Frontend controller: upload -> pipeline -> preview -> export. */
"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  const drop = $("drop"), fileInput = $("file"), preview = $("preview");
  const ctx = preview.getContext("2d");
  const bar = $("bar"), statusEl = $("status");

  const state = {
    img: null, imgW: 0, imgH: 0,
    mode: "outline",
    settings: {},
    layers: [],          // {color, contoursNorm, contoursPx}
    equations: [],       // IR + {desmos, visible}
    hidden: new Set(),
    intermediates: {},   // canvases per stage
    procW: 0, procH: 0,
    stats: {},
    stage: "final",
  };

  function readSettings() {
    const detail = +$("detail").value;
    const procSize = detail < 25 ? 192 : detail < 50 ? 288 : detail < 75 ? 384 : 512;
    return {
      detail, procSize,
      autoThresh: $("autoThresh").checked,
      threshold: +$("threshold").value,
      contrast: +$("contrast").value,
      brightness: +$("brightness").value,
      smoothing: +$("smoothing").value,
      tolerance: +$("tolerance").value,
      maxEquations: +$("maxEq").value,
      model: $("model").value,
      colorCount: +$("colorCount").value,
      fillMode: $("fillMode").value,
      mode: state.mode,
    };
  }

  function setStatus(t) { statusEl.textContent = t; }
  function setBar(p) { bar.style.width = Math.round(p * 100) + "%"; }

  /* ---------- upload ---------- */
  drop.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); });
  ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
  document.addEventListener("paste", (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.startsWith("image/")) { loadFile(it.getAsFile()); break; }
    }
  });

  function loadFile(f) {
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
      // still try — browser may decode more
      if (!f.type.startsWith("image/")) { setStatus("Unsupported file. Use PNG/JPG/WebP."); return; }
    }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      state.img = img; state.imgW = img.naturalWidth; state.imgH = img.naturalHeight;
      URL.revokeObjectURL(url);
      $("process").disabled = false;
      drawOriginal();
      setStatus(`Loaded ${f.name || "pasted image"} (${state.imgW}×${state.imgH}). Adjust settings, then Process.`);
      setBar(0.05);
    };
    img.onerror = () => setStatus("Could not decode that image. Try PNG/JPG/WebP.");
    img.src = url;
  }

  $("loadSample").addEventListener("click", () => {
    // draw a built-in heart+star sample so the app works with zero files
    const c = document.createElement("canvas"); c.width = c.height = 400;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 400, 400);
    g.fillStyle = "#111"; g.strokeStyle = "#111"; g.lineWidth = 10;
    // heart
    g.beginPath();
    g.moveTo(200, 320);
    g.bezierCurveTo(60, 200, 90, 90, 200, 150);
    g.bezierCurveTo(310, 90, 340, 200, 200, 320);
    g.fill();
    // star cutout
    g.fillStyle = "#fff";
    g.beginPath();
    const cx = 200, cy = 210, R = 55, r = 23;
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? R : r, a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = cx + rad * Math.cos(a), y = cy + rad * Math.sin(a);
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath(); g.fill();
    // circle
    g.strokeStyle = "#111"; g.lineWidth = 8;
    g.beginPath(); g.arc(200, 200, 150, 0, Math.PI * 2); g.stroke();
    const img = new Image();
    img.onload = () => {
      state.img = img; state.imgW = 400; state.imgH = 400;
      $("process").disabled = false; drawOriginal();
      setStatus("Sample loaded. Press Process.");
    };
    img.src = c.toDataURL();
  });

  $("openDesmos").addEventListener("click", () => window.open("https://www.desmos.com/calculator", "_blank"));

  /* ---------- settings UI ---------- */
  const sliders = ["detail", "threshold", "contrast", "brightness", "smoothing", "tolerance"];
  sliders.forEach((id) => $(id).addEventListener("input", () => {
    $(id + "V").textContent = $(id).value;
    if (id === "threshold") { $("autoThresh").checked = false; $("thresholdV").textContent = $(id).value; }
  }));
  $("autoThresh").addEventListener("change", (e) => {
    $("thresholdV").textContent = e.target.checked ? "auto" : $("threshold").value;
  });
  document.querySelectorAll("#modes .mode").forEach((m) => m.addEventListener("click", () => {
    document.querySelectorAll("#modes .mode").forEach((x) => x.classList.remove("active"));
    m.classList.add("active"); state.mode = m.dataset.mode;
  }));
  document.querySelectorAll("#stageTabs .tab").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll("#stageTabs .tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active"); state.stage = t.dataset.stage; renderStage();
  }));

  let debounce = null;
  ["detail", "contrast", "brightness", "smoothing", "tolerance", "maxEq", "model", "colorCount", "fillMode", "threshold"].forEach((id) => {
    $(id).addEventListener("change", () => {
      if (!state.img || state.equations.length === 0) return;
      clearTimeout(debounce); debounce = setTimeout(() => runPipeline(), 350);
    });
  });
  $("autoThresh").addEventListener("change", () => {
    if (state.img && state.equations.length) runPipeline();
  });

  $("process").addEventListener("click", runPipeline);
  $("exportTop").addEventListener("click", () => { copyAll(); });

  /* ---------- pipeline ---------- */
  function getResizedRGBA(procSize) {
    const scale = Math.min(1, procSize / Math.max(state.imgW, state.imgH));
    const w = Math.max(16, Math.round(state.imgW * scale));
    const h = Math.max(16, Math.round(state.imgH * scale));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    g.drawImage(state.img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h);
    return { rgba: d.data, w, h, canvas: c };
  }

  function grayToCanvas(gray, w, h) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    const id = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = Math.round(gray[i]);
      id.data[i * 4 + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  }
  function binaryToCanvas(bin, w, h) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    const id = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = bin[i] ? 255 : 0;
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v;
      id.data[i * 4 + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  }

  function drawOriginal() {
    const c = document.createElement("canvas");
    const s = readSettings();
    const sc = Math.min(1, 480 / Math.max(state.imgW, state.imgH));
    c.width = Math.round(state.imgW * sc); c.height = Math.round(state.imgH * sc);
    c.getContext("2d").drawImage(state.img, 0, 0, c.width, c.height);
    state.intermediates.original = c;
    if (state.stage === "original" || state.equations.length === 0) renderStage();
  }

  async function runPipeline() {
    if (!state.img) return;
    const t0 = performance.now();
    const s = readSettings();
    state.settings = s;
    $("process").disabled = true;
    setBar(0.05); setStatus("Resizing…");
    await tick();

    try {
      const { rgba, w, h } = getResizedRGBA(s.mode === "advanced" ? Math.min(512, s.procSize + 96) : s.procSize);
      state.procW = w; state.procH = h;
      let gray = IP.toGrayscale(rgba, w, h);
      gray = IP.adjustBrightnessContrast(gray, w, h, s.brightness, s.contrast);
      const sigma = 0.3 + (s.smoothing / 100) * 2.2;
      const blurred = IP.separableBlur(gray, w, h, sigma);
      setBar(0.25); setStatus("Thresholding…"); await tick();

      const threshVal = s.autoThresh ? IP.otsuThreshold(blurred, w, h) : s.threshold;
      $("thresholdV").textContent = s.autoThresh ? `auto (${threshVal})` : `${s.threshold}`;
      let binary = IP.applyThreshold(blurred, w, h, threshVal);
      binary = IP.morphOpen(binary, w, h);

      state.intermediates.gray = grayToCanvas(blurred, w, h);
      state.intermediates.thresh = binaryToCanvas(binary, w, h);

      setBar(0.4); setStatus("Detecting edges…"); await tick();
      const { edges } = IP.sobelEdges(blurred, w, h);
      state.intermediates.edges = binaryToCanvas(edges, w, h);

      setBar(0.55); setStatus("Extracting contours…"); await tick();
      const eps = 0.02 + (s.tolerance / 100) * 0.35; // graph units
      const minLen = Math.max(6, Math.round(Math.max(w, h) * 0.02));
      const preferCurves = s.model !== "lines";
      const perLayerBudget = s.maxEquations;
      state.layers = [];
      let allContoursPx = [];

      if (s.mode === "color") {
        const q = IP.quantizeColors(rgba, w, h, s.colorCount, 9000);
        // background = most common label -> treat as background, still outline others
        const order = q.counts.map((n, i) => ({ n, i })).sort((a, b) => b.n - a.n);
        const bg = order[0].i;
        for (const { i } of order) {
          if (i === bg && s.fillMode === "fill") continue; // skip bg fill
          const mask = IP.maskForLabel(q.labels, w, h, i);
          const opened = IP.morphOpen(mask, w, h);
          const loops = IP.traceBoundaries(opened, w, h, minLen);
          const cleaned = IP.cleanupContours(loops, w, h, minLen);
          if (!cleaned.length) continue;
          const norm = IP.normalizeContours(cleaned, w, h, 10);
          state.layers.push({ color: q.hex[i], label: i, contoursPx: cleaned, contoursNorm: norm });
          allContoursPx.push(...cleaned);
        }
        if (!state.layers.length) throw new Error("No color regions found. Try fewer colors or lower threshold.");
      } else if (s.mode === "silhouette") {
        // foreground = dark side of threshold (ink). binary:1=white. use inverted if bg is dark?
        // choose foreground as minority class
        let ones = 0; for (let i = 0; i < w * h; i++) ones += binary[i];
        let fg = binary;
        if (ones > w * h / 2) { fg = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) fg[i] = binary[i] ? 0 : 1; }
        const loops = IP.traceBoundaries(fg, w, h, minLen);
        const cleaned = IP.cleanupContours(loops, w, h, minLen);
        if (!cleaned.length) throw new Error("No strong contours were detected. Try increasing contrast or changing the threshold.");
        state.layers.push({ color: "#1b1b1b", contoursPx: cleaned, contoursNorm: IP.normalizeContours(cleaned, w, h, 10) });
        allContoursPx = cleaned;
      } else {
        // outline + advanced: edge chaining (+ adaptive binary loops for advanced)
        let paths = IP.extractEdgePaths(edges, w, h, minLen);
        if (s.mode === "advanced") {
          const adapt = IP.adaptiveThreshold(blurred, w, h, 21, 6);
          const loops = IP.traceBoundaries(adapt, w, h, minLen + 4);
          paths = paths.concat(loops);
        }
        const cleaned = IP.cleanupContours(paths, w, h, Math.max(5, minLen - 3));
        if (!cleaned.length) throw new Error("No strong contours were detected. Try increasing contrast or changing the threshold.");
        state.layers.push({ color: null, contoursPx: cleaned, contoursNorm: IP.normalizeContours(cleaned, w, h, 10) });
        allContoursPx = cleaned;
      }

      // contours overlay stage
      state.intermediates.contours = drawContoursCanvas(allContoursPx, w, h);

      setBar(0.7); setStatus("Fitting curves…"); await tick();
      const budget = Math.max(10, s.maxEquations);
      const perLayer = Math.max(10, Math.floor(budget / state.layers.length));
      let equations = [];
      let totalIn = 0, totalSimp = 0, nContours = 0;
      state.layers.forEach((L, li) => {
        nContours += L.contoursNorm.length;
        if (s.fillMode === "fill" && (s.mode === "silhouette" || s.mode === "color")) {
          const polys = ME.contoursToPolygons(L.contoursNorm, eps * 1.4, 48);
          polys.forEach((pts) => {
            if (equations.length >= budget) return;
            equations.push({ type: "polygon", points: pts, layer: li, color: L.color, closed: true });
          });
          totalIn += L.contoursNorm.reduce((a, c) => a + c.length, 0);
          totalSimp += polys.reduce((a, c) => a + c.length, 0);
        } else {
          const res = ME.processContours(L.contoursNorm, {
            mode: s.mode, tolerance: eps, maxEquations: perLayer,
            preferCurves, colorHex: L.color, layer: li,
          });
          equations.push(...res.equations);
          totalIn += res.stats.pointsIn; totalSimp += res.stats.pointsSimp;
        }
      });

      if (!equations.length) throw new Error("Curve fitting produced no equations. Lower curve tolerance or raise max equations.");
      equations = equations.slice(0, budget);
      equations.forEach((e, i) => { e.id = i; e.desmos = EX.equationToDesmos(e, { plain: true }); e.visible = !state.hidden.has(i); });
      state.equations = equations;
      // reindex hidden set
      state.hidden.clear();

      const t1 = performance.now();
      const err = totalIn ? 1 - totalSimp / totalIn : 0;
      const sim = Math.max(0, Math.min(0.99, 1 - err * 0.9 - Math.min(0.3, equations.length / 4000)));
      state.stats = {
        contours: nContours, pointsIn: totalIn, pointsSimp: totalSimp,
        equations: equations.length, ms: Math.round(t1 - t0),
        error: err, similarity: sim, threshold: threshVal,
      };

      setBar(1); setStatus(`Done in ${state.stats.ms} ms — ${nContours} contours → ${equations.length} equations.`);
      state.stage = "final";
      document.querySelectorAll("#stageTabs .tab").forEach((x) => x.classList.toggle("active", x.dataset.stage === "final"));
      renderAll();
      $("process").disabled = false;
    } catch (err) {
      $("process").disabled = false;
      setBar(0);
      setStatus("Error: " + (err && err.message ? err.message : err));
    }
  }

  function tick() { return new Promise((r) => setTimeout(r, 10)); }

  function drawContoursCanvas(contoursPx, w, h) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#111"; g.lineWidth = Math.max(1, w / 300);
    for (const path of contoursPx) {
      g.beginPath();
      path.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.stroke();
    }
    return c;
  }

  /* ---------- render ---------- */
  function fitCanvas() {
    const box = preview.parentElement.getBoundingClientRect();
    const size = Math.min(box.width - 28, 640);
    preview.style.height = size + "px";
  }
  window.addEventListener("resize", () => { fitCanvas(); renderStage(); });

  function renderStage() {
    fitCanvas();
    const W = preview.width, H = preview.height;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    if (state.stage === "final") { renderGraph(); return; }
    const c = state.intermediates[state.stage === "gray" ? "gray" : state.stage === "thresh" ? "thresh" : state.stage === "edges" ? "edges" : state.stage === "contours" ? "contours" : "original"];
    if (!c) { ctx.fillStyle = "#93a1b8"; ctx.font = "14px sans-serif"; ctx.fillText("Process an image to see this stage.", 20, 30); return; }
    // contain
    const sc = Math.min(W / c.width, H / c.height);
    const dw = c.width * sc, dh = c.height * sc;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(c, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  function graphTransform(W, H) {
    const R = 11; // half-range with margin
    const sc = Math.min(W, H) / (2 * R);
    return {
      X: (x) => W / 2 + x * sc,
      Y: (y) => H / 2 - y * sc,
      sc,
    };
  }

  function renderGraph() {
    const W = preview.width, H = preview.height;
    const { X, Y, sc } = graphTransform(W, H);
    // grid
    ctx.strokeStyle = "#e5e9f0"; ctx.lineWidth = 1;
    const step = sc >= 60 ? 1 : sc >= 28 ? 2 : 5;
    for (let gx = -10; gx <= 10; gx += step) {
      ctx.beginPath(); ctx.moveTo(X(gx), 0); ctx.lineTo(X(gx), H); ctx.stroke();
    }
    for (let gy = -10; gy <= 10; gy += step) {
      ctx.beginPath(); ctx.moveTo(0, Y(gy)); ctx.lineTo(W, Y(gy)); ctx.stroke();
    }
    // axes
    ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(0), 0); ctx.lineTo(X(0), H); ctx.stroke();

    const vis = state.equations.filter((e) => !state.hidden.has(e.id));
    for (const e of vis) {
      ctx.strokeStyle = e.color || "#111827";
      ctx.fillStyle = e.color ? e.color + "55" : "rgba(17,24,39,.08)";
      ctx.lineWidth = Math.max(1.2, sc * 0.02);
      if (e.type === "line") {
        ctx.beginPath(); ctx.moveTo(X(e.x1), Y(e.y1)); ctx.lineTo(X(e.x2), Y(e.y2)); ctx.stroke();
      } else if (e.type === "circle") {
        ctx.beginPath(); ctx.arc(X(e.h), Y(e.k), e.r * sc, 0, Math.PI * 2); ctx.stroke();
      } else if (e.type === "ellipse") {
        ctx.beginPath(); ctx.ellipse(X(e.h), Y(e.k), e.a * sc, e.b * sc, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (e.type === "bezier") {
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const t = i / 24, u = 1 - t;
          const x = u*u*u*e.p0.x + 3*u*u*t*e.p1.x + 3*u*t*t*e.p2.x + t*t*t*e.p3.x;
          const y = u*u*u*e.p0.y + 3*u*u*t*e.p1.y + 3*u*t*t*e.p2.y + t*t*t*e.p3.y;
          i === 0 ? ctx.moveTo(X(x), Y(y)) : ctx.lineTo(X(x), Y(y));
        }
        ctx.stroke();
      } else if (e.type === "polygon") {
        ctx.beginPath();
        e.points.forEach((p, i) => (i === 0 ? ctx.moveTo(X(p.x), Y(p.y)) : ctx.lineTo(X(p.x), Y(p.y))));
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    if (!vis.length && state.equations.length) {
      ctx.fillStyle = "#64748b"; ctx.font = "14px sans-serif";
      ctx.fillText("All equations hidden — toggle 👁 in the list.", 16, 24);
    }
  }

  function renderAll() {
    // stats
    $("sContours").textContent = state.stats.contours;
    $("sEquations").textContent = state.stats.equations;
    $("sPoints").textContent = `${state.stats.pointsSimp}/${state.stats.pointsIn}`;
    $("sTime").textContent = `${state.stats.ms} ms`;
    $("sError").textContent = state.stats.error.toFixed(3);
    $("sSim").textContent = Math.round(state.stats.similarity * 100) + "%";
    renderStage(); renderEqList();
    const has = state.equations.length > 0;
    $("copyAll").disabled = !has;
    $("dlTxt").disabled = !has;
    $("dlJson").disabled = !has;
    $("dlProj").disabled = !has;
    $("exportTop").disabled = !has;
  }

  function renderEqList() {
    const box = $("eqList"); box.innerHTML = "";
    $("eqCount").textContent = `(${state.equations.length})`;
    const N = Math.min(state.equations.length, 600);
    for (let i = 0; i < N; i++) {
      const e = state.equations[i];
      const div = document.createElement("div"); div.className = "eq";
      const hid = state.hidden.has(e.id);
      div.style.opacity = hid ? 0.45 : 1;
      div.innerHTML = `<div class="meta"><span class="badge ${e.type}">${e.type}</span>` +
        (e.color ? `<span class="dot" style="background:${e.color}"></span><span style="color:var(--muted)">${e.color}</span>` : "") +
        `<span style="flex:1"></span></div><code></code><div class="meta"></div>`;
      div.querySelector("code").textContent = e.desmos;
      const meta = div.querySelectorAll(".meta")[1];
      const btnEye = document.createElement("button"); btnEye.className = "ghost small"; btnEye.textContent = hid ? "👁‍🗨" : "👁";
      btnEye.onclick = () => { hid ? state.hidden.delete(e.id) : state.hidden.add(e.id); renderStage(); renderEqList(); };
      const btnCopy = document.createElement("button"); btnCopy.className = "ghost small"; btnCopy.textContent = "Copy";
      btnCopy.onclick = () => copyText(e.desmos, () => { btnCopy.textContent = "✓"; setTimeout(() => (btnCopy.textContent = "Copy"), 900); });
      meta.append(btnEye, btnCopy);
      box.append(div);
    }
    if (state.equations.length > N) {
      const d = document.createElement("div"); d.className = "hint";
      d.textContent = `…and ${state.equations.length - N} more (included in Copy all / downloads).`;
      box.append(d);
    }
  }

  /* ---------- export ---------- */
  function visibleEquations() { return state.equations.filter((e) => !state.hidden.has(e.id)); }

  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    ta.remove(); if (done) done();
  }

  function copyAll() {
    const eqs = visibleEquations();
    if (!eqs.length) { setStatus("All equations hidden — nothing to copy."); return; }
    const text = eqs.map((e) => e.desmos).join("\n");
    copyText(text, () => setStatus(`Copied ${eqs.length} equations. Paste line-by-line into Desmos.`));
  }
  $("copyAll").addEventListener("click", copyAll);

  function download(name, text, mime) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime || "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $("dlTxt").addEventListener("click", () => download("desmos-equations.txt", visibleEquations().map((e) => e.desmos).join("\n")));
  $("dlJson").addEventListener("click", () => download("desmos-equations.json", JSON.stringify({ equations: visibleEquations().map((e) => e.desmos), stats: state.stats }, null, 2), "application/json"));
  $("dlProj").addEventListener("click", () => download("project.desmosimg", EX.buildProjectFile(state.settings, state.layers.map((l) => ({ color: l.color })), state.equations, state.stats), "application/json"));

  fitCanvas();
  renderStage();
})();
