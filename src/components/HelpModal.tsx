import { useState } from "react";
import { Card } from "../game/types";
import { CardView } from "./CardView";

interface Props {
  onClose: () => void;
  onOpenAIInfo?: () => void;
}

type Tab = "overview" | "bid" | "declare" | "play" | "score";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "bid", label: "1 · Bid" },
  { id: "declare", label: "2 · Declare" },
  { id: "play", label: "3 · Play" },
  { id: "score", label: "4 · Score" },
];

const c = (suit: Card["suit"], rank: Card["rank"]): Card => ({ suit, rank, id: `${suit}${rank}` });
const POINT_CARDS: { card: Card; pts: number }[] = [
  { card: c("S", 12), pts: 30 },
  { card: c("H", 14), pts: 15 },
  { card: c("D", 10), pts: 10 },
  { card: c("C", 5), pts: 5 },
];

export function HelpModal({ onClose, onOpenAIInfo }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass rounded-2xl w-[660px] max-w-[95vw] max-h-[88vh] flex flex-col animate-floatIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + tabs */}
        <div className="px-6 pt-5 pb-3 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl text-gold-400">How to Play</h2>
            <button className="btn btn-ghost text-sm" onClick={onClose}>Close</button>
          </div>
          <div className="mt-3 flex gap-1 flex-wrap">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                  tab === t.id ? "bg-gold-500/25 text-gold-200 font-semibold" : "text-stone-400 hover:bg-white/5"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-auto text-sm leading-relaxed text-stone-200">
          {tab === "overview" && <Overview />}
          {tab === "bid" && <Bid />}
          {tab === "declare" && <Declare />}
          {tab === "play" && <Play />}
          {tab === "score" && <Score />}
        </div>

        {onOpenAIInfo && (
          <div className="px-6 py-3 border-t border-white/10 text-[12px] text-stone-400">
            Curious how the AI thinks?{" "}
            <button
              className="text-gold-400 hover:text-gold-300 underline underline-offset-2"
              onClick={onOpenAIInfo}
            >
              Read the mini-paper →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-stone-100">{children}</p>;
}
function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-gold-400/70 mt-0.5">▸</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Overview() {
  return (
    <div className="space-y-5">
      <Lead>
        5 players. One wins the <b>bid</b> and secretly teams up with whoever holds a
        card they call — together they race to capture enough <b>points</b> hidden in
        the cards. Everyone else tries to stop them.
      </Lead>

      {/* Phase flow */}
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
        {["Bid", "Declare", "Play 13", "Score"].map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="px-2 py-1 rounded-md bg-white/5 text-gold-300">{s}</span>
            {i < 3 && <span className="text-stone-600">→</span>}
          </span>
        ))}
      </div>

      {/* Points */}
      <div>
        <div className="text-xs uppercase tracking-widest text-gold-400 mb-2">Where the points are · 300 total</div>
        <div className="flex gap-4">
          {POINT_CARDS.map(({ card, pts }) => (
            <div key={card.id} className="flex flex-col items-center gap-1">
              <CardView card={card} small staticView />
              <span className="text-gold-300 font-semibold text-xs">{pts} pts</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-stone-400">
          Only these cards score. Everything else is just for winning tricks.
        </p>
      </div>

      <p className="text-[12px] text-stone-400">
        Deck: <b>65 cards</b> (two decks, with 2s/3s/4s/6s and all 7s but one 7♠ removed). Each player gets <b>13</b>.
      </p>
    </div>
  );
}

function Bid() {
  return (
    <div className="space-y-4">
      <Lead>You bid how many points your future team will capture.</Lead>
      <Bullets
        items={[
          <>Opening bid is at least <b>150</b>; each raise is <b>+5</b>.</>,
          <>Highest possible bid is <b>300</b> — every point in the deck.</>,
          <><b>Pass</b> and you're out of the bidding for good.</>,
          <>Last player still in wins and becomes the <b className="text-gold-300">Caller</b>.</>,
        ]}
      />
      <p className="text-[12px] text-stone-400">Bid high and you control the hand — but you have to deliver.</p>
    </div>
  );
}

function Declare() {
  return (
    <div className="space-y-4">
      <Lead>The Caller sets up the hand in two steps:</Lead>
      <Bullets
        items={[
          <>Choose the <b>trump</b> suit (it beats all other suits).</>,
          <>Name a <b>partner card</b> by rank + suit, e.g. <span className="text-gold-300">A♠</span>. Whoever holds a copy is secretly on your team.</>,
          <>There can be <b>1 or 2 partners</b> — and nobody announces it.</>,
          <>You can’t call a card you hold <i>every</i> copy of.</>,
        ]}
      />
      <p className="text-[12px] text-stone-400">
        Partners stay hidden until someone actually plays the called card. Reading who’s who is the heart of the game.
      </p>
    </div>
  );
}

function Play() {
  // A tiny trick: ♥ led, a heart and a trump (♠) in play; trump wins.
  const trick: { card: Card; tag: string; win?: boolean }[] = [
    { card: c("H", 9), tag: "led" },
    { card: c("H", 14), tag: "follows" },
    { card: c("S", 5), tag: "trump", win: true },
    { card: c("H", 13), tag: "follows" },
  ];
  return (
    <div className="space-y-4">
      <Lead>13 tricks. Each player plays one card per trick.</Lead>
      <Bullets
        items={[
          <><b>Follow the led suit</b> if you can. If you can’t, play anything — including trump.</>,
          <>Winner = highest <b>trump</b>; if no trump, highest card of the <b>led suit</b>.</>,
          <>The winner leads the next trick.</>,
        ]}
      />
      <div>
        <div className="text-xs uppercase tracking-widest text-gold-400 mb-2">Example · ♥ led, ♠ is trump</div>
        <div className="flex gap-2 items-end">
          {trick.map(({ card, tag, win }) => (
            <div key={card.id} className="flex flex-col items-center gap-1">
              <div className={win ? "ring-2 ring-gold-400 rounded-md" : ""}>
                <CardView card={card} small staticView />
              </div>
              <span className={`text-[10px] ${win ? "text-gold-300 font-semibold" : "text-stone-500"}`}>
                {win ? "wins (trump)" : tag}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-stone-400">A single trump beats even the Ace of the led suit.</p>
      </div>
    </div>
  );
}

function Score() {
  return (
    <div className="space-y-4">
      <Lead>After 13 tricks, add up the team’s captured points.</Lead>
      <div className="rounded-lg border border-white/10 overflow-hidden">
        <div className="grid grid-cols-2 text-sm">
          <div className="px-4 py-3 bg-emerald-500/10">
            <div className="text-emerald-300 font-semibold">Made the bid</div>
            <div className="text-[12px] text-stone-300 mt-1">Team captured ≥ bid → every team member <b className="text-emerald-300">+bid</b>.</div>
          </div>
          <div className="px-4 py-3 bg-rose-500/10">
            <div className="text-rose-300 font-semibold">Fell short</div>
            <div className="text-[12px] text-stone-300 mt-1">Team captured &lt; bid → every team member <b className="text-rose-300">−bid</b>.</div>
          </div>
        </div>
      </div>
      <Bullets
        items={[
          <>Defenders win by holding the team under its bid — they need <b>301 − bid</b> points.</>,
          <>Capture all <b>300</b> for a perfect game.</>,
        ]}
      />
      <p className="text-[12px] text-stone-400">
        Tip: every card you play is a clue. Smear points to an ally and you reveal your side; ruff a teammate and you’ve shown your hand.
      </p>
    </div>
  );
}
