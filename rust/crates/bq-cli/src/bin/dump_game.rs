// =============================================================================
//  dump_game — play a single game with specified personalities and print a
//  full human-readable trace. Used for qualitative analysis: spot moments
//  where the AI made a questionable play.
//
//  Usage:
//    dump_game [SEAT1,SEAT2,SEAT3,SEAT4,SEAT5] [TIME_MS=80] [SEED=42]
//
//  SEATs in {hard, hard2, hard3, hard4, normal, random}.
//  Default: hard4,hard4,hard3,hard3,normal
// =============================================================================

use bq_ai::hard4::{hard4_bid, hard4_declare, hard4_play};
use bq_engine::engine::{apply_bid, apply_declare, apply_pass, apply_play, new_game_with_intensity};
use bq_engine::rng::{from_seed, GameRng};
use bq_engine::rules::{legal_play_indices, trick_points, trick_winner};
use bq_engine::types::{Card, Phase, PlayerId, Suit};

#[derive(Copy, Clone, PartialEq, Eq, Debug)]
enum Seat { Hard, Hard2, Hard3, Hard4, Normal, Random }

impl Seat {
    fn parse(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "hard"   => Seat::Hard,
            "hard2"  => Seat::Hard2,
            "hard3"  => Seat::Hard3,
            "hard4"  => Seat::Hard4,
            "normal" => Seat::Normal,
            "random" => Seat::Random,
            _ => panic!("unknown seat: {}", s),
        }
    }
    fn label(self) -> &'static str {
        match self {
            Seat::Hard => "Hard",
            Seat::Hard2 => "Hard-2",
            Seat::Hard3 => "Hard-3",
            Seat::Hard4 => "Hard-4",
            Seat::Normal => "Normal",
            Seat::Random => "Random",
        }
    }
}

fn suit_glyph(s: Suit) -> char {
    match s { Suit::S => '♠', Suit::H => '♥', Suit::D => '♦', Suit::C => '♣' }
}
fn rank_label(r: u8) -> &'static str {
    match r {
        14 => "A", 13 => "K", 12 => "Q", 11 => "J",
        10 => "T", 9 => "9", 8 => "8", 7 => "7", 5 => "5",
        _ => "?",
    }
}
fn card_str(c: Card) -> String { format!("{}{}", suit_glyph(c.suit), rank_label(c.rank)) }

fn hand_by_suit(hand: &[Card]) -> String {
    let mut by: [Vec<u8>; 4] = Default::default();
    for c in hand {
        let i = match c.suit { Suit::S => 0, Suit::H => 1, Suit::D => 2, Suit::C => 3 };
        by[i].push(c.rank);
    }
    let mut parts = Vec::new();
    for (i, ranks) in by.iter_mut().enumerate() {
        if ranks.is_empty() { continue; }
        ranks.sort_unstable();
        ranks.reverse();
        let suit = [Suit::S, Suit::H, Suit::D, Suit::C][i];
        let rs: String = ranks.iter().map(|r| rank_label(*r)).collect::<Vec<_>>().join("");
        parts.push(format!("{}{}", suit_glyph(suit), rs));
    }
    parts.join(" ")
}

fn pick_bid(state: &bq_engine::types::GameState, seat: Seat, p: PlayerId, time_ms: u64, rng: &mut GameRng) -> Option<u16> {
    // For simplicity, route all non-default personalities through the
    // hard4_bid path. This biases the trace toward Hard-4-style bidding for
    // non-Hard-4 seats, but the BIDDING is not the focus of this qualitative
    // analysis (the PLAYS are). Acceptable simplification.
    let _ = (seat, time_ms, rng);
    hard4_bid(state, p)
}

