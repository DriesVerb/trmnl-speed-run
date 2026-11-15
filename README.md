# Speedrun Leaderboard (TRMNL Plugin)

TRMNL Private Plugin displaying live Speedrun.com full-game world records and top 3 runs in a Braun-inspired e-paper layout (`og_plus` and `v2`).

## Project Layout

- `src/settings.yml` — Plugin polling config and custom fields (`game`, `category`)
- `src/full.liquid` — Full-screen Liquid template (`template.liquid` links here)
- `src/transform.js` — TRMNL transform script (`transform.js` links here)
- `.trmnlp.yml` — Local preview configuration for `trmnlp serve`
- `.github/workflows/trmnl.yml` — CI workflow (`trmnlp lint` + `trmnlp push --force` on `main`)
- `server.js` / `webhook_manager.js` — Optional local Node preview & webhook helpers

## Connecting This Repo to GitHub + TRMNL Auto-Sync

1. **Set your numeric TRMNL Plugin ID in `src/settings.yml`:**
   - Open your **Speedrun Leaderboard** plugin on `trmnl.com` and find its numeric ID (from the page URL or exported `settings.yml`).
   - Uncomment `id:` in `src/settings.yml` and replace `123456` with your actual plugin ID, then commit that change. *(The GitHub Action checks for a numeric `id:` so it updates your existing plugin instead of creating duplicates.)*

2. **Create an empty GitHub repository and push `speed-run/`:**
   ```bash
   cd speed-run
   git remote add origin <YOUR_GITHUB_REPO_URL>
   git push -u origin main
   ```

3. **Add `TRMNL_API_KEY` in GitHub Secrets:**
   - In TRMNL: copy your **User API Key** from Account Settings.
   - In GitHub: go to **Settings → Secrets and variables → Actions → New repository secret**, name it `TRMNL_API_KEY`, and paste your User API Key.
