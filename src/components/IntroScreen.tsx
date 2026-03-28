import { useState, useEffect, useRef, useCallback } from 'react';
import './IntroScreen.css';

interface IntroScreenProps {
  onComplete: () => void;
}

const TAGLINE_WORDS = ['See', 'what', 'your', 'Lyrics', 'say', 'about'];
const CIPHER_CHARS = '*%$#@!~^&?≠§±∆∑π√Ω≈><|';

const randomCipher = () => CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
const makeCipherFor = (word: string) =>
  Array.from({ length: word.length }, () => randomCipher()).join('');

interface WordState {
  word: string;
  cipher: string;
  revealed: boolean;
  exited: boolean;
}

// ─── Particle canvas ───────────────────────────────────────────────────────
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  alpha: number;
  hue: number;
  life: number;
  maxLife: number;
}

function useParticleCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf: number;
    const particles: Particle[] = [];
    const W = (canvas.width = window.innerWidth);
    const H = (canvas.height = window.innerHeight);

    // Seed ambient particles
    for (let i = 0; i < 80; i++) {
      particles.push(makeParticle(Math.random() * W, Math.random() * H, 0, 'ambient'));
    }

    function makeParticle(x: number, y: number, age: number = 0, type: 'ambient' | 'burst' = 'ambient'): Particle {
      const maxLife = type === 'burst' ? 60 + Math.random() * 60 : 120 + Math.random() * 200;
      return {
        x, y,
        vx: (Math.random() - 0.5) * (type === 'burst' ? 2.5 : 0.4),
        vy: (Math.random() - 0.5) * (type === 'burst' ? 2.5 : 0.4) - (type === 'burst' ? 1.5 : 0.2),
        radius: type === 'burst' ? 1 + Math.random() * 3 : 0.8 + Math.random() * 2,
        alpha: type === 'burst' ? 0.9 : 0.3 + Math.random() * 0.3,
        hue: 260 + Math.random() * 80, // purple → pink range
        life: age,
        maxLife,
      };
    }

    let mouseX = W / 2, mouseY = H / 2;
    const handleMove = (e: MouseEvent) => {
      mouseX = e.clientX; mouseY = e.clientY;
      // Spawn mini burst near cursor
      if (Math.random() < 0.35) {
        particles.push(makeParticle(mouseX + (Math.random() - 0.5) * 30, mouseY + (Math.random() - 0.5) * 30, 0, 'burst'));
      }
    };
    canvas.addEventListener('mousemove', handleMove);

    function draw() {
      ctx!.clearRect(0, 0, W, H);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (!p) continue;
        p.x += p.vx;
        p.y += p.vy;
        p.vy -= 0.008; // float upward slowly
        p.life++;
        const progress = p.life / p.maxLife;
        const alpha = p.alpha * (1 - progress);
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx!.fillStyle = `hsla(${p.hue}, 80%, 65%, ${alpha.toFixed(3)})`;
        ctx!.fill();
        if (p.life >= p.maxLife) {
          // Recycle ambient particles
          if (p.radius < 1.5) {
            particles[i] = makeParticle(Math.random() * W, Math.random() * H + H * 0.3, 0, 'ambient');
          } else {
            particles.splice(i, 1);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('mousemove', handleMove);
    };
  }, [canvasRef]);
}

// ─── Component ────────────────────────────────────────────────────────────
export function IntroScreen({ onComplete }: IntroScreenProps) {
  const [wordStates, setWordStates] = useState<WordState[]>(
    TAGLINE_WORDS.map((w) => ({ word: w, cipher: makeCipherFor(w), revealed: false, exited: false }))
  );
  const [finalSequence, setFinalSequence] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useParticleCanvas(canvasRef);

  // Constantly randomise cipher characters
  useEffect(() => {
    const id = setInterval(() => {
      setWordStates((prev) =>
        prev.map((ws) => ws.revealed ? ws : { ...ws, cipher: makeCipherFor(ws.word) })
      );
    }, 110);
    return () => clearInterval(id);
  }, []);

  // Fake progress bar
  useEffect(() => {
    let p = 0;
    const id = setInterval(() => {
      p += Math.random() * 3.5 + 0.5;
      if (p >= 100) { p = 100; clearInterval(id); }
      setLoadProgress(p);
    }, 55);
    return () => clearInterval(id);
  }, []);

  // Check all revealed
  useEffect(() => {
    if (wordStates.length > 0 && wordStates.every((ws) => ws.revealed) && !finalSequence) {
      setShowHint(false);
      setFinalSequence(true);
    }
  }, [wordStates, finalSequence]);

  // Orchestrate final engulfment sequence
  useEffect(() => {
    if (finalSequence) {
      setTimeout(() => {
        setIsExiting(true);
        exitRef.current = setTimeout(() => onComplete(), 600);
      }, 2000); // Wait 2s for 'you' animation
    }
  }, [finalSequence, onComplete]);

  const handleWordHover = useCallback((index: number) => {
    setWordStates((prev) => {
      const wordState = prev[index];
      if (!wordState || wordState.revealed) return prev;
      const next = [...prev];
      next[index] = { ...wordState, revealed: true };
      return next;
    });
    setShowHint(false);
    // Mark as fully exited after animation completes
    setTimeout(() => {
      setWordStates((prev) => {
        const wordState = prev[index];
      if (!wordState) return prev;
      const next = [...prev];
      next[index] = { ...wordState, exited: true };
      return next;
      });
    }, 2400);
  }, []);

  useEffect(() => {
    return () => { if (exitRef.current) clearTimeout(exitRef.current); };
  }, []);

  return (
    <div className={`intro-screen${isExiting ? ' exiting' : ''}${finalSequence ? ' morphing' : ''}`}>
      {/* Aurora */}
      <div className="intro-bg-aurora" />

      {/* Particle canvas */}
      <canvas ref={canvasRef} className="intro-particles" />

      {/* Scanlines */}
      <div className="intro-scanlines" />

      {/* Eyebrow */}
      <p className="intro-eyebrow">Creative Engine · Lyric Decoder</p>

      {/* Cipher field */}
      <div className="cipher-field">
        {wordStates.map((ws, i) => (
          <span key={i}>
            <span
              className={`cipher-word${ws.revealed ? ' revealed' : ''}`}
              onMouseEnter={() => !ws.revealed && handleWordHover(i)}
            >
              {(ws.revealed ? ws.word : ws.cipher).split('').map((ch, ci) => (
                <span key={ci} className="cipher-char">{ch}</span>
              ))}
            </span>
          </span>
        ))}
      </div>

      {/* Hint */}
      <p className={`intro-hint${showHint ? '' : ' hide'}`}>
        hover to decode
      </p>

      {/* The word "you" */}
      <div className={`final-you-word${finalSequence ? ' animate' : ''}`}>you</div>

      {/* Progress bar */}
      <div className="intro-loading-bar-wrap">
        <div className="intro-loading-bar-track">
          <div className="intro-loading-bar-fill" style={{ width: `${loadProgress}%` }} />
        </div>
      </div>
    </div>
  );
}
