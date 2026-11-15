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

1. **Plugin ID in `src/settings.yml`:**
   - `id: 36fd8a30-5443-47f1-a8fc-a14c797fdbae` is configured in `src/settings.yml`. *(Note: if your TRMNL `Export` ZIP `settings.yml` or `/plugin_settings/<id>` URL uses a numeric ID instead, update `id:` to match before pushing to `main` so `trmnlp push` updates the existing plugin rather than creating a new one.)*

2. **Create an empty GitHub repository and push `speed-run/`:**
   ```bash
   cd speed-run
   git remote add origin <YOUR_GITHUB_REPO_URL>
   git push -u origin main
   ```

3. **Add `TRMNL_API_KEY` in GitHub Secrets:**
   - In TRMNL: copy your **User API Key** from Account Settings.
   - In GitHub: go to **Settings → Secrets and variables → Actions → New repository secret**, name it `TRMNL_API_KEY`, and paste your User API Key.
