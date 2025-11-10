// ads_runner.rs
// Manage background ad posting tasks (start/stop/list running ads).

use anyhow::Result;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::oneshot;

// map: ad_id -> cancellation sender
static RUNNERS: Lazy<Mutex<HashMap<String, oneshot::Sender<()>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

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

pub fn start_ad(ad: crate::ads_storage::AdData) -> Result<()> {
    // if already running, return
    {
        let guard = RUNNERS.lock().unwrap();
        if guard.contains_key(&ad.id) {
            return Ok(());
        }
    }

    let (tx, rx) = oneshot::channel::<()>();

    // spawn a tokio task to post immediately and then sleep repeatedly until cancelled
    let ad_clone = ad.clone();
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
                    Ok(msg) => {
                        eprintln!(
                            "ads_runner: ad {} posted successfully: {}",
                            ad_clone.id, msg
                        );
                        // normal interval
                        next_wait_mins = std::cmp::max(1, ad_clone.interval_minutes as u64);
                    }
                    Err(err) => {
                        eprintln!("ads_runner: ad {} failed to post: {}", ad_clone.id, err);
                        // if immediate post fails, wait 20 minutes before retrying
                        next_wait_mins = 20;
                    }
                }
            } else {
                eprintln!(
                    "ads_runner: ad {} missing roli_verification, skipping post",
                    ad_clone.id
                );
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
