# 14 — Accounts and Setup Notes

Status of the project accounts and setup notes to use on the laptop. **No passwords or connection strings here** — those live in Bitwarden only.

## Accounts
| Account | Status | Notes |
|---|---|---|
| Project email `carefusionai59@gmail.com` | ✅ Created (2026-10-14) | Turn on 2-Step Verification; keep backup codes in Bitwarden |
| GitHub | ✅ Created | Username **CarefusionAI**, signed up with **carefusion1234@gmail.com** (not the project email). Repo **`CarefusionAI/Carefusion-AI`** (should be private and empty). 2FA on |
| Neon | ✅ Project created (2026-10-16) | Project `carefusion-alpha`; Postgres only. **Confirm region = AWS Singapore and Postgres 16** (default was Ohio). Connection string saved in Bitwarden |
| Cloudflare (R2) | ⏳ Optional now | Needed at W9 |
| Vercel | ⏳ Optional now | Sign in with GitHub; Hobby plan; needed at W9 |
| Oracle Cloud | ⏳ Signup can be done early | Home region Mumbai or Hyderabad (cannot change later); ₹1 billing alert; create the server from the laptop (needs SSH key) |
| Bitwarden | ⏳ Suggested | Stores all logins, backup codes, connection strings |

## Laptop setup (done 2026-10-16 evening, Antigravity → WSL: Ubuntu-26.04)
- ✅ `~/projects` created (`/home/athun/projects`). Do NOT create the project folder by hand — `git clone` creates it.
- ✅ Git config (uses the GitHub account email):
```
git config --global user.name "Athun Sujith"
git config --global user.email "carefusion1234@gmail.com"
git config --global init.defaultBranch main
```
- ✅ SSH key added to GitHub; `ssh -T git@github.com` → "Hi CarefusionAI! You've successfully authenticated".
- Clone:
```
cd ~/projects
git clone git@github.com:CarefusionAI/Carefusion-AI.git
cd Carefusion-AI
```
Project folder on the laptop: `/home/athun/projects/Carefusion-AI`. Open it in Antigravity via File → Open Folder (while connected to WSL).

## Neon's suggested setup prompt (saved 2026-10-16, for reference at W9)
Shown by Neon after creating the project. Saved at the user's request. IDs below are not secret.

```
Set up this app on Neon.
1. `npm i -g neon@latest`. If that fails, use `npx neon@latest` in place of `neon`.
   If a neon command opens a browser sign-in, tell me to finish it there. If that times out or fails, ask me to run `neon login`, then retry.
2. In the project root:
   neon init -y --org-id org-lively-darkness-33721982 --project-id withered-recipe-45379614 --branch production --services postgres
3. `neon deploy`. It provisions the services in neon.ts and pulls their env vars into `.env.local` (or `.env` if it exists).
4. Wire each service into the app's code using those env vars. Consult the installed Neon agent skills for best practices, e.g., what database driver to use given the app architecture and hosting runtime.
5. Prove it works: `npm run build` must pass, then start the app, each wired service must be tested to prove it works end to end.
6. Report what changed, the command output that proves step 5, and anything that failed.
```

**Claude's note:** this prompt is Neon's generic flow (`neon init` / `neon.ts`). Our plan differs: tables come from the `carefusion-db` SQL migrations, and the app reads one `DATABASE_URL` from `.env` (see 12_DOCKER_AND_ENVIRONMENTS.md). At W9, decide whether to use the Neon CLI at all; the org id and project id above are still useful for it. Development until W9 uses PostgreSQL in Docker on the laptop, not Neon.
