// main.rs: Entry point for the Rolimons trade ad automation CLI.
// Handles argument parsing, orchestrates cookie extraction and trade ad posting using modularized helpers.

use anyhow::Result;
use clap::Parser;
use rand::Rng;
mod trade_ad;
use crate::trade_ad::*;
use roli::ClientBuilder;

/// CLI flags
#[derive(clap::Parser, Debug)]
struct Args {
    /// Use legacy roli crate mode (for troubleshooting)
    #[arg(long, default_value_t = false)]
    legacy: bool,
    /// Your Roblox / Rolimons player id (omit with --print-only)
    #[arg(long)]
    player_id: Option<u64>,

    /// Offered item ids (repeat or comma-separate)
    #[arg(long, num_args = 1.., value_delimiter = ',')]
    offer_item_ids: Vec<u64>,

    /// Requested item ids (optional: repeat or comma-separate)
    #[arg(long, num_args = 0.., value_delimiter = ',')]
    request_item_ids: Vec<u64>,

    /// Request tags (any,demand,rares,robux,upgrade,downgrade,rap,wishlist,projecteds,adds)
    /// (optional: repeat or comma-separate)
    #[arg(long, num_args = 0.., value_delimiter = ',')]
    request_tags: Vec<String>,

    /// Provide roli_verification cookie directly (bypasses Chrome extraction)
    #[arg(long)]
    roli_verification: Option<String>,

    /// Print cookie only; do not post
    #[arg(long, default_value_t = false)]
    print_only: bool,

    /// Long-running loop (~20 min + jitter)
    #[arg(long, default_value_t = false)]
    loop_mode: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    println!("[DEBUG] Parsing CLI arguments");
    let args = Args::parse();
    println!("[DEBUG] Args: {:?}", args);

    let token = if let Some(cookie) = &args.roli_verification {
        println!("[DEBUG] Using roli_verification from CLI");
        cookie.clone()
    } else {
        use std::io::Write;
        print!("Enter your _RoliVerification cookie value: ");
        std::io::stdout().flush().ok();
        let mut input = String::new();
        std::io::stdin().read_line(&mut input).ok();
        let input = input.trim().to_string();
        if input.is_empty() {
            eprintln!("[ERROR] No cookie value provided");
            return Err(anyhow::anyhow!("No roli_verification cookie provided"));
        }
        input
    };

    if args.print_only {
        println!("[DEBUG] print_only flag set, exiting after printing cookie");
        return Ok(());
    }

    println!("[DEBUG] Validating posting inputs");
    let player_id = match args.player_id {
        Some(id) => id,
        None => {
            eprintln!("[ERROR] --player-id is required unless --print-only is used");
            return Err(anyhow::anyhow!(
                "--player-id is required unless --print-only is used"
            ));
        }
    };
    if args.offer_item_ids.is_empty() {
        eprintln!("[ERROR] You must specify at least one --offer-item-ids");
        anyhow::bail!("You must specify at least one --offer-item-ids");
    }
    if (args.request_item_ids.len() + args.request_tags.len()) == 0 {
        eprintln!("[ERROR] Provide at least one of --request-item-ids or --request-tags");
        anyhow::bail!("Provide at least one of --request-item-ids or --request-tags");
    }

    if !args.legacy {
        println!("[DEBUG] Using direct API post (default mode)");
        let request_tags = args.request_tags.clone();
        if args.loop_mode {
            println!("[DEBUG] Entering loop mode (direct)");
            let mut next = tokio::time::Instant::now();
            loop {
                println!("[DEBUG] Posting trade ad in loop (direct)");
                match post_trade_ad_direct(
                    &token,
                    player_id,
                    args.offer_item_ids.clone(),
                    args.request_item_ids.clone(),
                    request_tags.clone(),
                )
                .await
                {
                    Ok(_) => println!("[DEBUG] Trade ad posted (direct)!"),
                    Err(e) => eprintln!("[ERROR] Direct post failed: {e}"),
                }
                let jitter: i64 = rand::thread_rng().gen_range(-120..=120);
                let base = 20 * 60;
                next += std::time::Duration::from_secs((base as i64 + jitter).max(60) as u64);
                println!(
                    "[DEBUG] Sleeping for {} seconds",
                    (base as i64 + jitter).max(60)
                );
                tokio::time::sleep(next.saturating_duration_since(tokio::time::Instant::now()))
                    .await;
            }
        } else {
            println!("[DEBUG] Posting trade ad once (direct)");
            match post_trade_ad_direct(
                &token,
                player_id,
                args.offer_item_ids.clone(),
                args.request_item_ids.clone(),
                request_tags.clone(),
            )
            .await
            {
                Ok(_) => println!("[DEBUG] Trade ad posted (direct)!"),
                Err(e) => eprintln!("[ERROR] Direct post failed: {e}"),
            }
        }
    } else {
        println!("[DEBUG] Building roli client (legacy mode)");
        let client = ClientBuilder::new().set_roli_verification(token).build();

        println!("[DEBUG] Mapping request tags");
        let request_tags = args
            .request_tags
            .iter()
            .map(|t| map_request_tag(&t.to_lowercase()))
            .collect::<Vec<_>>();
        println!("[DEBUG] request_tags mapped: {:?}", request_tags);

        if args.loop_mode {
            println!("[DEBUG] Entering loop mode (legacy)");
            let mut next = tokio::time::Instant::now();
            loop {
                println!("[DEBUG] Posting trade ad in loop (legacy)");
                post_once(
                    &client,
                    player_id,
                    args.offer_item_ids.clone(),
                    args.request_item_ids.clone(),
                    request_tags.clone(),
                )
                .await;
                let jitter: i64 = rand::thread_rng().gen_range(-120..=120);
                let base = 20 * 60;
                next += std::time::Duration::from_secs((base as i64 + jitter).max(60) as u64);
                println!(
                    "[DEBUG] Sleeping for {} seconds",
                    (base as i64 + jitter).max(60)
                );
                tokio::time::sleep(next.saturating_duration_since(tokio::time::Instant::now()))
                    .await;
            }
        } else {
            println!("[DEBUG] Posting trade ad once (legacy)");
            post_once(
                &client,
                player_id,
                args.offer_item_ids.clone(),
                args.request_item_ids.clone(),
                request_tags.clone(),
            )
            .await;
        }
    }

    println!("[DEBUG] Finished main()");
    Ok(())
}
