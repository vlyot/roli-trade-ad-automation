// verification.rs
// Responsibility: Generate random verification codes for user authentication.

use rand::seq::SliceRandom;

const WORDS: &[&str] = &[
    "apple",
    "banana",
    "cherry",
    "dragon",
    "elephant",
    "falcon",
    "giraffe",
    "horizon",
    "igloo",
    "jungle",
    "koala",
    "lemon",
    "mountain",
    "neptune",
    "ocean",
    "penguin",
    "quartz",
    "river",
    "sunset",
    "tiger",
    "umbrella",
    "valley",
    "waterfall",
    "xylophone",
    "yellow",
    "zebra",
    "asteroid",
    "butterfly",
    "cascade",
    "diamond",
    "eclipse",
    "fortress",
    "galaxy",
    "harbor",
    "island",
    "jasmine",
    "kingdom",
    "lighthouse",
    "meadow",
    "nebula",
    "oasis",
    "phoenix",
    "quantum",
    "rainbow",
    "sapphire",
    "thunder",
    "universe",
    "volcano",
];

/// Generate a random verification code with 5-10 words.
pub fn generate_verification_code() -> String {
    let mut rng = rand::thread_rng();
    let word_count = rand::Rng::gen_range(&mut rng, 5..=10);

    let selected: Vec<&str> = WORDS
        .choose_multiple(&mut rng, word_count)
        .copied()
        .collect();

    selected.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_verification_code() {
        let code = generate_verification_code();
        let words: Vec<&str> = code.split_whitespace().collect();
        assert!(words.len() >= 5 && words.len() <= 10);
    }
}
