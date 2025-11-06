// cookie.rs: Handles Chrome cookie DB resolution, extraction, and decryption for roli_verification.
// Note: Cookie extraction functionality preserved but not actively used in Tauri GUI version.
// Users provide the cookie directly through the UI.

use aes_gcm::aead::{Aead, KeyInit};
use anyhow::Result;
use base64::engine::general_purpose::STANDARD as b64;
use base64::Engine as _;
use rusqlite::{types::ValueRef, Connection};
use std::fs;
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;

#[cfg(windows)]
use windows::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB;

pub fn get_chrome_user_data_dir() -> PathBuf {
    let local = std::env::var("LOCALAPPDATA").expect("LOCALAPPDATA missing");
    PathBuf::from(local).join("Google\\Chrome\\User Data")
}

pub fn resolve_cookies_db(user_data_dir: &PathBuf, cli_path: &Option<PathBuf>) -> Result<PathBuf> {
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
    if let Some(p) = try_profile(user_data_dir) {
        return Ok(p);
    }
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

pub fn extract_roli_verification_from_chrome(
    user_data_dir: &PathBuf,
    cookies_db: &PathBuf,
) -> Result<Option<String>> {
    let local_state = user_data_dir.join("Local State");
    let aes_key = get_aes_key_from_local_state(&local_state)?;
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
        let (name, blob, _host): (String, Vec<u8>, String) = r?;
        // Check for both possible cookie names: _RoliVerification and roli_verification
        if name == "_RoliVerification" || name == "roli_verification" {
            let val = decrypt_chrome_cookie(&blob, &aes_key)?;
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
        .ok_or_else(|| anyhow::anyhow!("missing encrypted_key in Local State"))?;
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
        use aes_gcm::{Aes256Gcm, Key, Nonce};
        let key = Key::<Aes256Gcm>::clone_from_slice(aes_key);
        let cipher = Aes256Gcm::new(&key);
        let nonce_ga = Nonce::clone_from_slice(nonce);
        let plaintext = cipher
            .decrypt(&nonce_ga, ciphertext_and_tag)
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
        let mut in_blob = CRYPT_INTEGER_BLOB {
            cbData: encrypted.len() as u32,
            pbData: encrypted.as_ptr() as *mut u8,
        };
        let mut out_blob = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let mut _descr: PWSTR = PWSTR::null();
        let res = CryptUnprotectData(&mut in_blob, None, None, None, None, 0, &mut out_blob);
        if res.as_bool() {
            let slice = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize);
            Ok(slice.to_vec())
        } else {
            Err(anyhow::anyhow!("CryptUnprotectData failed"))
        }
    }
}

pub fn mask_token(t: &str) -> String {
    if t.len() <= 8 {
        "****".to_string()
    } else {
        format!("{}...{}", &t[..4], &t[t.len() - 4..])
    }
}
