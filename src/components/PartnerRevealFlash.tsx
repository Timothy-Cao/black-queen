import { useEffect, useRef, useState } from "react";
import { GameState } from "../game/types";
import { CardView } from "./CardView";

interface Props {
  state: GameState;
}

export function PartnerRevealFlash({ state }: Props) {
  const [shown, setShown] = useState<string | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const r = state.round;
  const lastRevealed = r.revealedPartners.length > 0
    ? r.revealedPartners[r.revealedPartners.length - 1]
    : undefined;
  const triggerKey = lastRevealed !== undefined && r.bidder !== undefined
    ? `${r.roundNumber}-${r.revealedPartners.length}-${lastRevealed}`
    : null;

  useEffect(() => {
    if (triggerKey && triggerKey !== lastKeyRef.current) {
      lastKeyRef.current = triggerKey;
      setShown(triggerKey);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setShown(null);
        timerRef.current = null;
      }, 2200);
    }
  }, [triggerKey]);

  if (!shown || lastRevealed === undefined || !r.partnerCard) return null;
  const partnersLeft = (r.partners?.length ?? 0) - r.revealedPartners.length;
  const name = state.players[lastRevealed].name;
  return (
    <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center animate-floatIn">
      <div className="text-center bg-black/55 backdrop-blur-sm px-6 py-4 rounded-2xl border border-gold-400/30">
        <div className="text-xs uppercase tracking-[0.4em] text-gold-400/80 mb-2">Partner Revealed</div>
        <div className="font-display text-5xl text-gold-400 drop-shadow-[0_0_20px_rgba(245,196,107,0.6)]">
          {name}
        </div>
        <div className="text-stone-200 mt-2 text-sm">
          partnered with {state.players[r.bidder!].name}
          {partnersLeft > 0 && (
            <span className="ml-2 text-stone-400">· {partnersLeft} partner{partnersLeft === 1 ? "" : "s"} still hidden</span>
          )}
        </div>
        <div className="mt-3 flex justify-center">
          <div className="animate-floatIn">
            <CardView card={r.partnerCard} />
          </div>
        </div>
      </div>
    </div>
  );
}
