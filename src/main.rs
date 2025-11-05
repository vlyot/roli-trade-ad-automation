use std::fs;
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;

use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit};
use anyhow::{Context, Result};
use base64::engine::general_purpose::STANDARD as b64;
use base64::Engine as _;
use clap::Parser;
use rand::Rng;
use roli::{trade_ads, ClientBuilder};
use rusqlite::{types::ValueRef, Connection};

#[cfg(windows)]
use windows::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB;

/// CLI flags
#[derive(clap::Parser, Debug)]
struct Args {
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

    /// Chrome user-data dir OR a profile dir
    #[arg(long)]
    chrome_user_data: Option<std::path::PathBuf>,

    /// Direct path to the Cookies DB
    #[arg(long)]
    cookies_path: Option<std::path::PathBuf>,

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

    println!("[DEBUG] Resolving Chrome user data directory");
    let user_data_dir = args
        .chrome_user_data
        .clone()
        .unwrap_or_else(get_chrome_user_data_dir);
    println!("[DEBUG] user_data_dir: {}", user_data_dir.display());

    println!("[DEBUG] Resolving cookies DB path");
    let cookies_db = match resolve_cookies_db(&user_data_dir, &args.cookies_path) {
        Ok(path) => {
            println!("[DEBUG] cookies_db: {}", path.display());
            path
        }
        Err(e) => {
            eprintln!("[ERROR] Failed to resolve cookies DB: {e}");
            return Err(e);
        }
    };

