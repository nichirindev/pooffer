import { useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';

/* Scroll reveal wrapper: adds .in when visible (CSS handles the rest). */
export function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      el.classList.add('in');
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) {
            el.classList.add('in');
            io.disconnect();
          }
        });
      },
      { threshold: 0.06 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`rv ${className}`} style={{ '--d': `${delay}s` }}>
      {children}
    </div>
  );
}

/* Infinite mono marquee divider. Pass band for the giant tilted sticker strip. */
export function Marquee({ items, band = false }) {
  const seq = [];
  items.forEach((t, i) => {
    if (i) seq.push(<i key={`s${i}`}>//</i>);
    seq.push(<b key={i}>{t}</b>);
  });
  return (
    <div className={`marq${band ? ' band' : ''}`} aria-hidden="true">
      <span className="track">
        {[0, 1, 2, 3].map((k) => (
          <span key={k}>{seq} </span>
        ))}
      </span>
    </div>
  );
}

/* Scroll position: drives the progress hairline, header state, parallax var. */
export function useScroll() {
  const [s, setS] = useState({ progress: 0, scrolled: false });
  useEffect(() => {
    let tick = false;
    const on = () => {
      if (tick) return;
      tick = true;
      requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setS({ progress: max > 0 ? y / max : 0, scrolled: y > 8 });
        document.body.style.setProperty('--sy', `${y}px`);
        tick = false;
      });
    };
    window.addEventListener('scroll', on, { passive: true });
    on();
    return () => window.removeEventListener('scroll', on);
  }, []);
  return s;
}

/* Animated number that eases toward `target` whenever it changes. */
export function useCountUp(target, format) {  const fmtRef = useRef(format);
  fmtRef.current = format;
  const [disp, setDisp] = useState(() => format(target));
  const prev = useRef(target);
  useEffect(() => {
    const fmt = fmtRef.current;
    if (target == null || !isFinite(target)) {
      setDisp(fmt(target));
      prev.current = target;
      return;
    }
    const from = prev.current;
    if (from == null || !isFinite(from) || from === target) {
      setDisp(fmt(target));
      prev.current = target;
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 650;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setDisp(fmt(from + (target - from) * e));
      if (k < 1) raf = requestAnimationFrame(step);
      else prev.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      prev.current = target;
    };
  }, [target]);
  return disp;
}

/* ---------- LANDO layer: split text, magnetic, cursor, starburst, lenis ---------- */

/* Per-character staggered rise (hero display type). */
export function SplitChars({ text, className = '', delay = 0, step = 0.035 }) {
  return (
    <span className={`split ${className}`} aria-label={text}>
      {text.split('').map((ch, i) => (
        <span
          key={i}
          className="ch"
          style={{ '--cd': `${delay + i * step}s` }}
          aria-hidden="true"
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  );
}

/* Element gravitates toward the cursor, springs back on leave. */
export function Magnetic({ children, strength = 10, className = '' }) {
  const ref = useRef(null);
  const move = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    el.style.transition = 'transform .12s ease-out';
    el.style.transform = `translate(${(x * strength) / 100}px, ${(y * strength) / 100}px)`;
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1)';
    el.style.transform = 'translate(0,0)';
  };
  return (
    <span ref={ref} className={`mag ${className}`} onMouseMove={move} onMouseLeave={leave}>
      {children}
    </span>
  );
}

/* Lime dot + trailing ring cursor follower (fine pointers only). */
export function Cursor() {
  const dot = useRef(null);
  const ring = useRef(null);
  useEffect(() => {
    if (!window.matchMedia || !matchMedia('(pointer:fine)').matches) return;
    let x = -100;
    let y = -100;
    let rx = -100;
    let ry = -100;
    let raf = 0;
    let big = false;
    const onMove = (e) => {
      x = e.clientX;
      y = e.clientY;
      if (dot.current)
        dot.current.style.transform = `translate(${x - 4}px,${y - 4}px)`;
      const t = e.target.closest
        ? e.target.closest('button,a,.drop,select,.chip,input')
        : null;
      if (!!t !== big && ring.current) {
        big = !!t;
        ring.current.classList.toggle('big', big);
      }
    };
    const loop = () => {
      rx += (x - rx) * 0.16;
      ry += (y - ry) * 0.16;
      if (ring.current) {
        const s = ring.current.classList.contains('big') ? 32 : 18;
        ring.current.style.transform = `translate(${rx - s}px,${ry - s}px)`;
      }
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <>
      <div ref={dot} className="cur-dot" aria-hidden="true" />
      <div ref={ring} className="cur-ring" aria-hidden="true" />
    </>
  );
}

/* Spinning circular-text sticker badge. */
export function Starburst({ text = '100% local • no uploads • exact math • ' }) {
  return (
    <div className="burst" aria-hidden="true">
      <svg viewBox="0 0 200 200">
        <defs>
          <path
            id="burst-circ"
            d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0"
          />
        </defs>
        <text>
          <textPath href="#burst-circ">{text + text}</textPath>
        </text>
      </svg>
      <span>≋</span>
    </div>
  );
}

/* Buttery Lenis smooth scroll. Returns a ref holding the instance. */
export function useLenis(enabled = true) {
  const ref = useRef(null);
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    ref.current = lenis;
    let raf = 0;
    const loop = (t) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      ref.current = null;
    };
  }, [enabled]);
  return ref;
}
