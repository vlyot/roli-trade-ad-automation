// ads_runner.rs
// Manage background ad posting tasks (start/stop/list running ads).

use anyhow::Result;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
use tauri::{Emitter, Window};
use tokio::sync::oneshot;

// map: ad_id -> (cancellation sender, runner_unique_id)
static RUNNERS: Lazy<Mutex<HashMap<String, (oneshot::Sender<()>, u64)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// global counter for assigning unique ids to spawned runners
static RUNNER_COUNTER: Lazy<AtomicU64> = Lazy::new(|| AtomicU64::new(1));

// track successful post counts per ad id
static POST_COUNTS: Lazy<Mutex<HashMap<String, u64>>> = Lazy::new(|| Mutex::new(HashMap::new()));

pub fn list_running_ads() -> Result<Vec<String>> {
    let guard = RUNNERS.lock().unwrap();
    Ok(guard.keys().cloned().collect())
}

pub fn stop_ad(id: &str) -> Result<()> {
    let mut guard = RUNNERS.lock().unwrap();
    if let Some((tx, _)) = guard.remove(id) {
        // send cancellation; ignore send errors
        let _ = tx.send(());
    }
    Ok(())
}

pub fn start_ad(
    ad: crate::ads_storage::AdData,
    window: Window,
    interval_override: Option<u64>,
) -> Result<()> {
    // Reserve and check under lock to avoid races where two callers both spawn runners
    let (tx, rx) = oneshot::channel::<()>();
    let my_id = RUNNER_COUNTER.fetch_add(1, Ordering::SeqCst);

    {
        let mut guard = RUNNERS.lock().unwrap();
        if guard.contains_key(&ad.id) {
            // another runner already present for this ad
            return Ok(());
        }
        // reserve the slot with our sender and unique id before spawning
        guard.insert(ad.id.clone(), (tx, my_id));
    }

    // Determine effective interval (in minutes): prefer the override, then the ad's stored value (if non-zero).
    // If neither is set, we'll stop the runner when that is detected in the loop (rather than silently defaulting).
    let effective_interval: Option<u64> = match interval_override {
        Some(v) => Some(v),
        None => {
            if ad.interval_minutes != 0 {
                Some(ad.interval_minutes as u64)
            } else {
                None
            }
        }
    };

    // spawn a tokio task to post immediately and then sleep repeatedly until cancelled
    let ad_clone = ad.clone();
    let win = window.clone();
    tauri::async_runtime::spawn(async move {
        // rx receives cancellation signal
        let mut cancel_rx = rx;
        loop {
            // perform post now and choose next wait time based on success
            let next_wait_mins: u64;
            if let Some(roli) = ad_clone.roli_verification.clone() {
                if roli.trim().is_empty() {
                    eprintln!(
                        "ads_runner: ad {} has empty roli_verification, skipping post",
                        ad_clone.id
                    );
                    next_wait_mins = effective_interval.unwrap_or(20);
                    let _ = win.emit("ad:posted", serde_json::json!({ "id": ad_clone.id, "count": 0, "message": "trade ad post skipped (no roli_verification)", "next_wait_mins": next_wait_mins }));
                } else {
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
                            // Use the effective_interval directly - it's been validated by lib.rs before reaching here.
                            // If for some reason it's None, emit an error and stop the runner.
                            match effective_interval {
                                Some(v) => {
                                    next_wait_mins = v;
                                    let _ = win.emit("ad:posted", serde_json::json!({ "id": ad_clone.id, "count": cnt, "message": user_msg, "next_wait_mins": next_wait_mins }));
                                }
                                None => {
                                    eprintln!("ads_runner: ad {} has no valid interval set, stopping runner", ad_clone.id);
                                    let _ = win.emit(
                                        "ad:posted",
                                        serde_json::json!({
                                            "id": ad_clone.id,
                                            "count": 0,
                                            "message": "ad stopped (no valid interval configured)",
                                            "error_kind": "config"
                                        }),
                                    );
                                    break;
                                }
                            }
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

                            // Use effective_interval instead of hardcoded 20 minutes for retry
                            next_wait_mins = effective_interval.unwrap_or(20);

                            if is_verification {
                                let _ = win.emit("ad:posted", serde_json::json!({ "id": ad_clone.id, "count": 0, "message": "trade ad post failed (verification_required)", "error_kind": "verification", "reason": err_str, "error_code": error_code, "next_wait_mins": next_wait_mins }));
                            } else {
                                // Use a different message prefix for non-verification failures so older frontends
                                // that look for messages starting with "trade ad post failed" don't treat these
                                // as verification prompts. Include structured fields for diagnostics.
                                let _ = win.emit("ad:posted", serde_json::json!({ "id": ad_clone.id, "count": 0, "message": format!("trade ad post error: {}", err_str), "error_kind": "other", "reason": err_str, "error_code": error_code, "next_wait_mins": next_wait_mins }));
                            }
                        }
                    }
                }
            } else {
                eprintln!(
                    "ads_runner: ad {} missing roli_verification, skipping post",
                    ad_clone.id
                );
                // Use effective_interval instead of hardcoded 20 minutes
                next_wait_mins = effective_interval.unwrap_or(20);
                let _ = win.emit("ad:posted", serde_json::json!({ "id": ad_clone.id, "count": 0, "message": "trade ad post skipped (no roli_verification)", "next_wait_mins": next_wait_mins }));
            }

            // wait for next_wait_mins or cancellation
            let sleep = tokio::time::sleep(std::time::Duration::from_secs(next_wait_mins * 60));
            tokio::select! {
                _ = &mut cancel_rx => break,
                _ = sleep => continue,
            }
        }

        // task is exiting — remove our runner entry only if it's still our id (avoid removing a newer runner)
        {
            let mut guard = RUNNERS.lock().unwrap();
            if let Some((_, id)) = guard.get(&ad_clone.id) {
                if *id == my_id {
                    guard.remove(&ad_clone.id);
                }
            }
        }

        eprintln!("ads_runner: task for ad {} exiting", ad_clone.id);
    });

    Ok(())
}
