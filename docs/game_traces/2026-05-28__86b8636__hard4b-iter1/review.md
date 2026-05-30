# Hard-4B — iteration 1 observation review

**Batch:** 6 games, Hard-4 fixed in seat P0, opponents `random, normal, hard, hard-3`.
**Lens:** information-set critique (fault Hard-4 only for plays dominated given what it knew).

## Hard-4's roles this batch
- **Caller** in 3 games: 770001 (240, ♠), 785839 (200, ♠), 793758 (240, ♠).
- **Partner/defender** in the other 3.

## Caller play — one clear info-set mistake, the rest correct

| game | bid | trick-1 lead | result |
|---|---|---|---|
| 785839 | 200 ♠ | **K♠** (draws trump) | MADE 215 |
| 793758 | 240 ♠ | **A♠** (draws trump) | MADE 270 |
| 770001 | 240 ♠ | **10♦** (side-suit 10-pt card) | **FAILED 210** |

**The mistake (770001, R1):** Hard-4 held `♠AKQJJ85 ♥Q10 ♦Q1088` — a *dominant* trump
suit (A K Q J J, 7 long). The textbook caller line is to **draw trumps** (lead a
top spade). Instead it led **10♦** — a 10-point card in a side suit it does NOT
control (it holds only Q-high; both A♦ and K♦ are outstanding). It got crushed:
the trick went to an opponent for **40 points** on trick 1, and the contract
failed by 30. This is dominated *from Hard-4's own information*: you don't lead a
point card you can't win out of a side suit when you hold a crushing trump suit.

Crucially, in the **other two** caller games Hard-4 led a top trump (K♠/A♠) and
made — so it usually plays this correctly. The 770001 lead is the **noisy
trick-1 decision** (13 cards out, maximum hidden information → ISMCTS least
reliable) faltering.

## Partner/defender play — sound
- 777920 (Hard-4 = partner): the flagged Q♠ discard was a **correct smear** onto
  its own caller's winning trump trick (+30 to the team); game MADE. A couple of
  mid-value smears got over-trumped by an opponent later, but the intent was
  right and the over-trump was unknowable at decision time (variance, not error).
- No instances of Hard-4 dumping points onto a *known-enemy* trick (the existing
  guard holds).

## Diagnosis & Hard-4B hypothesis

The single reproducible-looking weakness is the **caller's opening lead**: with a
dominant trump holding, Hard-4 *occasionally* (1 of 3 here) fails to draw trumps
and instead leads a losing side-suit point card. Trick 1 is exactly where ISMCTS
is weakest (most hidden info, shallowest effective search).

**Hypothesis for Hard-4B v1:** a narrow, domain-true rule applied ONLY at the
caller's first lead — *if the caller holds a dominant trump suit, lead a top
trump (draw trumps) instead of the ISMCTS pick.* This targets the search's known
weakest decision point rather than overriding it generally.

## Caveats (important)
- **n = 1 instance.** Could be noise. Two of three caller games were already correct.
- This is **heuristic injection**, which has *repeatedly regressed* this session
  (PUCT prior, tactical rollout, bid prior). The bar to ship is therefore an A/B
  win, not plausibility.
- **Arbiter:** implement behind `hard4b_enabled()`, then
  `_mirror_arena.ts 500 hard-4b hard-4` (expect positive edge) **and**
  `_elo_rr.ts place hard-4b 500` (expect Elo above hard-4's 1208 with
  non-overlapping CI). If it doesn't clear the bar → null, revert, document.

## Next step
Implement the gated caller-opening-trump-draw rule in the `hard-4b` path, rebuild,
and A/B. The observation gave a concrete, falsifiable hypothesis — the A/B decides.

## v1 RESULT — budget reallocation (not the trump heuristic)

Implemented the *principled* version instead of the trump heuristic: **budget
reallocation** (`hard4_play`, gated by `hard4b_enabled()`) — same total ISMCTS
iterations, but `factor = 0.5 + h/13` front-loads ~1.5× onto trick 1 (the noisy
opening) tapering to ~0.58× on the near-solved endgame.

A/B `_mirror_arena 500 hard-4b hard-4` (HARD4_TIME_MS=80, equal budget):
- hard-4b 53.64% vs hard-4 52.96% → **+0.68pp**.

**Verdict: marginal, NOT significant** (~1 SE at N=500; even if real, ≈4–5 Elo —
within Hard-4's CI). Consistent with the session-wide finding that no cheap lever
moves Hard-4 >1pp. Kept gated/OFF (default Hard-4 unaffected); not shipped.

This says the opening-lead miss in 770001 was largely **search noise**, not a
systematic exploitable flaw that front-loading meaningfully fixes. → Iteration 2:
hunt for a *clearer* systematic mistake against stronger opponents (which punish
errors), rather than chase sub-1pp tweaks.
