import { useMemo, useState } from "react";
import { randomTip, CATEGORY_LABEL, Tip } from "../game/playbook";

interface Props {
  initialId?: number;
  className?: string;
}

export function TipChip({ initialId, className = "" }: Props) {
  const [tip, setTip] = useState<Tip>(() => randomTip(initialId));
  const next = () => setTip(randomTip(tip.id));
  return (
    <div className={`glass rounded-xl px-4 py-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-widest text-gold-400">
          Tip · {CATEGORY_LABEL[tip.category]}
        </div>
        <button
          className="text-[10px] uppercase tracking-wider text-stone-400 hover:text-gold-400"
          onClick={next}
        >
          next ›
        </button>
      </div>
      <div className="font-semibold text-sm text-stone-100 mt-1">{tip.title}</div>
      <div className="text-xs text-stone-300 mt-1 leading-relaxed">{tip.body}</div>
    </div>
  );
}

export function useRandomTip(rotateKey?: unknown): Tip {
  return useMemo(() => randomTip(), [rotateKey]);
}
