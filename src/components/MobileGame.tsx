// Vertical, phone-first game layout. Used (in place of the desktop ellipse
// table) on narrow screens for both single-player and online games.
//
// Opponents are compact status chips (avatar · card count · points · role) with
// no fanned card-backs; the current trick sits in the middle; the local hand
// fans to fit the screen width with tap-to-select + a confirm to play.
import { useMemo, useState } from "react";
import type { Card, GameState, PlayerId, Suit, Rank } from "../game/types";
import { SUIT_GLYPHS, SUITS, RANK_LABEL, cardPoints } from "../game/types";
import { CardView } from "./CardView";
import { RoundEnd } from "./RoundEnd";
import { HelpModal } from "./HelpModal";
import { legalPlays } from "../game/rules";
import { legalBidAmount } from "../game/engine";
import { sortHandByColor } from "../game/handSort";
import { avatarColor, seatIcon } from "./PlayerSeat";
import { sfx, setSfxVolume, getSfxVolume } from "../game/sfx";
import { setMusicVolume, getMusicVolume } from "../game/music";
import { useCardSkin, CARD_SKINS, type CardSkin } from "./CardSkinContext";
import { useHandLayout } from "./HandLayoutContext";

interface Props {
  state: GameState;
  me: PlayerId;
  onPlay: (c: Card) => void;
  onBid: (amount: number) => void;
  onPass: () => void;
  onDeclare: (trump: Suit, partnerCard: Card) => void;
  onContinue?: () => void;     // collect a completed trick (single-player)
  onRoundNext?: () => void;    // RoundEnd primary action
  onExit: () => void;          // leave / back
  banner?: string;             // room code (online)
  secondsLeft?: number | null; // turn countdown (online)
}

// Hand fan: bigger cards that overlap, so ~8-9 are visible at once (swipe for more).
const HAND_CARD_W = 80;
const HAND_OVERLAP = 44; // ~36px of each card shows

// Where each played card sits on the table, by seat-offset from "me" (0 = me at
// the bottom, then clockwise: left, top-left, top-right, right).
const TRICK_POS: React.CSSProperties[] = [
  { left: "50%", bottom: "6%", transform: "translateX(-50%)" },
  { left: "3%", top: "40%" },
  { left: "15%", top: "5%" },
  { right: "15%", top: "5%" },
  { right: "3%", top: "40%" },
];

