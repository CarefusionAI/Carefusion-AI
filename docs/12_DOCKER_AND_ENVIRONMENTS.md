# 12 — Docker Images and Environments

> Written by Claude on 2026-10-11 at the user's request. Follows the approved stack (10) and database (11). **Status: PLAN** — the actual `docker-compose.yml` and Dockerfiles are written when the GitHub repo is ready.
> Exact image versions are **pinned when the setup files are written** (no `latest` tags), so every machine runs the same thing.

## 1. What Docker does for us
- Runs the whole system on a laptop with **one command** (`docker compose up`).
- Makes the laptop, the Oracle server and later the MeitY cloud run the **same images**.
- Nobody installs PostgreSQL, Keycloak, Python etc. by hand.

## 2. The three places the system runs
| Place | Data | What runs there |
|---|---|---|
| **Laptop (development)** | Synthetic | Everything, in Docker (section 4) |
| **Alpha online (demo for ICMR)** | Synthetic only | Website on **Vercel**; database on **Neon**; files on **Cloudflare R2**; the rest in Docker on the **Oracle Always Free** server (section 5) |
| **Production (later)** | Real | MeitY-empanelled cloud, Kubernetes (section 6) |

## 3. Images
### 3.1 Ready-made images (downloaded, not built)
| Image | Purpose | Laptop | Oracle (alpha) | Production |
|---|---|---|---|---|
| `postgis/postgis` (PostgreSQL 16 + PostGIS) | Main database | ✔ | — (Neon) | — (managed PostgreSQL) |
| `valkey/valkey` | Cache, 10-second rotating keys, OTPs, rate limits, job queue (BullMQ) | ✔ | ✔ | ✔ |
| `quay.io/keycloak/keycloak` | Login for all 10 user types, MFA, hardware keys, Jan Parichay link (mock in alpha) | ✔ | ✔ | ✔ |
| `minio/minio` | Stand-in for Cloudflare R2 / S3 (scans, VCF, PDFs) | ✔ | — (R2) | — (MeitY object storage) |
| `axllent/mailpit` | Catches all test emails and OTP messages — nothing real is sent | ✔ | — | — |
| `caddy` | Front door: HTTPS (free Let's Encrypt certificates), routes `/api` and `/auth` | — | ✔ | — (cloud load balancer) |

### 3.2 Our own images (Claude writes the Dockerfiles)
| Image | Base | Contains | Laptop | Oracle (alpha) | Production |
|---|---|---|---|---|---|
| `carefusion-api` | Node.js 22 LTS (slim) | NestJS platform API, Prisma client, BullMQ workers | ✔ | ✔ | ✔ |
| `carefusion-ai` | Python 3.12 (slim) | FastAPI AI service (simulated outputs in alpha; real models later) | ✔ | ✔ | ✔ |
| `carefusion-web` | Node.js 22 | React + Vite website (dev server) | ✔ | — (Vercel) | ✔ or CDN |
| `carefusion-db-migrate` | PostgreSQL client | One-off job: runs `carefusion-db/migrations` and the rule tests | ✔ | runs against Neon | ✔ |
| `carefusion-seed` *(later)* | Python + Synthea | One-off job: loads synthetic Indian demo data | ✔ | runs against Neon | never |

**Rules for our images:** run as a non-root user; no passwords inside images (they come from environment variables / secrets); health check in each; built for **both amd64 and arm64** (Oracle is ARM).

### 3.3 Later (production only)
| Image | Purpose |
|---|---|
| `hapiproject/hapi` | Full FHIR R4 server for ABDM sharing |
| `orthancteam/orthanc` | DICOM image server (X-ray/CT) |
| Prometheus, Grafana, Loki | Monitoring and logs |
| Sentry (self-hosted) | Error tracking, data kept in India |

## 4. Laptop setup (development)
### 4.1 Containers and ports
| Container | Port on laptop | Open in browser |
|---|---|---|
| web | 5173 | http://localhost:5173 — the website |
| api | 3000 | http://localhost:3000/docs — API documentation |
| ai | 8000 | http://localhost:8000/docs — AI service documentation |
| keycloak | 8080 | http://localhost:8080 — login server admin |
| postgres | 5432 | (for database tools) |
| valkey | 6379 | — |
| minio | 9000 / 9001 | http://localhost:9001 — file storage console |
| mailpit | 8025 | http://localhost:8025 — see test emails / OTPs |

Keycloak keeps its data in a **separate database** (`keycloak`) inside the same PostgreSQL container on the laptop.

### 4.2 Start order (handled automatically)
```
postgres ─┬─> db-migrate (runs 12 migrations, then tests) ─> api ─> web
          └─> keycloak ──────────────────────────────────────┘
valkey, minio, mailpit ─> api, ai
```

### 4.3 Commands the user will run
| Command | Does |
|---|---|
| `docker compose up` | Starts everything |
| `docker compose down` | Stops everything (data kept) |
| `docker compose down -v` | Stops and **wipes** local data (fresh start) |
| `docker compose run --rm db-migrate` | Re-runs migrations + tests |
| `docker compose logs -f api` | Shows API messages |

### 4.4 Laptop needs
- **User's laptop: Windows, 16 GB RAM** (confirmed 2026-10-11) → **Docker Desktop with WSL 2**; keep the project folder inside WSL (e.g. `~/carefusion`), not on `C:\`, for much faster file access
- Give Docker ~8 GB of memory (WSL `.wslconfig` setting) — enough for all containers
- ~15 GB free disk
- Windows laptop is x86 (amd64) → the official `postgis/postgis` image works as is

## 5. Alpha online (Oracle Always Free server)
### 5.1 What runs on the server
| Container | Memory budget (plan) |
|---|---|
| caddy | ~100 MB |
| carefusion-api | ~512 MB |
| carefusion-ai | ~1–2 GB |
| keycloak | ~1–1.5 GB |
| valkey | ~256 MB |
| **Total** | **~3–4.5 GB** of the 12 GB free allowance (room for growth) |

- Database → **Neon** (CareFusion database + a separate Neon project for Keycloak — suggested).
- Files → **Cloudflare R2**. Website → **Vercel**.
- Web addresses (example, domain to buy): `carefusion-demo.in` (Vercel) · `api.carefusion-demo.in` and `auth.carefusion-demo.in` (Caddy on Oracle).

### 5.2 Server rules
- Only ports **80 and 443** open to the internet; SSH by key only.
- Images built by **GitHub Actions** (both chip types) and pulled by the server; the server never builds code.
- Light health-check job keeps the server busy enough not to be reclaimed as idle.
- Nightly: Neon database dump + server config backup (backup location still open — Backblaze B2 suggested).
- "SYNTHETIC DEMO DATA" banner on every page.

## 6. Production (later, MeitY cloud)
- Same `carefusion-api`, `carefusion-ai` and Keycloak images, deployed on **Kubernetes** with **Helm**; infrastructure written in **Terraform**.
- Managed PostgreSQL (or Citus at national scale), managed object storage, cloud load balancer + WAF instead of Caddy.
- Secrets from the cloud secrets manager; images scanned with **Trivy** before deploy.

## 7. Settings (environment variables)
- Each service reads settings from environment variables; the repo has a **`.env.example`** with every setting and safe demo values.
- Real values live in a **`.env`** file on each machine (never committed to Git) and, online, in GitHub Actions secrets / the server.
- Key settings: database URL, Valkey URL, Keycloak URL + client ids, object storage endpoint + keys, encryption key id, `DEMO_MODE=true` (shows the banner, enables the role switcher, uses mock government connectors).

## 8. Files that will be created in the repo
```
docker-compose.yml          laptop: all containers
docker-compose.server.yml   Oracle: api, ai, keycloak, valkey, caddy
.env.example                every setting, demo values
apps/api/Dockerfile         carefusion-api
apps/ai/Dockerfile          carefusion-ai
apps/web/Dockerfile         carefusion-web (laptop)
infra/caddy/Caddyfile       routes + HTTPS
infra/keycloak/realm.json   10 roles, login pages, demo users (synthetic)
carefusion-db/              migrations + tests (already written)
.github/workflows/          build images, run tests
```

## Open questions
1. Domain name for the demo (e.g. `carefusion-demo.in`) — buy now or later?
2. Keycloak database online: separate Neon project (suggested) or the same project?
3. To verify when writing the setup files: current stable versions of each image and their ARM support; Neon allows the 4 extensions the migrations need.
