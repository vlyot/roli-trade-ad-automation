
# README.md


## roli-trade-ad-automation (Windows 11 + Chrome)
A small Rust CLI that **extracts your `roli_verification` cookie from Chrome** (Windows user profile) and **posts a trade ad on Rolimons** using the `roli` crate. It can run **once** or in a **loop** (about every 20 minutes with jitter).

This application was created for users to post trade ads even without joining a game, so they can play games while posting trade ads. Also intended to use less resources using a Rust app over a Roblox instance.

- Inspired by the Roblox experience "Post Rolimon Trade Ads While AFK" by colinisntanerd: https://www.roblox.com/games/14090982817/Post-Rolimon-Trade-Ads-While-AFK  
- Author profile: https://www.roblox.com/users/4830584701/profile

This project is an independent tool and is not affiliated with Roblox or the original game/author.

> ⚠️ **Only use with your own account.** Cookies are secrets. Keep them safe and respect the site’s Terms of Service.


---



## Features
- User copies their Roli_Verification cookie from rolimons
- 📢 Posts a trade ad via a direct API call (browser-mimic mode, default) or the legacy `roli` crate (with `--legacy`).
- ⏱️ Two modes:
	- **One‑shot**: post once and exit.
	- **Loop mode**: keep running, post roughly every **20 minutes** (±2‑min jitter) to look less “botty”.
- 🧑‍💻 **Direct mode**: Default. Posts exactly like a browser for maximum compatibility.
- 🏛️ **Legacy mode**: Use `--legacy` to use the old `roli` crate (for troubleshooting only).
- 🖥️ CLI prompts for cookie if not found, or accepts it via `--roli-verification` for scripting.

---



## How it works (high level)
1. **Extract key**: Reads `Local State` → `os_crypt.encrypted_key` (Base64) → unwrap with DPAPI.
2. **Read Cookies**: Copies Chrome’s `Cookies` SQLite file to temp (avoid locks).
3. **Decrypt cookie values**:
	- For `v10`/`v11` format: AES‑GCM with the key from step 1.
	- Else: legacy DPAPI‑encrypted cookie value.
4. **Get `_RoliVerification`**: Use the extracted cookie, prompt, or CLI arg.
5. **Post ad**:
	- **Default**: Direct API call (browser-mimic, robust against site changes).
	- **Legacy mode**: Use `--legacy` to post via the old `roli` crate (may break if the API changes).


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
roli-trade-ad-automation --player-id <ID> --offer-item-ids <ID> ... [--request-item-ids <ID> ...] [--request-tags <TAG> ...] [--chrome-user-data <PATH>] [--loop-mode] [--legacy] [--roli-verification <COOKIE>]

FLAGS & ARGS:
--player-id <u64>            Your Roblox player ID (Rolimons profile ID)
--offer-item-ids <u64>...    One or more item IDs you are offering (repeat flag)
--request-item-ids <u64>...  Optional: item IDs you request (repeat flag)
--request-tags <TAG>...      Optional: tags to request. One or more of:
							any, demand, rares, robux, upgrade, downgrade, rap, wishlist, projecteds, adds
--chrome-user-data <PATH>    Optional: Chrome user data dir (defaults to `%LOCALAPPDATA%/Google/Chrome/User Data`)
--loop-mode                  Optional: run continuously and post every ~20 minutes (+/- 2 minutes)
--legacy                     Optional: use legacy roli crate mode (not recommended)
--roli-verification <COOKIE> Optional: provide the cookie directly (bypasses Chrome extraction)
```


> At least **one** `--offer-item-ids` is required, and **at least one** of `--request-item-ids` or `--request-tags` must be provided.


---



## Examples
**One‑shot** (single item, request any):
```bash
cargo run --release -- --player-id 1426170901 --offer-item-ids 10467173753 --request-tags any
```


**Legacy mode (use old roli crate, not recommended):**
```bash
cargo run --release -- --player-id 1426170901 --offer-item-ids 10467173753 --request-tags any --legacy
```

**Loop mode (post every ~20 min):**
```bash
cargo run --release -- --player-id 1426170901 --offer-item-ids 10467173753 --request-tags any --loop-mode
```

**Provide cookie directly (for scripting):**
```bash
cargo run --release -- --player-id 1426170901 --offer-item-ids 10467173753 --request-tags any --roli-verification <cookie>
```

---

## Timeline / Roadmap

- [x] **Manual trade ad posting** (current)
- [x] **Direct API mode** (browser-mimic, robust against site changes)
- [ ] **GUI interface**
- [ ] **Automatic trade ad posting every n minutes** (n is variable and determined by user, minimum 15)
- [ ] **Login as specific user** (planned):
	- Authenticate as a user, fetch inventory directly from Rolimons/Roblox
	- Select items from your inventory directly
	- No need to manually enter item IDs
	- No need to manually enter roli_verification
- [ ] **Search for items using NLP instead of item ids**
- [ ] **Better error messages and diagnostics**
- [ ] **Cross-platform support** (Linux/Mac)