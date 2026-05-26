use rand_xoshiro::Xoshiro256PlusPlus;
use rand_xoshiro::rand_core::SeedableRng;

pub type GameRng = Xoshiro256PlusPlus;

pub fn from_seed(seed: u64) -> GameRng {
    Xoshiro256PlusPlus::seed_from_u64(seed)
}
