import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  className?: string;
}

export function ScoreCell({ value, className = "" }: Props) {
  const [pop, setPop] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setPop(true);
      const t = setTimeout(() => setPop(false), 700);
      return () => clearTimeout(t);
    }
  }, [value]);
  return (
    <span
      className={`inline-block transition-transform tabular-nums ${pop ? "scale-125 text-gold-400 drop-shadow-[0_0_8px_rgba(245,196,107,0.6)]" : ""} ${className}`}
    >
      {value}
    </span>
  );
}
