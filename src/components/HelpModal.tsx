interface Props {
  onClose: () => void;
}

export function HelpModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass rounded-2xl p-7 w-[680px] max-h-[88vh] overflow-auto animate-floatIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-2xl text-gold-400">How to Play Black Queen</h2>
          <button className="btn btn-ghost text-sm" onClick={onClose}>Close</button>
        </div>
        <div className="space-y-4 text-sm leading-relaxed text-stone-200">
          <section>
            <h3 className="text-xs uppercase tracking-widest text-gold-400 mb-1">Goal</h3>
            <p>
              One player wins a bid for the right to choose trump and call a hidden partner — but they must capture enough card points across 13 rounds to make their bid.
            </p>
          </section>
          <section>
            <h3 className="text-xs uppercase tracking-widest text-gold-400 mb-1">Deck</h3>
            <p>
              5 players. <b>65 cards</b> built from two combined decks with the 2s, 3s, 4s, and 6s removed, plus only a <b>single 7♠</b> (all other 7s removed). Each player is dealt <b>13 cards</b>.
            </p>
            <p>
              Card points (total 300 in the deck):
              <span className="ml-2 text-gold-400 font-semibold">Q♠ = 30</span>,
              <span className="ml-2 text-gold-400 font-semibold">A = 15</span>,
              <span className="ml-2 text-gold-400 font-semibold">10 = 10</span>,
              <span className="ml-2 text-gold-400 font-semibold">5 = 5</span>.
            </p>
          </section>
          <section>
            <h3 className="text-xs uppercase tracking-widest text-gold-400 mb-1">Bidding</h3>
            <p>
              A random player starts the bidding. The opening bid must be at least <b>150</b>. Each new bid must be 5 higher than the previous. Maximum bid is <b>300</b> (the total points in the deck). Once you pass, you're out for the round. Bidding ends when only one player remains active — they win.
            </p>
          </section>
          <section>
            <h3 className="text-xs uppercase tracking-widest text-gold-400 mb-1">Declaring</h3>
            <p>
              The high bidder becomes the <b>Caller</b>. They name a trump suit, then name a partner card by <b>rank + suit</b> (e.g. "Ace of Spades"). Anyone holding a copy of that card becomes a hidden partner — they don't announce themselves. Since the deck has two copies of most cards, there may be <b>1 or 2 partners</b>.
            </p>
            <p>
              You <b>cannot</b> call a card you own all copies of. You can call a card you own one copy of (then the other copy is your partner).
            </p>
          </section>
          <section>
            <h3 className="text-xs uppercase tracking-widest text-gold-400 mb-1">Play</h3>
            <p>
              The Caller leads the first round. Players must follow the led suit if they have it; otherwise they may play anything, including trump. Highest trump wins the round; with no trump, the highest card of the led suit wins. Winner leads the next round. A partner is revealed only by playing their matching card.
            </p>
          </section>
          <section>
            <h3 className="text-xs uppercase tracking-widest text-gold-400 mb-1">Scoring</h3>
            <p>
              If the Caller + all partners capture <span className="text-emerald-300">≥ bid</span> in round points, every member of the team scores <span className="text-emerald-300">+bid</span>. If they fall short, every team member scores <span className="text-rose-300">−bid</span>. Opponents need <b>(300 − bid + 1)</b> points to defeat the bid.
            </p>
          </section>
          <section>
            <h3 className="text-xs uppercase tracking-widest text-gold-400 mb-1">Strategy</h3>
            <p>
              Every play is a clue. If you smear points to a round someone else is winning, you're telling the table whose side you're on. If you ruff a teammate's round, you've shown your hand. Read bids, voids, and trump plays carefully — the deception is the whole game.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