    let token = if let Some(cookie) = &args.roli_verification {
        println!("[DEBUG] Using roli_verification from CLI");
        cookie.clone()
    } else {
        println!("[DEBUG] Extracting roli_verification cookie");
        match extract_roli_verification_from_chrome(&user_data_dir, &cookies_db) {
            Ok(Some(cookie)) => {
                println!("[DEBUG] roli_verification: {}", mask_token(&cookie));
                cookie
            }
            _ => {
                // Prompt user for input interactively
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
            }
        }
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

    println!("[DEBUG] Building roli client");
    let client = ClientBuilder::new().set_roli_verification(token).build();

    println!("[DEBUG] Mapping request tags");
    let map_tag = |s: &str| match s {
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
        other => panic!("Invalid request tag: {other}"),
    };
    let request_tags = args
        .request_tags
        .iter()
        .map(|t| map_tag(&t.to_lowercase()))
        .collect::<Vec<_>>();
    println!("[DEBUG] request_tags mapped: {:?}", request_tags);

    if args.loop_mode {
        println!("[DEBUG] Entering loop mode");
        let mut next = tokio::time::Instant::now();
        loop {
            println!("[DEBUG] Posting trade ad in loop");
            post_once(&client, player_id, &args, &request_tags).await;
            let jitter: i64 = rand::thread_rng().gen_range(-120..=120);
            let base = 20 * 60;
            next += std::time::Duration::from_secs((base as i64 + jitter).max(60) as u64);
            println!(
                "[DEBUG] Sleeping for {} seconds",
                (base as i64 + jitter).max(60)
            );
            tokio::time::sleep(next.saturating_duration_since(tokio::time::Instant::now())).await;
        }
    } else {
        println!("[DEBUG] Posting trade ad once");
        post_once(&client, player_id, &args, &request_tags).await;
    }

    println!("[DEBUG] Finished main()");
    Ok(())
}

async fn post_once(
    client: &roli::Client,
    player_id: u64,
    args: &Args,
    request_tags: &Vec<trade_ads::RequestTag>,
) {
    println!("[DEBUG] Preparing CreateTradeAdParams");
    let params = trade_ads::CreateTradeAdParams {
        player_id,
        offer_item_ids: args.offer_item_ids.clone(),
        request_item_ids: args.request_item_ids.clone(),
        request_tags: request_tags.clone(),
    };
    println!("[DEBUG] Params: {:?}", params);
    // [DEBUG] Token already logged in main before building client
    match client.create_trade_ad(params).await {
        Ok(_) => println!(
            "[DEBUG] Trade ad posted! Visible at https://www.rolimons.com/playertrades/{}",
            player_id
        ),
        Err(e) => eprintln!("[ERROR] CreateTradeAd failed: {e}"),
    }
}

fn mask_token(t: &str) -> String {
    if t.len() <= 8 {
        "****".to_string()
    } else {
        format!("{}...{}", &t[..4], &t[t.len() - 4..])
    }
}

/// Returns Chrome User Data root by default (not a specific profile)
fn get_chrome_user_data_dir() -> PathBuf {
    let local = std::env::var("LOCALAPPDATA").expect("LOCALAPPDATA missing");
    PathBuf::from(local).join("Google\\Chrome\\User Data")
}

/// Resolve the actual Cookies DB.
/// Order:
/// 1) --cookies-path if provided
/// 2) If user_data_dir itself is a profile (has Cookies or Network/Cookies), use it
/// 3) Otherwise, treat user_data_dir as "User Data" root and try Default, Profile 1..n
fn resolve_cookies_db(user_data_dir: &PathBuf, cli_path: &Option<PathBuf>) -> Result<PathBuf> {
    if let Some(p) = cli_path {
        if p.exists() {
            return Ok(p.clone());
        } else {
            anyhow::bail!("--cookies-path not found at {}", p.display());
        }
    }

    let try_profile = |p: &PathBuf| -> Option<PathBuf> {
        let c2 = p.join("Network").join("Cookies");
        if c2.exists() {
            return Some(c2);
        }
        let c1 = p.join("Cookies");
        if c1.exists() {
            return Some(c1);
        }
        None
    };

    // If user_data_dir itself looks like a profile:
    if let Some(p) = try_profile(user_data_dir) {
        return Ok(p);
    }

    // Common profile names
    let candidates = [
        user_data_dir.join("Default"),
        user_data_dir.join("Profile 1"),
        user_data_dir.join("Profile 2"),
        user_data_dir.join("Profile 3"),
        user_data_dir.join("Guest Profile"),
        user_data_dir.join("System Profile"),
    ];
    for prof in candidates {
        if let Some(p) = try_profile(&prof) {
            return Ok(p);
        }
    }

    // As fallback: scan all dirs under User Data matching "Default" or "Profile X"
    if let Ok(rd) = fs::read_dir(user_data_dir) {
        for entry in rd.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
                if name == "Default" || name.starts_with("Profile ") {
                    if let Some(p) = try_profile(&path) {
                        return Ok(p);
                    }
                }
            }
        }
    }

    anyhow::bail!(
        "Cookies DB not found under {}. Try --cookies-path \"%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Network\\Cookies\"",
        user_data_dir.display()
    );
}

