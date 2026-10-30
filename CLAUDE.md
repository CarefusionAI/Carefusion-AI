# CLAUDE.md — CareFusion AI (Government Edition)

This file is read automatically by Claude Code at the start of every session. Read it fully, then read the docs it points to before doing any work.

## What this project is
CareFusion AI is being extended from an academic research system (IEEE ICSCST 2026, Paper 1609) into a unified medical-affairs platform for Indian government health services (client: Ministry of Health and Family Welfare). Current goal: a **working alpha demo website on synthetic data** by about **14 February 2027** (core demo online by **12–13 December 2026**).

- **Builders:** Athun Sujith (user) + Claude. Weekends only, 2 sessions a day of about 5 hours.
- **Laptop:** Windows, 16 GB RAM, Docker Desktop with WSL 2 (Ubuntu). Project lives at `~/projects/Carefusion-AI` inside WSL. Editor: Antigravity, connected to WSL.
- **GitHub:** `CarefusionAI/Carefusion-AI` (private).

## Read first, in this order
1. `docs/04_DECISION_LOG.md` — the **source of truth** when docs disagree. Read the last few entries to know where we are.
2. `docs/13_DEMO_BUILD_PLAN.md` — the weekend-by-weekend plan. Find the current week (W1 = 17–18 Oct 2026).
3. `docs/14_ACCOUNTS_AND_SETUP_NOTES.md` — accounts and laptop setup status.
4. Then, as the task needs: `docs/01` (system overview), `02` (login/auth), `07` (citizen app), `08` (doctor app), `09` (staff/admin), `10` (tech stack), `11` (database design), `12` (Docker and environments).

## Agent delegation rules (always)
These rules are automatic — Claude applies them without being asked.

### Subagent limits
- **Max depth:** 5 (a subagent can spawn sub-subagents up to 5 levels deep).
- **Max concurrent subagents:** 10 at any time.

### Code writing → Sonnet 5.5, high effort
When writing, editing, or generating any code (application code, migrations, configs, scripts, tests), delegate to a **Sonnet 5.5** subagent at **high** effort. The main model plans and reviews; Sonnet writes.

### Saving session work → Haiku 5.5, high effort
At the end of every session (or after any significant milestone), automatically delegate to a **Haiku 5.5** subagent at **high** effort to:
- Summarise what was built, decided, or changed.
- Append an entry to `docs/04_DECISION_LOG.md` (per Rule 8 below).
- Create or update a session log at `docs/sessions/YYYY-MM-DD_SN.md` (S1 = morning, S2 = afternoon) with: date, goals, what was done, open items, files changed.

### Discovery & gap-filling → Explore agent
Before starting any non-trivial task, automatically spawn an **Explore** agent to:
- Locate relevant files, schemas, types, and prior decisions.
- Surface anything the main model's plan missed or assumed incorrectly.
- Report back so the plan can be corrected before code is written.

### Auto-documentation
All important findings, architectural notes, and research that come up during a session are saved as Markdown files under `docs/` with the next available number prefix (`15_TOPIC.md`, `16_TOPIC.md`, …) or under a topical sub-folder (`docs/sessions/`, `docs/notes/`) so they are easy to find later. This happens automatically — the user should never need to ask for it.

## Rules (always)
1. **Synthetic data only.** Never use or ask for real patient data. Demo identifiers look like `DEMO-0000-1234` and can never pass as real Aadhaar/ABHA numbers. Every screen shows a "SYNTHETIC DEMO DATA" banner.
2. **No raw Aadhaar anywhere.** Tokens only.
3. **AI is decision support only.** Never autonomous diagnosis. Keep VERIFIED / SUPPORTED_WITH_CAUTION / UNCERTAIN and disagreement reporting. In the alpha every AI output is **simulated** and labelled "simulated AI output"; never claim the paper's accuracy numbers for it. Citizens see an AI result only after a doctor has reviewed it.
4. **Government integrations are mock connectors** in the alpha (Aadhaar e-KYC, face check, ABHA, HPR, HFR, Jan Parichay, e-Sign, NOTTO, e-RaktKosh, SMS), using the same request/response shape as the real service. No real government logos or look-alike official login pages.
5. **Database:** SQL in `carefusion-db/migrations/` is the source of truth. Never edit an applied migration; add a new numbered file. `carefusion-db/tests/test_rules.sql` must pass. Prisma reads the schema with `prisma db pull`; do not use Prisma Migrate.
6. **Never break `main`.** Work on a branch, open a pull request, merge only when tests pass.
7. **No secrets in the repo.** Settings come from `.env` (never committed); `.env.example` has safe demo values.
8. **Log decisions.** At the end of any session where something is decided, built or rejected, append a short entry to `docs/04_DECISION_LOG.md` (date, topic, decision, reason, owner, next step, status). Never delete old entries; mark them SUPERSEDED.
9. **Don't assume.** If something is unclear, ask Athun before building.
10. **Style:** clear, simple English. Mark assumptions. End design answers with "Open questions".

## Stack (approved, see docs/10)
pnpm + Turborepo monorepo · `apps/web` React 18 + Vite + TypeScript + shadcn/ui + Tailwind · `apps/api` NestJS (Node 22) + Prisma · `apps/ai` FastAPI (Python 3.12, simulated outputs) · `packages/shared` shared types/Zod schemas · PostgreSQL 16 + PostGIS · Keycloak · Valkey · MinIO (laptop) / Cloudflare R2 (alpha) · Mailpit (laptop).

Alpha hosting (from W9): Vercel (web) + Oracle Always Free (api, ai, keycloak, valkey, caddy) + Neon (Postgres) + Cloudflare R2 (files).

## Repo layout (target)
```
CLAUDE.md                  this file
docs/                      project docs 00–14 (copied from the Claude project)
carefusion-db/             SQL migrations + rule tests (already written and tested)
apps/web  apps/api  apps/ai  packages/shared   (created in W1 Sat S2)
docker-compose.yml  .env.example               (created in W1)
```

## Where we are (update this line each session)
- 2026-10-30: W5 merged to `main` (PRs #3 and #4). **Live demo: https://carefusion-roan.vercel.app** (Vercel: static web app + API as one serverless function; Neon Postgres in Singapore; access-code gate on; deploy with `scripts/build-vercel.sh && cd .vercel-deploy && vercel deploy --prod`). Demo clock follows `DEMO_NOW`. **Next: switch on Cloudflare R2 (dashboard) and connect file storage (`MINIO_*`, `MINIO_REGION=auto`), then browser click-through of every role, API tests, CI.**
