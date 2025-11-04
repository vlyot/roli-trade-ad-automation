
# README.md


## roli-trade-ad-automation (Windows 11 + Chrome)
A small Rust CLI that **extracts your `roli_verification` cookie from Chrome** (Windows user profile) and **posts a trade ad on Rolimons** using the `roli` crate. It can run **once** or in a **loop** (about every 20 minutes with jitter).

The main objective is to automate posting of a trade ad every 20 minutes.
Refer to the documentation ClientBuilder in roli - Rust.html file for documentation on how to use the roli crate.

example of posting a trade ad:
```rust
use clap::Parser;
use roli::{trade_ads, ClientBuilder};

// To post a trade ad where you offer space hair for "any":
// cargo run --example --roli-verification xxx post_trade_ad -- --player-id 123456789 --offer-item-ids 564449640 --request-tags "any"

// To post a trade ad where you offer Gucci Headband and Boxing Gloves - KSI for Yellow Sleep Owl and "any" (remember to change player id):
// cargo run --example post_trade_ad -- --roli-verification xxx --player-id 123456789 --offer-item-ids 6803423284 --offer-item-ids 7212273948 --request-item-ids 259425946 --request-tags "any"

#[derive(Parser, Debug)]
struct Args {
    #[arg(long)]
    roli_verification: String,
    #[arg(long)]
    player_id: u64,
    #[arg(long)]
    offer_item_ids: Vec<u64>,
    #[arg(long)]
    request_item_ids: Vec<u64>,
    #[arg(long)]
    request_tags: Vec<String>,
}

#[tokio::main]
async fn main() {
    let args = Args::parse();

    if args.offer_item_ids.is_empty() {
        panic!("You must specify at least one item ID to offer!");
    }

    if (args.request_item_ids.len() + args.request_tags.len()) == 0 {
        panic!("You must specify at least one item ID or tag to request!");
    }

    let request_tags = args
        .request_tags
        .iter()
        .map(|tag| match tag.to_lowercase().as_str() {
            "any" => trade_ads::RequestTag::Any,
            "demand" => trade_ads::RequestTag::Demand,
            "rares" => trade_ads::RequestTag::Rares,
            "robux" => trade_ads::RequestTag::Robux,
            "upgrade" => trade_ads::RequestTag::Upgrade,
            "downgrade" => trade_ads::RequestTag::Downgrade,
            "rap" => trade_ads::RequestTag::Rap,
            "wishlist" => trade_ads::RequestTag::Wishlist,
            "projecteds" => trade_ads::RequestTag::Projecteds,
            "adds" => trade_ads::RequestTag::Adds,
            _ => panic!("Invalid request tag: {}", tag),
        })
        .collect();

    let client = ClientBuilder::new()
        .set_roli_verification(args.roli_verification)
        .build();

    let create_trade_ad_params = trade_ads::CreateTradeAdParams {
        player_id: args.player_id,
        offer_item_ids: args.offer_item_ids,
        request_item_ids: args.request_item_ids,
        request_tags,
    };

    match client.create_trade_ad(create_trade_ad_params).await {
        Ok(_) => println!(
            "Trade ad posted! Visible at https://www.rolimons.com/playertrades/{}",
            args.player_id
        ),
        Err(e) => panic!("{}", e),
    }
}
```


> ⚠️ **Only use with your own account.** Cookies are secrets. Keep them safe and respect the site’s Terms of Service.


---


## Features
- 🔑 Automatically locates Chrome’s **Local State** + **Cookies** DB for the *Default* profile (or a path you provide).
- 🔓 Decrypts Chrome’s cookie encryption (AES‑GCM key unwrapped via **Windows DPAPI**) and retrieves `roli_verification`.
- 📢 Posts a trade ad via `roli::Client::create_trade_ad`.
- ⏱️ Two modes:
- **One‑shot**: post once and exit.
