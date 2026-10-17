import { useCallback, useEffect, useRef, useState } from 'react';
import EX from './lib/export.js';
import {
  renderVillage,
  traceImage,
  drawEquations,
  paintRef,
  computeMetrics,
} from './render.js';
import { VILLAGE_EQ, TRACE_HINT_UPLOADED, TRACE_HINT_EMPTY } from './villageEq.js';
import { Reveal, useScroll, useCountUp } from './fx.jsx';
import {
  SplitChars,
  Magnetic,
  Cursor,
  Starburst,
  useLenis,
} from './fx.jsx';

const VILLAGE_STATUS =
  'Samples the same continuous field as the 2000×1200 native grid (endpoints match, so full width reproduces native pixels exactly).';

function Stat({ label, value, format }) {
  const text = useCountUp(value, format);
  return (
    <div className="stat">
      <small>{label}</small>
      <b>{text}</b>
    </div>
  );
}

export default function App() {
  const artRef = useRef(null);
  const refCanvasRef = useRef(null);
  const fileRef = useRef(null);
  const eqRef = useRef(null);
  const refImg = useRef(null);
  const jobRef = useRef(null);
  const dimsRef = useRef({ w: 400, h: 240 });

  const [refInfo, setRefInfo] = useState(null);
  const [mode, setMode] = useState('village');
  const [width, setWidth] = useState(400);
  const [detail, setDetail] = useState('std');
  const [colors, setColors] = useState(0);
  const [fit, setFit] = useState('seg');
  const [harmonics, setHarmonics] = useState(8);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(VILLAGE_STATUS);
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [artSize, setArtSize] = useState(null);
  const [eqText, setEqText] = useState(VILLAGE_EQ);
  const [palette, setPalette] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const { scrolled } = useScroll();
  const lenisRef = useLenis(true);

  /* blue (nous) / lime (lando) theme, persisted */
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('ma-theme') || 'blue';
    } catch {
      return 'blue';
    }
  });
  useEffect(() => {
    if (theme === 'lime') document.documentElement.dataset.theme = 'lime';
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem('ma-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const go = (e, sel) => {
    e.preventDefault();
    const el = document.querySelector(sel);
    if (!el) return;
    if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: -84 });
    else el.scrollIntoView({ behavior: 'smooth' });
  };

  /* placeholder ref canvas on mount */
  useEffect(() => {
    paintRef(refCanvasRef.current, null, dimsRef.current.w, dimsRef.current.h);
  }, []);

  const loadFile = useCallback(
    (f) => {
      if (!f || !f.type.startsWith('image/')) {
        setStatus('Unsupported file. Use PNG/JPG/WebP.');
        return;
      }
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        refImg.current = img;
        URL.revokeObjectURL(url);
        setRefInfo({
          name: f.name || 'pasted image',
          w: img.naturalWidth,
          h: img.naturalHeight,
        });
        paintRef(refCanvasRef.current, img, dimsRef.current.w, dimsRef.current.h);
        if (metrics) {
          try {
            setMetrics(
              computeMetrics(
                artRef.current,
                refCanvasRef.current,
                dimsRef.current.w,
                dimsRef.current.h,
              ),
            );
          } catch {
            /* art canvas empty — compare on next render */
          }
        }
      };
      img.onerror = () => setStatus('Could not decode that image. Try PNG/JPG/WebP.');
      img.src = url;
    },
    [metrics],
  );

  /* paste-to-upload */
  useEffect(() => {
    const h = (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          loadFile(it.getAsFile());
          break;
        }
      }
    };
    document.addEventListener('paste', h);
    return () => document.removeEventListener('paste', h);
  }, [loadFile]);

  const onMode = (m) => {
    setMode(m);
    setEqText(
      m === 'trace'
        ? refImg.current
          ? TRACE_HINT_UPLOADED
          : TRACE_HINT_EMPTY
        : VILLAGE_EQ,
    );
  };

  async function renderNow() {
    if (jobRef.current) jobRef.current.cancelled = true;
    const job = { cancelled: false };
    jobRef.current = job;
    setBusy(true);
    setProgress(0);
    try {
      if (mode === 'trace') {
        if (!refImg.current) {
          setStatus('Upload an image first (section 1).');
          return;
        }
        let r;
        try {
          r = await traceImage(
            refImg.current,
            {
              fine: detail === 'fine',
              W: width,
              colorCount: colors,
              fit,
              harmonics,
            },
            (p, m) => {
              if (!job.cancelled) {
                setProgress(p);
                setStatus(m);
              }
            },
            job,
          );
        } catch (err) {
          if (!job.cancelled) {
            setProgress(0);
            setStatus('Error: ' + (err && err.message ? err.message : err));
          }
          return;
        }
        if (!r || job.cancelled) return;
        artRef.current.width = r.Wp;
        artRef.current.height = r.Hp;
        drawEquations(artRef.current, r.equations, r.layers, r.pw, r.ph);
        setProgress(1);
        const text = r.equations
          .map((e) => EX.equationToDesmos(e, { plain: true }))
          .join('\n');
        const kind =
          fit === 'trig'
            ? `Fourier trig equations (${harmonics} harmonics each)`
            : 'vector equations';
        setEqText(
          `${text}\n\n// ${r.equations.length} ${kind} from ${r.nContours} contours — paste whole box into Desmos, or admire the hi-res render above`,
        );
        setPalette(r.palette);
        dimsRef.current = { w: r.Wp, h: r.Hp };
        setArtSize({ w: r.Wp, h: r.Hp });
        paintRef(refCanvasRef.current, refImg.current, r.Wp, r.Hp);
        setMetrics(computeMetrics(artRef.current, refCanvasRef.current, r.Wp, r.Hp));
        setStatus(
          `Done — ${r.nContours} contours → ${r.equations.length} ${
            fit === 'trig' ? 'trig curves' : 'razor-sharp vector curves'
          } at ${r.Wp}×${r.Hp}.` +
            (r.palette.length ? ` Palette: ${r.palette.join(' ')}` : ''),
        );
      } else {
        const r = await renderVillage(
          artRef.current,
          width,
          (p, m) => {
            if (!job.cancelled) {
              setProgress(p);
              setStatus(m);
            }
          },
          job,
        );
        if (!r || job.cancelled) return;
        setProgress(1);
        dimsRef.current = { w: r.w, h: r.h };
        setArtSize({ w: r.w, h: r.h });
        paintRef(refCanvasRef.current, refImg.current, r.w, r.h);
        if (refImg.current) {
          setMetrics(computeMetrics(artRef.current, refCanvasRef.current, r.w, r.h));
        }
        setStatus(`Done in ${r.secs.toFixed(1)}s — exact evaluation of the formula.`);
      }
    } finally {
      if (jobRef.current === job) setBusy(false);
    }
  }

  const copyEq = () => {
    if (eqRef.current) eqRef.current.select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(eqText);
    } else {
      document.execCommand('copy');
    }
  };

  return (
    <>
      <Cursor />
      <header className={`site${scrolled ? ' scrolled' : ''}`}>
        <div className="badge">≋</div>
        <div className="titleblock">
          <h1>
            pooffer <span className="thin">/nishi-san</span>
          </h1>
          <p>· 100% local ·</p>
        </div>
        <div className="spacer" />
        <button
          className="ghost small themebtn"
          onClick={() => setTheme((t) => (t === 'lime' ? 'blue' : 'lime'))}
          title="Switch accent theme"
        >
          <span className="dotty" />
          {theme === 'lime' ? 'Lime' : 'Blue'}
        </button>
        <div className="meta">Local-first · No uploads</div>
      </header>

      <section className="hero">
        <Starburst />
        <div className="kicker">
          <span className="n">HV2</span>$$ Overview
        </div>
        <h2 className="display">
          <span className="split-line">
            <SplitChars text="MATH" />
          </span>
          <span className="split-line">
            <SplitChars text="ART" delay={0.22} className="stroke" />
          </span>
          <span className="split-line small">
            <SplitChars text="POOF" delay={0.42} />
            <SplitChars text="FER" delay={0.58} className="lime" />
          </span>
        </h2>
        <p className="sub">
          Every pixel is one closed-form equation fractal terrain, ground masks and
          67 houses of <code>sin</code>, <code>cos</code> and <code>exp</code>. Or
          trace your own upload into <code>Fourier trig series </code> 
           actually graph.
        </p>
        <div className="cta">
          <Magnetic>
            <a className="btn" href="#studio" onClick={(e) => go(e, '#studio')}>
              ▶ Start rendering
            </a>
          </Magnetic>
          <Magnetic>
            <a
              className="btn ghost"
              href="#equation"
              onClick={(e) => go(e, '#equation')}
            >
              Read the equation
            </a>
          </Magnetic>
        </div>
        <div className="facts">
          <div>
            <b>2000×1200</b>native grid
          </div>
          <div>
            <b>100%</b>local compute
          </div>
          <div>
            <b>0</b>uploads
          </div>
          <div>
            <b>≤160</b>trig lines
          </div>
        </div>
        <div className="scrollcue">-----------------------------------------------------</div>
      </section>


      <div className="wrap">
        <Reveal>
          <section className="card" id="upload">
            <h2>
              <span className="n">01</span>
              <span className="slash">//</span> Upload{' '}
              <em>reference image · optional</em>
            </h2>
            <div
              className={`drop${dragOver ? ' over' : ''}`}
              onClick={() => fileRef.current && fileRef.current.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files && e.dataTransfer.files[0];
                if (f) loadFile(f);
              }}
            >
              <b>Drag &amp; drop image here</b>
              <span style={{ fontSize: 12 }}>
                PNG · JPG · WebP — or click to browse, or paste (Ctrl+V)
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  if (e.target.files[0]) loadFile(e.target.files[0]);
                }}
              />
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              {refInfo
                ? `Reference: ${refInfo.name} (${refInfo.w}×${refInfo.h}).`
                : 'No reference uploaded — formula renders on its own below.'}
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.06}>
          <section className="card" id="studio" style={{ marginTop: 14 }}>
            <h2>
              <span className="n">02</span>
              <span className="slash">//</span> Draw
            </h2>
            <div className="row">
              <label className="lbl">Draw with</label>
              <div className="seg">
                <button
                  className={mode === 'village' ? 'on' : ''}
                  onClick={() => onMode('village')}
                >
                  Snow village
                </button>
                <button
                  className={mode === 'trace' ? 'on' : ''}
                  onClick={() => onMode('trace')}
                >
                  My upload
                </button>
              </div>
            </div>
            <div className="row">
              <label className="lbl">Render width</label>
              <select value={width} onChange={(e) => setWidth(+e.target.value)}>
                <option value={200}>200 (fast)</option>
                <option value={400}>400</option>
                <option value={800}>800</option>
                <option value={1600}>1600 (hi-res)</option>
                <option value={2400}>2400 (hi-res)</option>
              </select>
              <label className="lbl">Trace detail</label>
              <select value={detail} onChange={(e) => setDetail(e.target.value)}>
                <option value="std">Standard</option>
                <option value="fine">Fine (more curves)</option>
              </select>
              <label className="lbl">Colors</label>
              <select value={colors} onChange={(e) => setColors(+e.target.value)}>
                <option value={0}>Black lines</option>
                <option value={3}>Color ×3</option>
                <option value={4}>Color ×4</option>
                <option value={6}>Color ×6</option>
                <option value={8}>Color ×8</option>
                <option value={10}>Color ×10</option>
                <option value={12}>Color ×12</option>
                <option value={16}>Color ×16</option>
                <option value={20}>Color ×20</option>
                <option value={24}>Color ×24</option>
                <option value={32}>Color ×32</option>
              </select>
            </div>
            <div className="row">
              <label className="lbl">Fit</label>
              <div className="seg">
                <button
                  className={fit === 'seg' ? 'on' : ''}
                  onClick={() => setFit('seg')}
                >
                  Segments
                </button>
                <button
                  className={fit === 'trig' ? 'on' : ''}
                  onClick={() => setFit('trig')}
                >
                  Trigonometry
                </button>
              </div>
              <label className="lbl">Harmonics</label>
              <select
                value={harmonics}
                disabled={fit !== 'trig'}
                onChange={(e) => setHarmonics(+e.target.value)}
              >
                <option value={4}>4</option>
                <option value={6}>6</option>
                <option value={8}>8</option>
                <option value={12}>12</option>
                <option value={16}>16</option>
              </select>
              <button onClick={renderNow} disabled={busy} style={{ flex: 1 }}>
                ▶ Render
              </button>
            </div>
            <div className="progress">
              <div style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="hint">{status}</div>
            {palette.length > 0 && (
              <div className="chips">
                <span className="lab">Palette</span>
                {palette.map((c) => (
                  <span
                    key={c}
                    className="chip"
                    title={c}
                    style={{ background: c }}
                  />
                ))}
              </div>
            )}
            <div style={{ height: 10 }} />
            <div className="stage">
              <div>
                <canvas
                  id="refCanvas"
                  ref={refCanvasRef}
                  width={400}
                  height={240}
                  className="preview"
                />
                <p className="cap">Reference · center-cropped 5:3</p>
              </div>
              <div>
                <canvas
                  id="art"
                  ref={artRef}
                  width={400}
                  height={240}
                  className={`preview${busy ? ' busy' : ''}`}
                />
                <p className="cap">Formula render · exact evaluation</p>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.1}>
          <section className="card" style={{ marginTop: 14 }}>
            <h2>
              <span className="n">03</span>
              <span className="slash">//</span> Compare{' '}
              <em>{artSize ? `(${artSize.w}×${artSize.h})` : ''}</em>
            </h2>
            <div className="stats">
              <Stat label="MAE" value={metrics?.mae ?? null} format={(v) => (v == null ? '–' : v.toFixed(2))} />
              <Stat label="RMSE" value={metrics?.rmse ?? null} format={(v) => (v == null ? '–' : v.toFixed(2))} />
              <Stat label="PSNR" value={metrics?.psnr ?? null} format={(v) => (v == null ? '–' : !isFinite(v) ? '∞' : `${v.toFixed(2)} dB`)} />
              <Stat label="Correlation r" value={metrics?.r ?? null} format={(v) => (v == null ? '–' : v.toFixed(4))} />
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.12}>
          <section className="card" id="equation" style={{ marginTop: 14 }}>
            <h2>
              <span className="n">04</span>
              <span className="slash">//</span> Defining equation
            </h2>
            <div className="toolbar">
              <button className="small" onClick={copyEq}>
                Copy equation
              </button>
            </div>
            <textarea id="eqDef" ref={eqRef} readOnly value={eqText} data-lenis-prevent />
          </section>
        </Reveal>
      </div>

      <footer className="site">
        <div className="giant" aria-hidden="true">
          <span>
            MATH — <em>ART</em> — MATH — <em>ART</em> — MATH — <em>ART</em> —  MATH — <em>ART</em> — MATH — <em>ART</em> —&nbsp;
          </span>
        </div>
        <div style={{ padding: '18px 16px 4px' }}>
          pooffer <span className="dot">·</span> kartikeywastaken{' '}
          <span className="dot">·</span> nichirindev{' '}
          <span className="dot">·</span> 2026
        </div>
      </footer>
    </>
  );
}
