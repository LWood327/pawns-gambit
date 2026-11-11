import { useEffect, useRef } from 'react';
import type { FxKind } from './themes';

// Particle effects drawn on a canvas sized to the board.
// Ambient particles drift continuously; `burst` fires a puff at a square on each move.

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  hue: number;
  seed: number;
  burst?: boolean;
}

interface Props {
  kind: FxKind;
  calm: boolean;
  /** Center of the last move's destination, as fractions of the board (0..1), plus an id that changes per move. */
  burstAt: { x: number; y: number; id: number } | null;
}

const AMBIENT: Record<FxKind, number> = {
  none: 0,
  embers: 26,
  snow: 46,
  stars: 0, // stars are a fixed field, drawn separately
  bubbles: 14,
  sparks: 0,
  fireflies: 14,
  glitter: 22,
};

export function BoardFX({ kind, calm, burstAt }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ parts: [] as P[], w: 0, h: 0, stars: [] as { x: number; y: number; r: number; tw: number }[] });

  // Size the canvas to the board, at device resolution.
  useEffect(() => {
    const canvas = ref.current!;
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      state.current.w = canvas.width;
      state.current.h = canvas.height;
      state.current.stars = Array.from({ length: 140 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: (Math.random() ** 3 * 1.6 + 0.35) * dpr,
        tw: Math.random() * Math.PI * 2,
      }));
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // Burst on each move.
  useEffect(() => {
    if (!burstAt || calm || kind === 'none') return;
    const { w, h, parts } = state.current;
    const cx = burstAt.x * w;
    const cy = burstAt.y * h;
    const size = w / 8;
    const n = kind === 'stars' ? 18 : kind === 'bubbles' ? 9 : 16;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.4 + Math.random() * 1.2) * (size / 60);
      parts.push({
        x: cx + Math.cos(a) * size * 0.15,
        y: cy + Math.sin(a) * size * 0.15,
        vx: kind === 'bubbles' ? (Math.random() - 0.5) * 0.4 : Math.cos(a) * sp,
        vy: kind === 'bubbles' ? -(0.5 + Math.random()) * (size / 60) : kind === 'embers' ? Math.sin(a) * sp - 0.6 : Math.sin(a) * sp,
        r: (kind === 'bubbles' ? 2 + Math.random() * 4 : 1 + Math.random() * 2) * (size / 60),
        life: 0,
        max: 40 + Math.random() * 30,
        hue: Math.random(),
        seed: Math.random() * 1000,
        burst: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burstAt?.id]);

  // Animation loop.
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let t = 0;
    state.current.parts = [];

    const spawnAmbient = () => {
      const { w, h } = state.current;
      const s = w / 480; // scale particles with board size
      switch (kind) {
        case 'embers':
          return { x: Math.random() * w, y: h + 6, vx: (Math.random() - 0.5) * 0.3 * s, vy: -(0.35 + Math.random() * 0.7) * s, r: (0.8 + Math.random() * 1.8) * s, max: 220 + Math.random() * 160 };
        case 'snow':
          return { x: Math.random() * w, y: -6, vx: (Math.random() - 0.3) * 0.25 * s, vy: (0.25 + Math.random() * 0.45) * s, r: (0.8 + Math.random() * 2) * s, max: 900 };
        case 'bubbles':
          return { x: Math.random() * w, y: h + 8, vx: 0, vy: -(0.3 + Math.random() * 0.5) * s, r: (1.5 + Math.random() * 3.5) * s, max: 900 };
        case 'fireflies':
          return { x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.4 * s, vy: (Math.random() - 0.5) * 0.4 * s, r: (1.4 + Math.random() * 1.4) * s, max: 500 + Math.random() * 400 };
        case 'glitter':
          return { x: Math.random() * w, y: Math.random() * h, vx: 0, vy: -(0.05 + Math.random() * 0.15) * s, r: (1.5 + Math.random() * 2.5) * s, max: 90 + Math.random() * 120 };
        default:
          return null;
      }
    };

    const draw = () => {
      const { w, h, parts, stars } = state.current;
      t++;
      ctx.clearRect(0, 0, w, h);
      const target = Math.round(AMBIENT[kind] * (calm ? 0.3 : 1));
      const ambientCount = parts.reduce((n, p) => n + (p.burst ? 0 : 1), 0);
      if (ambientCount < target && Math.random() < 0.25) {
        const s = spawnAmbient();
        if (s) parts.push({ ...s, life: 0, hue: Math.random(), seed: Math.random() * 1000 });
      }

      if (kind === 'stars') {
        for (const st of stars) {
          const a = 0.45 + 0.55 * Math.sin(t * 0.03 + st.tw) ** 2;
          ctx.globalAlpha = calm ? a * 0.6 : a;
          ctx.fillStyle = '#e9ecff';
          ctx.beginPath();
          ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
          ctx.fill();
        }
        // An occasional shooting star.
        if (!calm && Math.random() < 0.004) {
          parts.push({ x: Math.random() * w, y: Math.random() * h * 0.4, vx: 6 * (w / 480), vy: 2.2 * (w / 480), r: 1.2 * (w / 480), life: 0, max: 26, hue: 0, seed: -1 });
        }
      }

      ctx.globalCompositeOperation = kind === 'snow' || kind === 'bubbles' ? 'source-over' : 'lighter';
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life++;
        const k = p.life / p.max;
        if (k >= 1 || p.y < -20 || p.y > h + 20 || p.x < -20 || p.x > w + 20) {
          parts.splice(i, 1);
          continue;
        }
        const fade = p.burst ? 1 - k : Math.min(1, p.life / 30) * (1 - Math.max(0, (k - 0.75) / 0.25));

        if (kind === 'fireflies' && !p.burst) {
          p.vx += (Math.sin(t * 0.02 + p.seed) * 0.02) * (w / 480);
          p.vy += (Math.cos(t * 0.017 + p.seed) * 0.02) * (w / 480);
          p.vx *= 0.98;
          p.vy *= 0.98;
        }
        if (kind === 'snow') p.vx += Math.sin(t * 0.02 + p.seed) * 0.006;
        if (kind === 'embers') p.vx += Math.sin(t * 0.05 + p.seed) * 0.01;
        if (kind === 'bubbles' && !p.burst) p.x += Math.sin(t * 0.04 + p.seed) * 0.25;
        if (p.burst) {
          p.vx *= 0.94;
          p.vy *= kind === 'bubbles' ? 1 : 0.94;
        }
        p.x += p.vx;
        p.y += p.vy;

        ctx.globalAlpha = Math.max(0, fade);
        switch (kind) {
          case 'embers': {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
            g.addColorStop(0, `hsla(${38 - p.hue * 25}, 100%, 70%, 1)`);
            g.addColorStop(1, 'hsla(15, 100%, 50%, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          case 'snow':
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'bubbles':
            ctx.strokeStyle = 'rgba(220,250,255,0.7)';
            ctx.lineWidth = Math.max(1, p.r * 0.22);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.25, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'fireflies': {
            const pulse = p.burst ? 1 : 0.4 + 0.6 * Math.sin(t * 0.06 + p.seed) ** 2;
            ctx.globalAlpha = Math.max(0, fade * pulse);
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
            g.addColorStop(0, 'rgba(236,255,150,1)');
            g.addColorStop(0.25, 'rgba(200,255,90,0.6)');
            g.addColorStop(1, 'rgba(160,255,60,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          case 'stars': {
            if (p.seed === -1) {
              // shooting star streak
              ctx.strokeStyle = 'rgba(230,235,255,0.9)';
              ctx.lineWidth = p.r;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p.x - p.vx * 6, p.y - p.vy * 6);
              ctx.stroke();
            } else {
              ctx.fillStyle = `hsla(${230 + p.hue * 60}, 90%, 80%, 1)`;
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
              ctx.fill();
            }
            break;
          }
          case 'glitter': {
            // A four-point twinkle that swells and fades.
            const tw = p.burst ? 1 : Math.sin((p.life / p.max) * Math.PI);
            ctx.globalAlpha = Math.max(0, fade * tw);
            ctx.strokeStyle = p.hue > 0.4 ? 'rgba(255,225,140,1)' : 'rgba(255,248,215,1)';
            ctx.lineWidth = Math.max(0.6, p.r * 0.35);
            const len = p.r * (1.2 + tw);
            ctx.beginPath();
            ctx.moveTo(p.x - len, p.y);
            ctx.lineTo(p.x + len, p.y);
            ctx.moveTo(p.x, p.y - len);
            ctx.lineTo(p.x, p.y + len);
            ctx.stroke();
            break;
          }
          case 'sparks':
            ctx.strokeStyle = p.hue > 0.5 ? 'rgba(127,247,255,1)' : 'rgba(255,95,210,1)';
            ctx.lineWidth = p.r * 0.8;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
            ctx.stroke();
            break;
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(draw);
    };

    if (kind !== 'none' && !reduce) raf = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
    return () => cancelAnimationFrame(raf);
  }, [kind, calm]);

  return <canvas ref={ref} className="board-fx" aria-hidden />;
}
