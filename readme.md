# roli-trade-ad-automation (Windows 11 + Chrome)

This application was created for users to post trade ads even without joining a game, so they can play games while posting trade ads. Also intended to use less resources using a Rust app over a Roblox instance.

- Inspired by the Roblox experience "Post Rolimon Trade Ads While AFK" by colinisntanerd: https://www.roblox.com/games/14090982817/Post-Rolimon-Trade-Ads-While-AFK  
- Author profile: https://www.roblox.com/users/4830584701/profile

This project is an independent tool and is not affiliated with Roblox or the original game/author.

> ⚠️ **Only use with your own account.** Cookies are secrets. Keep them safe and respect the site’s Terms of Service.


---



## How it works 
1. user verifies roblox account through about
2. user posts trade ad


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

## Timeline / Roadmap

- [x] **Manual trade ad posting** (CLI) (Depreciated)
- [x] **Direct API mode** 
- [x] **GUI interface** (Tauri + React )
- [x] **Automatic trade ad posting every n minutes** (n is variable and determined by user, minimum 15)
- [x] **Login as specific user** (implemented):
- [x] **Search for items using Abbreviation instead of item ids** 

- [ ] **Open to suggestions/improvements**