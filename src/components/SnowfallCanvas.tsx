import { useEffect, useRef } from 'react';

interface Flake {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  speedX: number;
  opacity: number;
  gold: boolean;
}

export function SnowfallCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId = 0;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const count = width < 768 ? 34 : 68;
    const flakes: Flake[] = Array.from({ length: count }, (_, idx) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 2.1 + 0.7,
      speedY: Math.random() * 0.65 + 0.25,
      speedX: (Math.random() - 0.5) * 0.35,
      opacity: Math.random() * 0.45 + 0.15,
      gold: idx % 7 === 0,
    }));

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize, { passive: true });

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      for (const f of flakes) {
        f.y += f.speedY;
        f.x += f.speedX + Math.sin(f.y * 0.01) * 0.15;

        if (f.y > height + 8) {
          f.y = -8;
          f.x = Math.random() * width;
        }
        if (f.x > width + 8) f.x = -8;
        if (f.x < -8) f.x = width + 8;

        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
        ctx.fillStyle = f.gold
          ? `rgba(214, 179, 106, ${f.opacity})`
          : `rgba(248, 247, 242, ${f.opacity})`;
        ctx.fill();
      }
      animationId = window.requestAnimationFrame(render);
    };

    animationId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(animationId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-10 h-full w-full"
    />
  );
}