fn pick_play(state: &bq_engine::types::GameState, seat: Seat, p: PlayerId, time_ms: u64, rng: &mut GameRng) -> Card {
    // For Hard-4 seats: use full ISMCTS at the given time budget.
    // For all other personalities: also Hard-4 but at much shorter budget so
    // they play a weaker but still legal version. This is a simplification
    // because the real Hard/Hard-2/Hard-3 personalities live in the TS dispatch
    // layer; here we just play Hard-4 at three different budgets to simulate
    // a spread of strengths.
    let budget = match seat {
        Seat::Hard4 => time_ms,
        Seat::Hard3 => (time_ms / 3).max(10),
        Seat::Hard2 => (time_ms / 6).max(5),
        Seat::Hard  => (time_ms / 10).max(3),
        Seat::Normal => 2,  // near-random ISMCTS
        Seat::Random => 1,  // effectively random
    };
    hard4_play(state, p, budget, rng)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let seats_arg = args.get(1).cloned().unwrap_or_else(|| "hard4,hard4,hard3,hard3,normal".into());
    let time_ms: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(80);
    let seed: u64 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(42);

    let seat_names: Vec<&str> = seats_arg.split(',').collect();
    if seat_names.len() != 5 { panic!("need 5 seats, got {}", seat_names.len()); }
    let seats: [Seat; 5] = [
        Seat::parse(seat_names[0]),
        Seat::parse(seat_names[1]),
        Seat::parse(seat_names[2]),
        Seat::parse(seat_names[3]),
        Seat::parse(seat_names[4]),
    ];

    let mut rng: GameRng = from_seed(seed);
    let first_bidder = (seed % 5) as PlayerId;
    let state = new_game_with_intensity(&mut rng, first_bidder, 0.0);

    println!("=== GAME ===");
    print!("seats: ");
    for i in 0..5 { print!("P{}={} ", i, seats[i].label()); }
    println!();
    println!("seed={}  intensity=0.0 (light)  first_bidder=P{}", seed, first_bidder);
    println!();
    println!("INITIAL HANDS:");
    for p in 0..5usize {
        println!("  P{} ({:<6}): {}", p, seats[p].label(), hand_by_suit(&state.hands[p]));
    }
    println!();

    // Bidding
    println!("BIDDING:");
    let mut state = state;
    while state.phase == Phase::Bidding {
        let p = state.next_to_act;
        let bid = pick_bid(&state, seats[p as usize], p, time_ms, &mut rng);
        match bid {
            Some(amt) => {
                println!("  P{} bids {}", p, amt);
                apply_bid(&mut state, p, amt);
            }
            None => {
                println!("  P{} passes", p);
                apply_pass(&mut state, p);
            }
        }
    }
    println!("  → CALLER: P{} at {}", state.caller.unwrap(), state.winning_bid.unwrap_or(0));
    println!();

    // Declare
    if state.phase == Phase::Declaring {
        let caller = state.caller.unwrap();
        let (trump, partner) = hard4_declare(&state, caller);
        println!("DECLARE:");
        println!("  P{} declares trump={}, partner-card={}", caller, suit_glyph(trump), card_str(partner));
        // Show which seats actually hold that card (the partners).
        let mut partner_seats = Vec::new();
        for p in 0..5u8 {
            if p == caller { continue; }
            if state.hands[p as usize].iter().any(|c| c.suit == partner.suit && c.rank == partner.rank) {
                partner_seats.push(p);
            }
        }
        print!("  (hidden:");
        if partner_seats.is_empty() { print!(" no partner — caller holds the only copy"); }
        else {
            for p in &partner_seats { print!(" P{}", p); }
        }
        println!(")");
        apply_declare(&mut state, trump, partner);
    }
    println!();

    // Tricks
    println!("TRICKS:");
    let trump = state.trump;
    let mut trick_num = 1;
    while state.phase == Phase::Playing {
        // Each pass through this loop is one PLAY (5 plays make a trick).
        let p = state.next_to_act;
        let leader_at_start_of_play = state.current_trick.as_ref()
            .and_then(|t| t.plays.first().map(|tp| tp.player));

        // Header for new trick.
        if state.current_trick.is_none() || state.current_trick.as_ref().unwrap().plays.is_empty() {
            let led_by_str = if let Some(t) = state.current_trick.as_ref() {
                if t.plays.is_empty() { format!("led by P{}", t.leader) } else { "".into() }
            } else { format!("led by P{}", p) };
            println!("  -- Trick {} ({}) --", trick_num, led_by_str);
        }

        let hand = &state.hands[p as usize];
        let legal = legal_play_indices(hand, state.current_trick.as_ref());
        let legal_cards: Vec<Card> = legal.iter().map(|&i| hand[i]).collect();
        let card = pick_play(&state, seats[p as usize], p, time_ms, &mut rng);
        let chosen_idx = hand.iter().position(|c| *c == card).unwrap();
        let forced = legal.len() == 1;

        // Pretty-print the alternatives the AI considered.
        let alts: String = if forced {
            "forced".into()
        } else {
            let alt_strs: Vec<String> = legal_cards.iter()
                .filter(|c| **c != card)
                .map(|c| card_str(*c)).collect();
            format!("from {} legal · alts: {}", legal.len(), alt_strs.join(" "))
        };

        // Mark if this play reveals a partner (this is the partner card and player is not caller).
        let reveals_partner = state.partner_card.map_or(false, |pc| {
            card.suit == pc.suit && card.rank == pc.rank && Some(p) != state.caller
        });

        let suit_status: &str = if let Some(t) = state.current_trick.as_ref() {
            if let Some(led) = t.plays.first().map(|tp| tp.card.suit) {
                if card.suit == led { "follow" }
                else if Some(card.suit) == trump { "TRUMP" }
                else { "discard" }
            } else { "lead" }
        } else { "lead" };

        let reveal_str = if reveals_partner { "  ★PARTNER REVEALED★" } else { "" };
        println!("    P{} {} [{}] ({}){}",
            p, card_str(card), suit_status, alts, reveal_str);

        let _ = leader_at_start_of_play;
        apply_play(&mut state, p, chosen_idx);

        // If trick just completed, show the winner.
        // The engine auto-collects when 5 plays land. We can detect by tricks length growing.
        if state.tricks.len() >= trick_num {
            let last = &state.tricks[trick_num - 1];
            let pts = trick_points(last);
            let winner = trick_winner(last, trump);
            // Pretty annotate the winner card.
            let win_play = last.plays.iter().find(|tp| tp.player == winner).unwrap();
            println!("    → WINNER P{} with {} · trick points: {}", winner, card_str(win_play.card), pts);
            println!();
            trick_num += 1;
        }
    }

    // Final summary.
    println!("FINAL:");
    let caller = state.caller.unwrap();
    let bid = state.winning_bid.unwrap_or(0);
    let partner_card = state.partner_card.unwrap();
    let mut team_pts = state.captured_points[caller as usize];
    let mut team: Vec<PlayerId> = vec![caller];
    for p in 0..5u8 {
        if p == caller { continue; }
        let played = state.tricks.iter().flat_map(|t| t.plays.iter())
            .any(|tp| tp.player == p && tp.card == partner_card);
        if played {
            team.push(p);
            team_pts += state.captured_points[p as usize];
        }
    }
    let made = team_pts >= bid;
    println!("  Caller P{} team: {:?}", caller, team);
    print!("  Captured per seat:");
    for p in 0..5 { print!(" P{}={}", p, state.captured_points[p]); }
    println!();
    println!("  Caller-team total: {}, Bid: {} → {}", team_pts, bid, if made { "MADE ✓" } else { "FAILED ✗" });
}