/// Extracts roli_verification cookie value from the specified DB
fn extract_roli_verification_from_chrome(
    user_data_dir: &PathBuf,
    cookies_db: &PathBuf,
) -> Result<Option<String>> {
    // AES key from Local State
    let local_state = user_data_dir.join("Local State");
    let aes_key = get_aes_key_from_local_state(&local_state)?;

    // copy DB to temp to avoid locks, retry on os error 32 (file in use)
    let tmp = std::env::temp_dir().join("Cookies_tmp.sqlite");
    const MAX_RETRIES: u32 = 10;
    const RETRY_DELAY_MS: u64 = 300;
    let mut last_err = None;
    for _ in 0..MAX_RETRIES {
        match fs::copy(cookies_db, &tmp) {
            Ok(_) => {
                last_err = None;
                break;
            }
            Err(e) => {
                // os error 32: file is being used by another process
                if let Some(32) = e.raw_os_error() {
                    last_err = Some(e);
                    std::thread::sleep(std::time::Duration::from_millis(RETRY_DELAY_MS));
                    continue;
                } else {
                    return Err(e.into());
                }
            }
        }
    }
    if let Some(e) = last_err {
        return Err(anyhow::anyhow!(
            "Failed to copy cookies DB after retries: {e}"
        ));
    }
    let conn = Connection::open(&tmp)?;

    let mut stmt = conn.prepare(
        "SELECT name, encrypted_value, host_key FROM cookies WHERE host_key LIKE '%rolimons%'",
    )?;
    let rows = stmt.query_map([], |row| {
        let name: String = row.get(0)?;
        let val: ValueRef = row.get_ref(1)?;
        let blob: Vec<u8> = match val {
            ValueRef::Blob(b) => b.to_vec(),
            _ => vec![],
        };
        let host: String = row.get(2)?;
        Ok((name, blob, host))
    })?;

    for r in rows {
        let (name, blob, host): (String, Vec<u8>, String) = r?;
        if name == "roli_verification" {
            let val = decrypt_chrome_cookie(&blob, &aes_key)?;
            println!("[DEBUG] found cookie @ {} -> {}", host, mask_token(&val));
            return Ok(Some(val));
        }
    }
    Ok(None)
}

fn get_aes_key_from_local_state(local_state_path: &PathBuf) -> Result<Vec<u8>> {
    let mut s = String::new();
    File::open(local_state_path)?.read_to_string(&mut s)?;
    let v: serde_json::Value = serde_json::from_str(&s)?;
    let enc_key_b64 = v["os_crypt"]["encrypted_key"]
        .as_str()
        .context("missing encrypted_key in Local State")?;
    let mut enc_key = b64.decode(enc_key_b64)?;
    if enc_key.starts_with(b"DPAPI") {
        enc_key = enc_key.split_off(5);
    }
    decrypt_dpapi(&enc_key)
}

fn decrypt_chrome_cookie(encrypted_value: &[u8], aes_key: &[u8]) -> Result<String> {
    if encrypted_value.starts_with(b"v10") || encrypted_value.starts_with(b"v11") {
        let nonce = &encrypted_value[3..15];
        let ciphertext_and_tag = &encrypted_value[15..];
        let key = aes_gcm::Key::<Aes256Gcm>::from_slice(aes_key);
        let cipher = Aes256Gcm::new(key);
        let nonce_ga = aes_gcm::Nonce::from_slice(nonce);
        let plaintext = cipher
            .decrypt(nonce_ga, ciphertext_and_tag)
            .map_err(|e| anyhow::anyhow!("AES-GCM decrypt failed: {:?}", e))?;
        Ok(String::from_utf8_lossy(&plaintext).into())
    } else {
        let decrypted = decrypt_dpapi(encrypted_value)?;
        Ok(String::from_utf8_lossy(&decrypted).into())
    }
}

use windows::core::PWSTR;
use windows::Win32::Security::Cryptography::CryptUnprotectData;

fn decrypt_dpapi(encrypted: &[u8]) -> anyhow::Result<Vec<u8>> {
    unsafe {
        // in/out blobs
        let mut in_blob = CRYPT_INTEGER_BLOB {
            cbData: encrypted.len() as u32,
            pbData: encrypted.as_ptr() as *mut u8,
        };
        let mut out_blob = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };

        // If you want the description string back, you can provide a PWSTR here.
        // It's optional, so None is fine.
        let mut _descr: PWSTR = PWSTR::null();

        let res = CryptUnprotectData(
            &mut in_blob,  // pDataIn
            None,          // ppszDataDescr (Some(&mut _descr) also works)
            None,          // pOptionalEntropy
            None,          // pvReserved (THIS must be Option<*const c_void> -> use None)
            None,          // pPromptStruct
            0,             // dwFlags
            &mut out_blob, // pDataOut
        );

        if res.as_bool() {
            let slice = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize);
            Ok(slice.to_vec())
        } else {
            Err(anyhow::anyhow!("CryptUnprotectData failed"))
        }
    }
}