export function MobileGame(p: Props) {
  const { state, me } = p;
  const r = state.round;
  const trump = r.trump;
  const showRoundEnd = state.phase === "round_end" || state.phase === "game_end";
  const myTurnToPlay = r.phase === "playing" && r.toPlay === me && !r.pendingTrickComplete;
  const showBidPanel = r.phase === "bidding";
  const showDeclare = r.phase === "declaring" && r.bidder === me;

  const [selected, setSelected] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const { layout } = useHandLayout();

  const legalIds = useMemo(() => {
    if (!myTurnToPlay) return new Set<string>();
    return new Set(legalPlays(state.players[me].hand, r.currentTrick).map((c) => c.id));
  }, [myTurnToPlay, state, me, r.currentTrick]);

  // Opponents in clockwise seat order starting after me.
  const opponents = [1, 2, 3, 4].map((i) => state.players[((me + i) % 5) as PlayerId]);
  const hand = sortHandByColor(state.players[me].hand, trump);
  const trickPlays = r.currentTrick?.plays ?? [];

  const turnText = (() => {
    if (showRoundEnd) return null;
    if (r.phase === "bidding") return r.bidTurn === me ? "Your turn to bid" : `${state.players[r.bidTurn ?? me].name} is bidding`;
    if (r.phase === "declaring") return r.bidder === me ? "Choose trump & partner" : `${state.players[r.bidder!].name} is declaring`;
    if (r.pendingTrickComplete) {
      return r.currentTrick?.winner !== undefined ? `${state.players[r.currentTrick.winner].name} won the round` : "Round complete";
    }
    if (r.phase === "playing") return r.toPlay === me ? "Your turn — pick a card" : `${state.players[r.toPlay].name}'s turn`;
    return null;
  })();

  const selectedCard = hand.find((c) => c.id === selected) ?? null;

  const tapCard = (c: Card) => {
    if (!myTurnToPlay) return;
    if (!legalIds.has(c.id)) { sfx.illegalMove(); return; }
    sfx.uiClick();
    setSelected((s) => (s === c.id ? null : c.id));
  };
  const confirmPlay = () => {
    if (selectedCard) { p.onPlay(selectedCard); setSelected(null); }
  };

  return (
    <div className="w-screen h-[100dvh] felt flex flex-col overflow-hidden select-none">
      {/* Top bar */}
      <div className="flex items-center gap-2.5 px-2.5 py-2.5 text-sm border-b border-white/10 bg-black/25">
        <button className="glass rounded-full w-9 h-9 flex items-center justify-center text-lg text-stone-200 hover:bg-white/10" onClick={p.onExit}>←</button>
        <button className="glass rounded-full w-9 h-9 flex items-center justify-center text-lg text-stone-200 hover:bg-white/10" onClick={() => { sfx.uiClick(); setShowSettings(true); }} title="Settings">⚙</button>
        {p.banner && <span className="uppercase tracking-widest text-gold-300/90 text-[11px]">{p.banner}</span>}
        <div className="ml-auto flex items-center gap-2.5 text-[11px] text-stone-300 whitespace-nowrap">
          {r.winningBid != null && <span>Bid <b className="text-gold-300">{r.winningBid}</b></span>}
          {trump && (
            <span className="flex items-center gap-1">
              <span className="text-stone-500">trump</span>
              <span className={`text-base leading-none ${trump === "H" || trump === "D" ? "text-rose-400" : "text-stone-100"}`}>{SUIT_GLYPHS[trump]}</span>
            </span>
          )}
          {r.partnerCard && (
            <span className="flex items-center gap-1">
              <span className="text-stone-500">call</span>
              <span className={`font-semibold ${r.partnerCard.suit === "H" || r.partnerCard.suit === "D" ? "text-rose-300" : "text-stone-100"}`}>
                {RANK_LABEL[r.partnerCard.rank]}{SUIT_GLYPHS[r.partnerCard.suit]}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Opponents */}
      <div className="flex justify-around items-start gap-1 px-1 py-2">
        {opponents.map((pl) => {
          const active = r.phase === "playing" ? r.toPlay === pl.id : r.phase === "bidding" ? r.bidTurn === pl.id : r.bidder === pl.id;
          const isCaller = r.bidder === pl.id;
          const isPartner = (r.revealedPartners ?? []).includes(pl.id);
          const captured = pl.tricksWon.reduce((s, c) => s + cardPoints(c), 0);
          return (
            <div key={pl.id} className={`flex flex-col items-center gap-0.5 px-1 py-1 rounded-xl ${active ? "ring-2 ring-gold-400 bg-gold-500/10" : ""}`}>
              <div className="relative w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-lg"
                style={{ background: pl.isAI ? avatarColor(pl.id) : "#e0a93a", boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.12)" }}>
                <img src={seatIcon(pl.id)} alt="" className="w-full h-full object-cover" />
                <span className="absolute -bottom-0.5 -right-0.5 bg-black/85 text-[9px] leading-none px-1 py-0.5 rounded-full text-stone-200 font-mono">{pl.hand.length}</span>
              </div>
              <div className="text-[10px] text-stone-200 truncate max-w-[70px] leading-tight">
                {pl.name}{isCaller && <span className="text-gold-400"> ★</span>}{isPartner && <span className="text-amber-300"> ◆</span>}
              </div>
              <div className="text-[10px] text-gold-400 font-mono leading-none">{captured}</div>
            </div>
          );
        })}
      </div>

      {/* Turn banner */}
      {turnText && (
        <div className="text-center text-[11px] uppercase tracking-widest text-gold-400/90 py-1">
          {turnText}
          {p.secondsLeft != null && <span className={`ml-2 font-mono ${p.secondsLeft <= 5 ? "text-rose-400" : "text-stone-300"}`}>{p.secondsLeft}s</span>}
        </div>
      )}

      {/* Center: the current round's cards, positioned around the table */}
      <div className="flex-1 min-h-0 relative">
        {trickPlays.length > 0 ? (
          trickPlays.map((tp, idx) => {
            const rel = (tp.player - me + 5) % 5;
            const done = r.pendingTrickComplete;
            const isWinner = done && r.currentTrick?.winner === tp.player;
            const isLead = idx === 0; // first card played led the round
            return (
              <div key={`${tp.player}-${tp.card.id}`} className="absolute z-10 flex flex-col items-center transition-all" style={TRICK_POS[rel]}>
                <span className="text-[10px] mb-0.5 max-w-[80px] truncate text-stone-200/85">
                  {state.players[tp.player].name}{isLead && <span className="text-sky-300/90"> · led</span>}
                </span>
                <div className={`rounded-lg ${done && !isWinner ? "opacity-30 grayscale" : ""} ${isWinner ? "ring-2 ring-gold-400" : isLead ? "ring-1 ring-sky-300/60" : ""}`}>
                  <CardView card={tp.card} size={72} staticView />
                </div>
              </div>
            );
          })
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-stone-500 text-sm italic">
            {r.phase === "playing" ? "Waiting for the lead…" : ""}
          </div>
        )}
      </div>

      {/* Continue (single-player trick collect) */}
      {r.pendingTrickComplete && p.onContinue && (
        <div className="px-3 pb-2">
          <button className="btn btn-primary w-full py-2.5" onClick={p.onContinue}>Continue</button>
        </div>
      )}

      {/* Bidding panel (compact) */}
      {showBidPanel && <MobileBidPanel state={state} me={me} onBid={p.onBid} onPass={p.onPass} />}

      {/* Confirm-play bar */}
      {myTurnToPlay && selectedCard && (
        <div className="px-3 pb-1.5 flex items-center gap-2">
          <button className="flex-1 btn btn-primary py-2.5" onClick={confirmPlay}>
            Play {SUIT_GLYPHS[selectedCard.suit]}{rankLabel(selectedCard.rank)}
          </button>
          <button className="btn btn-ghost py-2.5 px-3" onClick={() => setSelected(null)}>✕</button>
        </div>
      )}

      {/* My status: own captured points + role */}
      {!showRoundEnd && (
        <div className="flex items-center justify-center gap-1.5 text-[11px] pb-0.5">
          <span className="text-stone-400">You</span>
          {r.bidder === me && <span className="text-gold-400" title="Caller">★</span>}
          {(r.revealedPartners ?? []).includes(me) && <span className="text-amber-300" title="Partner">◆</span>}
          <span className="text-gold-400 font-mono">{state.players[me].tricksWon.reduce((s, c) => s + cardPoints(c), 0)} pts</span>
        </div>
      )}

      {/* My hand — "compact" shows every card wrapped; "swipe" is a bigger fan */}
      {!showRoundEnd && (layout === "compact" ? (
        <div className="flex flex-wrap justify-center gap-1 px-2 py-2">
          {hand.map((c) => {
            const isSel = c.id === selected;
            const dimmed = myTurnToPlay && !legalIds.has(c.id);
            return (
              <div key={c.id} role="button" onClick={() => tapCard(c)}
                className={`rounded-md transition ${isSel ? "ring-2 ring-gold-400" : ""} ${dimmed ? "opacity-35" : ""}`}>
                <CardView card={c} size={50} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="w-full overflow-x-auto overflow-y-hidden no-scrollbar" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="flex px-3 py-2 items-end" style={{ minWidth: "100%", width: "max-content", justifyContent: "safe center" as "center" }}>
            {hand.map((c, i) => {
              const isSel = c.id === selected;
              const dimmed = myTurnToPlay && !legalIds.has(c.id);
              return (
                <div
                  key={c.id}
                  role="button"
                  onClick={() => tapCard(c)}
                  style={{ marginLeft: i === 0 ? 0 : -HAND_OVERLAP, zIndex: isSel ? 100 : i }}
                  className={`shrink-0 rounded-lg transition ${isSel ? "ring-2 ring-gold-400" : ""} ${dimmed ? "opacity-35" : ""}`}
                >
                  <CardView card={c} size={HAND_CARD_W} />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Declare overlay (compact, two-step) */}
      {showDeclare && <MobileDeclarePanel state={state} me={me} onDeclare={p.onDeclare} />}

      {/* Round / game end */}
      {showRoundEnd && <RoundEnd state={state} onNext={p.onRoundNext ?? p.onExit} />}

      {/* Settings */}
      {showSettings && <MobileSettingsSheet onClose={() => setShowSettings(false)} onExit={p.onExit} />}
    </div>
  );
}

// ── Full-screen mobile settings (self-contained) ───────────────────────────
function MobileSettingsSheet({ onClose, onExit }: { onClose: () => void; onExit: () => void }) {
  const { skin, setSkin } = useCardSkin();
  const { layout, setLayout } = useHandLayout();
  const [music, setMusic] = useState(() => Math.round(getMusicVolume() * 100));
  const [sfxVol, setSfxVol] = useState(() => Math.round(getSfxVolume() * 100));
  const [showHelp, setShowHelp] = useState(false);
  const changeMusic = (pct: number) => { setMusic(pct); setMusicVolume(pct / 100); try { localStorage.setItem("bq:musicVol", String(pct / 100)); } catch { /**/ } };
  const changeSfx = (pct: number) => { setSfxVol(pct); setSfxVolume(pct / 100); try { localStorage.setItem("bq:sfxVol", String(pct / 100)); } catch { /**/ } };

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="mb-5">
      <div className="text-[11px] uppercase tracking-widest text-gold-400/80 mb-2">{label}</div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
  const Seg = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button onClick={() => { sfx.uiClick(); onClick(); }} className={`flex-1 text-sm py-2 rounded-lg transition-colors ${active ? "bg-gold-500/25 text-gold-200" : "bg-white/5 text-stone-400"}`}>{children}</button>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0c1f18] p-5 overflow-auto animate-floatIn">
      <div className="flex items-center justify-between mb-5">
        <div className="font-display text-2xl text-gold-400">Settings</div>
        <button className="text-stone-400 text-3xl leading-none w-9 h-9 rounded-full hover:bg-white/10" onClick={onClose}>×</button>
      </div>

      <Row label="Hand layout">
        <Seg active={layout === "swipe"} onClick={() => setLayout("swipe")}>Big · swipe</Seg>
        <Seg active={layout === "compact"} onClick={() => setLayout("compact")}>Compact · all</Seg>
      </Row>

      <Row label="Music">
        <input type="range" min={0} max={100} value={music} onChange={(e) => changeMusic(+e.target.value)} className="accent-gold-500 flex-1" />
        <span className="text-[11px] font-mono text-stone-400 w-9 text-right">{music}%</span>
      </Row>
      <Row label="Sound FX">
        <input type="range" min={0} max={100} value={sfxVol} onChange={(e) => changeSfx(+e.target.value)} onTouchEnd={() => sfx.cardPlay()} onMouseUp={() => sfx.cardPlay()} className="accent-gold-500 flex-1" />
        <span className="text-[11px] font-mono text-stone-400 w-9 text-right">{sfxVol}%</span>
      </Row>

      <Row label="Card design">
        <select value={skin} onChange={(e) => { sfx.uiClick(); setSkin(e.target.value as CardSkin); }} className="text-sm bg-white/5 rounded-md px-2 py-1.5 text-stone-100 border border-white/10 outline-none flex-1">
          {CARD_SKINS.map((s) => <option key={s.value} value={s.value} className="text-black">{s.label}</option>)}
        </select>
      </Row>

      <div className="mt-auto pt-4 flex gap-2">
        <button className="btn btn-ghost flex-1 py-2.5 text-sm" onClick={() => { sfx.uiClick(); setShowHelp(true); }}>How to play</button>
        <button className="flex-1 py-2.5 rounded-lg text-rose-300 bg-rose-500/10 text-sm" onClick={onExit}>Leave game</button>
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function rankLabel(rank: number): string {
  return rank === 14 ? "A" : rank === 13 ? "K" : rank === 12 ? "Q" : rank === 11 ? "J" : rank === 10 ? "10" : String(rank);
}

// ── Compact mobile bidding panel ───────────────────────────────────────────
function MobileBidPanel({ state, me, onBid, onPass }: {
  state: GameState; me: PlayerId; onBid: (n: number) => void; onPass: () => void;
}) {
  const r = state.round;
  const { min, max } = legalBidAmount(r);
  const isMyTurn = r.bidTurn === me;
  const highest = Math.max(0, ...r.bids.map((b) => b.amount));
  const last = r.bids[r.bids.length - 1];
  const lastBidder = highest > 0 && last ? state.players[last.player].name : null;
  const opts = [min, min + 5, min + 10, min + 15].filter((v) => v <= max).filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div className="px-3 pb-2">
      <div className="glass rounded-xl px-3 py-2.5">
        <div className="text-[11px] text-center text-stone-300 mb-2">
          {highest > 0
            ? <>Highest <b className="text-gold-300">{highest}</b>{lastBidder ? ` by ${lastBidder}` : ""}</>
            : <>No bids yet · opens at {min}</>}
        </div>
        {isMyTurn ? (
          <div className="flex gap-1.5 justify-center flex-wrap">
            <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={() => { sfx.uiClick(); onPass(); }}>Pass</button>
            {opts.map((v) => (
              <button key={v} className="btn btn-primary px-3 py-1.5 text-sm font-bold" onClick={() => { sfx.uiClick(); onBid(v); }}>{v}</button>
            ))}
          </div>
        ) : (
          <div className="text-xs text-stone-400 italic text-center">Waiting on {state.players[r.bidTurn ?? me]?.name}…</div>
        )}
      </div>
    </div>
  );
}

// ── Compact mobile declare sheet (trump → partner suit → partner rank) ──────
const DECLARE_RANKS: Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 5];

function MobileDeclarePanel({ state, me, onDeclare }: {
  state: GameState; me: PlayerId; onDeclare: (trump: Suit, partnerCard: Card) => void;
}) {
  const [trump, setTrump] = useState<Suit | undefined>();
  const [pSuit, setPSuit] = useState<Suit | undefined>();
  const [pRank, setPRank] = useState<Rank | undefined>();
  const hand = state.players[me].hand;
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of hand) m[`${c.suit}${c.rank}`] = (m[`${c.suit}${c.rank}`] || 0) + 1;
    return m;
  }, [hand]);
  const totalCopies = (s: Suit, r: Rank) => (s === "S" && r === 7 ? 1 : 2);
  const ownsAll = (s: Suit, r: Rank) => (counts[`${s}${r}`] || 0) >= totalCopies(s, r);
  const ranksFor = (s: Suit) => DECLARE_RANKS.filter((r) => r !== 7 || s === "S");
  const can = trump && pSuit && pRank && !ownsAll(pSuit, pRank);

  const SuitBtn = ({ s, active, onClick }: { s: Suit; active: boolean; onClick: () => void }) => {
    const red = s === "H" || s === "D";
    return (
      <button
        onClick={() => { sfx.uiClick(); onClick(); }}
        className={`text-2xl w-14 h-12 rounded-lg border transition ${active ? "bg-gold-500 text-stone-900 border-gold-500" : `bg-white/5 border-white/10 ${red ? "text-rose-300" : "text-stone-100"}`}`}
      >{SUIT_GLYPHS[s]}</button>
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0c1f18] p-4 overflow-auto">
      <div className="text-xs uppercase tracking-widest text-gold-400">Declare</div>
      <div className="text-sm text-stone-200 mt-1 mb-4">
        You won at <b className="text-gold-400">{state.round.winningBid}</b>. Pick trump and call a partner card.
      </div>

      <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1.5">Trump suit</div>
      <div className="flex gap-2 mb-5">{SUITS.map((s) => <SuitBtn key={s} s={s} active={trump === s} onClick={() => setTrump(s)} />)}</div>

      <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1.5">Partner card · suit</div>
      <div className="flex gap-2 mb-5">{SUITS.map((s) => <SuitBtn key={s} s={s} active={pSuit === s} onClick={() => { setPSuit(s); setPRank(undefined); }} />)}</div>

      {pSuit && (
        <>
          <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1.5">Partner card · rank <span className="text-stone-600">(dimmed = you own all copies)</span></div>
          <div className="flex gap-1.5 flex-wrap mb-5">
            {ranksFor(pSuit).map((r) => {
              const blocked = ownsAll(pSuit, r);
              const sel = pRank === r;
              return (
                <button
                  key={r}
                  disabled={blocked}
                  onClick={() => { sfx.uiClick(); setPRank(r); }}
                  className={`w-9 h-11 rounded-md text-sm transition ${sel ? "bg-gold-500 text-stone-900 font-bold" : blocked ? "bg-white/5 text-stone-600 border border-rose-700/30" : "bg-white/5 text-stone-200 border border-white/10"}`}
                >{RANK_LABEL[r]}</button>
              );
            })}
          </div>
        </>
      )}

      {/* Your hand, for reference while choosing — wrapped so all 13 show */}
      <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1.5">Your hand</div>
      <div className="flex flex-wrap gap-1.5 pb-1">
        {sortHandByColor(hand, trump).map((c) => <CardView key={c.id} card={c} size={52} staticView />)}
      </div>

      <div className="mt-auto pt-3">
        <button
          className="btn btn-primary w-full py-3"
          disabled={!can}
          onClick={() => { if (can && trump && pSuit && pRank) { sfx.uiClick(); onDeclare(trump, { suit: pSuit, rank: pRank, id: `${pSuit}${pRank}_0` }); } }}
        >
          {can && pSuit && pRank ? `Declare ${RANK_LABEL[pRank]}${SUIT_GLYPHS[pSuit]} · trump ${SUIT_GLYPHS[trump!]}` : "Pick trump + partner card"}
        </button>
      </div>
    </div>
  );
}
