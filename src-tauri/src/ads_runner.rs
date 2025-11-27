// ads_runner.rs
// Manage background ad posting tasks (start/stop/list running ads).

use anyhow::Result;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{Emitter, Window};
use tokio::sync::oneshot;

// map: ad_id -> cancellation sender
static RUNNERS: Lazy<Mutex<HashMap<String, oneshot::Sender<()>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// track successful post counts per ad id
static POST_COUNTS: Lazy<Mutex<HashMap<String, u64>>> = Lazy::new(|| Mutex::new(HashMap::new()));

pub fn list_running_ads() -> Result<Vec<String>> {
    let guard = RUNNERS.lock().unwrap();
    Ok(guard.keys().cloned().collect())
}

pub fn stop_ad(id: &str) -> Result<()> {
    let mut guard = RUNNERS.lock().unwrap();
    if let Some(tx) = guard.remove(id) {
        let _ = tx.send(());
    }
    Ok(())
}

pub fn start_ad(ad: crate::ads_storage::AdData, window: Window) -> Result<()> {
    // if already running, return
    {
        let guard = RUNNERS.lock().unwrap();
        if guard.contains_key(&ad.id) {
            return Ok(());
        }
    }

    // enforce minimum interval to avoid spamming; interval is in minutes
    // allow 0 to mean "inherit global interval"; only reject non-zero intervals below 15
    if ad.interval_minutes != 0 && ad.interval_minutes < 15 {
        return Err(anyhow::anyhow!(
            "Interval must be at least 15 minutes or 0 to inherit global interval"
        ));
    }

    let (tx, rx) = oneshot::channel::<()>();

    // spawn a tokio task to post immediately and then sleep repeatedly until cancelled
    let ad_clone = ad.clone();
    let win = window.clone();
    // Use Tauri's async runtime to ensure a runtime is available when invoked from the Tauri command context
    tauri::async_runtime::spawn(async move {
        let mut cancel = rx;
        loop {
            // perform post now and choose next wait time based on success
            let next_wait_mins: u64;
            if let Some(roli) = ad_clone.roli_verification.clone() {
                match crate::trade_ad::post_trade_ad_direct(
                    &roli,
                    ad_clone.player_id,
                    ad_clone
                        .offer_item_ids
                        .clone()
                        .into_iter()
                        .map(|v| v as u64)
                        .collect(),
                    ad_clone
                        .request_item_ids
                        .clone()
                        .into_iter()
                        .map(|v| v as u64)
                        .collect(),
                    ad_clone.request_tags.clone(),
                )
                .await
                {
                    Ok(_msg) => {
                        // increment count and emit an event to the frontend with the count
                        let mut pc = POST_COUNTS.lock().unwrap();
                        let entry = pc.entry(ad_clone.id.clone()).or_insert(0);
                        *entry += 1;
                        let cnt = *entry;
                        // build a clean message as requested by UI (lowercase, short)
                        let user_msg = if cnt <= 1 {
                            "trade ad post success".to_string()
                        } else {
                            format!("trade ad post success ({})", cnt)
                        };
                        let _ = win.emit("ad:posted", serde_json::json!({ "id": ad_clone.id, "count": cnt, "message": user_msg }));
                        // normal interval
                        next_wait_mins = std::cmp::max(1, ad_clone.interval_minutes as u64);
                    }
                    Err(err) => {
                        let err_str = err.to_string();
                        eprintln!("ads_runner: ad {} failed to post: {}", ad_clone.id, err_str);
                        // classify verification-related failures so UI only prompts when appropriate
                        let is_verification = err_str.starts_with("verification_required")
                            || err_str.to_lowercase().contains("verification");

                        // Attempt to parse a JSON error payload to extract any API error code for richer events
                        let mut error_code: Option<u64> = None;
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&err_str) {
                            if let Some(code_val) = v.get("code") {
                                if code_val.is_u64() {
                                    error_code = code_val.as_u64();
                                } else if code_val.is_i64() {
                                    error_code = Some(code_val.as_i64().unwrap() as u64);
                                }
                            }
                        }

                        if is_verification {
                            let _ = win.emit("ad:posted", serde_json::json!({ "id": ad_clone.id, "count": 0, "message": "trade ad post failed (verification_required)", "error_kind": "verification", "reason": err_str, "error_code": error_code }));
                        } else {
                            // Use a different message prefix for non-verification failures so older frontends
                            // that look for messages starting with "trade ad post failed" don't treat these
                            // as verification prompts. Include structured fields for diagnostics.
                            let _ = win.emit("ad:posted", serde_json::json!({ "id": ad_clone.id, "count": 0, "message": format!("trade ad post error: {}", err_str), "error_kind": "other", "reason": err_str, "error_code": error_code }));
                        }
                        // if immediate post fails, wait 20 minutes before retrying
                        next_wait_mins = 20;
                    }
                }
            } else {
                eprintln!(
                    "ads_runner: ad {} missing roli_verification, skipping post",
                    ad_clone.id
                );
                let _ = win.emit("ad:posted", serde_json::json!({ "id": ad_clone.id, "count": 0, "message": "trade ad post skipped (no roli_verification)" }));
                next_wait_mins = 20;
            }

            // wait for next_wait_mins or cancellation
            let sleep = tokio::time::sleep(std::time::Duration::from_secs(next_wait_mins * 60));
            tokio::select! {
                _ = &mut cancel => break,
                _ = sleep => continue,
            }
        }
        eprintln!("ads_runner: task for ad {} exiting", ad_clone.id);
    });

    // store cancellation sender
    let mut guard = RUNNERS.lock().unwrap();
    guard.insert(ad.id.clone(), tx);
    Ok(())
}
