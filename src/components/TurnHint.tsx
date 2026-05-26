import { GameState, PlayerId } from "../game/types";

interface Props {
  state: GameState;
  me: PlayerId;
}

export function TurnHint({ state, me }: Props) {
  const r = state.round;
  const meIsAI = state.players[me].isAI;
  if (meIsAI) return null;
  let text: string | null = null;
  if (r.phase === "bidding") {
    if (r.bidTurn === me) text = "Your turn to bid";
    else text = `Waiting on ${state.players[r.bidTurn ?? me].name} to bid...`;
  } else if (r.phase === "declaring") {
    if (r.bidder === me) text = "Choose your trump suit and partner card";
    else text = `${state.players[r.bidder!].name} is choosing trump & partner...`;
  } else if (r.phase === "playing") {
    if (r.pendingTrickComplete) text = null;
    else if (r.toPlay === me) text = "Your turn — play a card";
    else text = `Waiting on ${state.players[r.toPlay].name}...`;
  }
  if (!text) return null;
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
      <div className="glass px-3 py-1.5 rounded-full text-xs uppercase tracking-widest text-gold-400/90 animate-floatIn">
        {text}
      </div>
    </div>
  );
}
