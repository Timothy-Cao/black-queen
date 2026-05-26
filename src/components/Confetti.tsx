import { useMemo } from "react";

const COLORS = ["#f5c46b", "#e0a93a", "#ffffff", "#facc15", "#f97316", "#34d399", "#f87171"];

export function Confetti({ count = 80 }: { count?: number }) {
  const pieces = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      i,
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 3 + Math.random() * 2.5,
      color: COLORS[i % COLORS.length],
      rotate: Math.random() * 360,
      size: 6 + Math.random() * 10,
    }));
  }, [count]);
  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            width: p.size,
            height: p.size * 1.4,
            transform: `rotate(${p.rotate}deg)`,
            borderRadius: p.i % 3 === 0 ? "50%" : "2px",
          }}
        />
      ))}
    </div>
  );
}
