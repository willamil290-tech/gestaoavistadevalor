import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: "ember" | "flame" | "spark";
}

const FIRE_COLORS = [
  "#ff0000",
  "#ff2200",
  "#ff4400",
  "#ff6600",
  "#ff8800",
  "#ffaa00",
  "#ffcc00",
  "#ffee00",
  "#ffff44",
  "#ffffff",
];

export const FireOverlay = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const spawnParticle = (): Particle => {
      const type = Math.random() < 0.15 ? "spark" : Math.random() < 0.4 ? "flame" : "ember";
      const edge = Math.random();
      let x: number, y: number;

      if (edge < 0.7) {
        // Bottom edge
        x = Math.random() * canvas.width;
        y = canvas.height + 10;
      } else if (edge < 0.85) {
        // Left edge
        x = -5;
        y = canvas.height * (0.5 + Math.random() * 0.5);
      } else {
        // Right edge
        x = canvas.width + 5;
        y = canvas.height * (0.5 + Math.random() * 0.5);
      }

      const maxLife = type === "spark" ? 40 + Math.random() * 30 : 60 + Math.random() * 80;

      return {
        x,
        y,
        vx: (Math.random() - 0.5) * (type === "spark" ? 4 : 2),
        vy: -(1.5 + Math.random() * (type === "spark" ? 5 : 3)),
        life: maxLife,
        maxLife,
        size: type === "spark" ? 1 + Math.random() * 2 : type === "flame" ? 4 + Math.random() * 8 : 2 + Math.random() * 4,
        color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)],
        type,
      };
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Spawn particles
      const spawnRate = Math.floor(3 + Math.random() * 4);
      for (let i = 0; i < spawnRate; i++) {
        particlesRef.current.push(spawnParticle());
      }

      // Cap particle count
      if (particlesRef.current.length > 300) {
        particlesRef.current = particlesRef.current.slice(-300);
      }

      // Update & draw
      particlesRef.current = particlesRef.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vx += (Math.random() - 0.5) * 0.3;
        p.vy -= 0.02;
        p.life -= 1;

        if (p.life <= 0) return false;

        const alpha = Math.min(1, p.life / p.maxLife);

        if (p.type === "flame") {
          const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          gradient.addColorStop(0, `rgba(255, 255, 200, ${alpha * 0.6})`);
          gradient.addColorStop(0.4, `${p.color}${Math.floor(alpha * 180).toString(16).padStart(2, "0")}`);
          gradient.addColorStop(1, `rgba(255, 0, 0, 0)`);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
        } else if (p.type === "spark") {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 200, ${alpha})`;
          ctx.shadowColor = "#ffcc00";
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
          ctx.fillStyle = `${p.color}${Math.floor(alpha * 200).toString(16).padStart(2, "0")}`;
          ctx.fill();
        }

        return true;
      });

      // Bottom fire glow
      const bottomGradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - 120);
      bottomGradient.addColorStop(0, "rgba(255, 68, 0, 0.15)");
      bottomGradient.addColorStop(0.5, "rgba(255, 100, 0, 0.06)");
      bottomGradient.addColorStop(1, "rgba(255, 0, 0, 0)");
      ctx.fillStyle = bottomGradient;
      ctx.fillRect(0, canvas.height - 120, canvas.width, 120);

      // Side glows
      const leftGlow = ctx.createLinearGradient(0, 0, 60, 0);
      leftGlow.addColorStop(0, "rgba(255, 50, 0, 0.08)");
      leftGlow.addColorStop(1, "rgba(255, 0, 0, 0)");
      ctx.fillStyle = leftGlow;
      ctx.fillRect(0, canvas.height * 0.3, 60, canvas.height * 0.7);

      const rightGlow = ctx.createLinearGradient(canvas.width, 0, canvas.width - 60, 0);
      rightGlow.addColorStop(0, "rgba(255, 50, 0, 0.08)");
      rightGlow.addColorStop(1, "rgba(255, 0, 0, 0)");
      ctx.fillStyle = rightGlow;
      ctx.fillRect(canvas.width - 60, canvas.height * 0.3, 60, canvas.height * 0.7);

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9999 }}
    />
  );
};
