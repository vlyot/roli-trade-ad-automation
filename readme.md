# roli-trade-ad-automation (Windows 11 + Chrome)

This application was created for users to post trade ads even without joining a game, so they can play games while posting trade ads. Also intended to use less resources using a Rust app over a Roblox instance.

- Inspired by the Roblox experience "Post Rolimon Trade Ads While AFK" by colinisntanerd: https://www.roblox.com/games/14090982817/Post-Rolimon-Trade-Ads-While-AFK  
- Author profile: https://www.roblox.com/users/4830584701/profile

This project is an independent tool and is not affiliated with Roblox or the original game/author.

> ⚠️ **Only use with your own account.** Cookies are secrets. Keep them safe and respect the site’s Terms of Service.


---



## Features
- User copies their Roli_Verification cookie from Rolimons (manual step)
- 📢 Posts a trade ad via a direct API call (browser-mimic mode, default) or the legacy `roli` crate (with `--legacy`).
- ⏱️ Two modes:
	- **One‑shot**: post once and exit.
	- **Loop mode**: keep running, post roughly every **20 minutes** (±2‑min jitter) to look less “botty”.
- 🧑‍💻 **Direct mode**: Default. Posts exactly like a browser for maximum compatibility.
- 🏛️ **Legacy mode**: Use `--legacy` to use the old `roli` crate (for troubleshooting only).
- 🖥️ CLI prompts for cookie if not found, or accepts it via `--roli-verification` for scripting.

---



## How it works (high level)
1. **User copies `_RoliVerification` cookie**: You must manually copy your cookie from your browser's dev tools (see Rolimons site, Application tab, Cookies section).
2. **Provide cookie to the tool**: Paste it when prompted, or pass it via `--roli-verification` for scripting/automation.
3. **Post trade ad**:
   - **Default (Direct API)**: Mimics a real browser request to the Rolimons API endpoint, including all necessary headers and cookies for maximum reliability and future-proofing.
   - **Legacy mode**: Uses the `roli` crate (may break if the API changes or if stricter anti-bot measures are introduced).


---


## Security notes
- The `_RoliVerification` cookie is a sensitive session token. **Never share, commit, or expose it.**
- The tool never uploads or transmits your cookie anywhere except directly to the Rolimons API endpoint you control.
- If your session expires or you log out, simply log in again in Chrome and rerun the tool.
- For best security, use the CLI prompt (not a plaintext file) and avoid storing the cookie in scripts or logs.
- This tool is not affiliated with Rolimons or Roblox. Use at your own risk and always comply with their Terms of Service.

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
cargo run --release -- --player-id -insert player id- --offer-item-ids -insert item id- --request-tags any
```


**Legacy mode (use old roli crate, not recommended):**
```bash
cargo run --release -- --player-id -insert player id- --offer-item-ids -insert item id- --request-tags any --legacy
```

**Loop mode (post every ~20 min):**
```bash
cargo run --release -- --player-id -insert player id- --offer-item-ids -insert item id- --request-tags any --loop-mode
```

**Provide cookie directly (for scripting):**
```bash
cargo run --release -- --player-id -insert player id- --offer-item-ids -insert item id- --request-tags any --roli-verification <cookie>
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
	- Uses 'https://create.roblox.com/docs/cloud/legacy/users/v1#/AccountInformation/get_v1_description' for login and verification
- [ ] **Search for items using NLP instead of item ids**