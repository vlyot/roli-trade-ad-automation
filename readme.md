
# README.md


## roli-trade-ad-automation (Windows 11 + Chrome)
A small Rust CLI that **extracts your `roli_verification` cookie from Chrome** (Windows user profile) and **posts a trade ad on Rolimons** using the `roli` crate. It can run **once** or in a **loop** (about every 20 minutes with jitter).


> ⚠️ **Only use with your own account.** Cookies are secrets. Keep them safe and respect the site’s Terms of Service.


---


## Features
- 🔑 Automatically locates Chrome’s **Local State** + **Cookies** DB for the *Default* profile (or a path you provide).
- 🔓 Decrypts Chrome’s cookie encryption (AES‑GCM key unwrapped via **Windows DPAPI**) and retrieves `roli_verification`.
- 📢 Posts a trade ad via `roli::Client::create_trade_ad`.
- ⏱️ Two modes:
- **One‑shot**: post once and exit.
- **Loop mode**: keep running, post roughly every **20 minutes** (±2‑min jitter) to look less “botty”.


---


## How it works (high level)
1. **Extract key**: Reads `Local State` → `os_crypt.encrypted_key` (Base64) → unwrap with DPAPI.
2. **Read Cookies**: Copies Chrome’s `Cookies` SQLite file to temp (avoid locks).
3. **Decrypt cookie values**:
- For `v10`/`v11` format: AES‑GCM with the key from step 1.
- Else: legacy DPAPI‑encrypted cookie value.
4. **Build `roli` client** with the `roli_verification` value.
5. **Post ad** with your `player_id`, offered item IDs, and either requested item IDs or tags.


---


## Security notes
- Runs as **your Windows user**; DPAPI decryption works only for that user.
- The `roli_verification` acts like a session token. **Do not commit logs or outputs that reveal it.**
- If tokens rotate/expire, just keep Chrome logged in (same profile) or re‑log in; the tool will pick up the new cookie on next run.


---


## Requirements
- **Windows 11**
- **Chrome** with an already logged‑in Rolimons session (in the target profile)
- **Rust** (stable) and Cargo


---


## Install / Build
```bash
# from project root
cargo build --release
```


---


## CLI usage
```
USAGE:
roli-trade-ad-automation --player-id <ID> --offer-item-ids <ID> ... [--request-item-ids <ID> ...] [--request-tags <TAG> ...] [--chrome-user-data <PATH>] [--loop-mode]


FLAGS & ARGS:
--player-id <u64> Your Roblox player ID (Rolimons profile ID)
--offer-item-ids <u64>... One or more item IDs you are offering (repeat flag)
--request-item-ids <u64>... Optional: item IDs you request (repeat flag)
--request-tags <TAG>... Optional: tags to request. One or more of:
any, demand, rares, robux, upgrade, downgrade, rap, wishlist, projecteds, adds
--chrome-user-data <PATH> Optional: Chrome user data dir (defaults to `%LOCALAPPDATA%/Google/Chrome/User Data`)
--loop-mode Optional: run continuously and post every ~20 minutes (+/- 2 minutes)
```


> At least **one** `--offer-item-ids` is required, and **at least one** of `--request-item-ids` or `--request-tags` must be provided.


---


## Examples
**One‑shot** (single item, request any):
```bash
cargo run --release -- --player-id 1426170901 --offer-item-ids 10467173753 --request-tags any
```