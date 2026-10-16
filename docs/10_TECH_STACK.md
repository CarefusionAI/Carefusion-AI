# 10 — Tech Stack: Choices, Advantages and Cost

> Drafted by Claude on 2026-10-11 at the user's request. **Status: APPROVED 2026-10-11 (all NEW items accepted)** — builds on the stack decided on 2026-10-10 (React + React Native, FastAPI, Node/Express, PostgreSQL + FHIR R4, Docker/Kubernetes on MeitY cloud). Items marked **NEW** are Claude's additions that need the user's approval.
> **Updated 2026-10-11 (approved by user):** alpha database = **Neon free plan**; alpha hosting = **Vercel (front end) + Oracle Cloud Always Free (backend) + Neon (database) + Cloudflare R2 (files) → ₹0/month**. See 04_DECISION_LOG.md.
> Prices and free-tier limits were checked on the web on 2026-10-11. They change often — **confirm with the provider before relying on them.** USD → INR at about ₹95/USD. GST (18%) not included.

## 1. Guiding rules for the stack
1. **Two stages, one codebase.** The same code runs in the **alpha** (website, synthetic data, free hosting) and later in **production** (real data, MeitY-empanelled cloud). Only configuration and connectors change.
2. **Open source first.** No licence fees, no vendor lock-in, easier for a government client to audit and take over. *(Government of India has an open-source adoption policy — to verify current text.)*
3. **Cloud-neutral.** Use Kubernetes, Terraform, PostgreSQL and S3-compatible storage so the system can move between AWS / Azure / Google / NIC / Indian providers without rewriting.
4. **Few languages.** TypeScript everywhere except AI (Python). Easier for a 4-person student team.
5. **Mock first, real later.** Every government integration sits behind an interface with a mock (alpha) and a real implementation (production) — as decided on 2026-10-10.

---

## 2. Layer-by-layer stack

### 2.1 Frontend (website — alpha and production)
| Item | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Catches mistakes early; shared types with the backend |
| Framework | **React 18+ with Vite** | Already decided; Vite builds fast and is simple |
| UI components | **NEW: shadcn/ui (Radix) + Tailwind CSS** | Radix components are built for keyboard and screen-reader use → helps GIGW / WCAG 2.1 AA |
| Data fetching | **NEW: TanStack Query** | Caching, retries, offline-friendly |
| Forms + validation | **NEW: React Hook Form + Zod** | Same Zod schemas reused on the server |
| Languages | **NEW: i18next** | English now; Malayalam/Hindi later without code changes |
| Offline mode | **NEW: PWA (Workbox service worker) + IndexedDB** | Delivers the decided offline mode for health centres on the website itself |
| QR | **NEW: qrcode (show) + html5-qrcode (scan)** | Rotating key, health card, prescription QR |
| Maps | **NEW: MapLibre GL** showing Mappls/Bhuvan tiles | Free open-source map viewer; Indian map data |
| Charts | **NEW: Recharts / Apache ECharts** | Dashboards |
| Accessibility testing | **NEW: axe-core + Lighthouse** | Automatic GIGW/WCAG checks in CI |

### 2.2 Mobile app (after the alpha)
| Item | Choice | Why |
|---|---|---|
| Framework | **React Native with Expo** | Already decided; shares TypeScript types, validation and API client with the website |
| Biometrics / secure storage | **NEW: expo-local-authentication, expo-secure-store** | Fingerprint/face ID login; device-bound refresh token |
| Push | **NEW: Firebase Cloud Messaging** (free) | Android + iOS push. **No health details in push text** — only "You have a new update" |

### 2.3 Platform API (Node)
| Item | Choice | Why |
|---|---|---|
| Runtime | **Node.js 22 LTS + TypeScript** | Already decided |
| Framework | **NEW: NestJS (runs on Express underneath)** | Keeps the Express decision but adds structure: modules per feature, built-in guards for role-based access, dependency injection, OpenAPI docs. Plain Express gets messy at this size (10 roles, 20+ modules) |
| Database access | **NEW: Prisma ORM** | Type-safe queries, easy migrations, good for beginners |
| Background jobs | **NEW: BullMQ** (on Valkey) | SMS/push sending, approval-time-limit escalations, archive moves |
| Real-time | **NEW: Socket.IO** | Live stock, session timer, emergency approval alerts |
| API style | **REST + OpenAPI 3** | Simple; auto-generated client for web and mobile |

### 2.4 AI services (Python)
| Item | Choice | Why |
|---|---|---|
| Framework | **FastAPI** (Python 3.12) | Already decided; matches the paper's prototype |
| Alpha | **Simulated outputs** (decided) behind the same API shape | Real models drop in later without UI changes |
| Symptom engine | PyTorch + Hugging Face Transformers (DistilBERT), scikit-learn (Isolation Forest, logistic regression), **faster-whisper** | As in the paper; faster-whisper runs Whisper cheaply on CPU |
| Vision | PyTorch + torchvision ResNet-50 + **pytorch-grad-cam** | Grad-CAM++ as in the paper |
| Genomic | **cyvcf2 / pysam** + ClinVar files | Deterministic VCF validation + matching |
| Temporal | PyTorch LSTM (2×128) | As in the paper |
| RAG | **FAISS** + sentence-transformers | As in the paper (15,000-doc knowledge base) |
| Model tracking | **NEW: MLflow** (open source) | Stores model version per run → needed for the AI results store ("model version" field) |
| Serving | FastAPI on CPU first; **GPU only if needed** | These models are small; CPU inference is likely enough for the pilot (to test) |

### 2.5 Data layer
| Item | Choice | Why |
|---|---|---|
| Main database | **PostgreSQL 16** | Already decided |
| Where the database runs | **Alpha: Neon free plan (decided 2026-10-11). Development: PostgreSQL in Docker on each laptop. Production: MeitY-empanelled cloud** | Neon free never expires and wakes automatically; synthetic data only |
| Location features | **NEW: PostGIS** (PostgreSQL extension) | Pharmacy distance, donor approximate area, hospital geofence — all in SQL, no extra system. *(Check PostGIS is available on Neon free before building)* |
| FHIR store | **NEW: Alpha — FHIR R4 JSON in PostgreSQL (JSONB). Production — HAPI FHIR server (Apache 2.0) on PostgreSQL** | Alpha stays simple; HAPI gives full FHIR R4 validation and APIs needed for ABDM HIP/HIU |
| Cache, rotating keys, OTP, rate limits | **NEW: Valkey** (open-source Redis fork) — alpha: runs in Docker on the Oracle server | Redis changed its licence; Valkey stays fully open (BSD) and works with all Redis tools |
| Files (scans, VCF, PDFs) | **S3-compatible object storage.** **Alpha: Cloudflare R2 free plan (decided 2026-10-11). Development: MinIO in Docker on each laptop. Production: MeitY-empanelled object storage in India** | Same S3 code everywhere — only settings change. Fast tier + archive tier (decided); object lock for tamper-proofing |
| Medical images | **NEW: Orthanc DICOM server** (production) | Stores and serves X-ray/CT in the hospital standard (DICOM); link to PACS later. *(GPL licence — fine for a separate server; to check with the client)* |
| Vector search | FAISS (as in paper) | pgvector is a possible later swap |

### 2.6 Identity, security and logs
| Item | Choice | Why |
|---|---|---|
| Login server | **NEW: Keycloak** (open source, OIDC) | One place for all 10+ login pages, MFA, **WebAuthn hardware keys** (decided for admins), roles, session timeouts, and brokering to **Jan Parichay** and other SSO. Saves months of risky custom auth code |
| Tokens | JWT (RS256/ES256) via Keycloak | Already decided |
| Rotating 10-second key | **NEW: TOTP-style code (RFC 6238, 10 s step)** generated on the phone from a per-device secret; server checks it and marks it used in Valkey | Works even if the phone is briefly offline; single use |
| Encryption | AES-256 at rest with cloud **KMS/HSM**; **NEW: envelope encryption** for AI results and documents | Already decided; envelope keys allow key rotation |
| Aadhaar | **Token only** via UIDAI-authorised route; never stored | Already decided |
| Activity log | **NEW: append-only PostgreSQL table, each row holds SHA-256 of the previous row; UPDATE/DELETE blocked; daily chain-head hash copied to write-once (object-lock) storage** | Implements the decided "tamper-proof hash chain, no blockchain" |
| Secrets | **NEW: cloud secrets manager** (or HashiCorp Vault / OpenBao) | No passwords in code |
| Security scans | **NEW: OWASP ZAP, Trivy, SonarQube Community, Dependabot** (all free) | Prepares for the CERT-In/STQC audit |

### 2.7 Government and third-party services
| Service | Choice | Notes |
|---|---|---|
| e-Sign | CCA-licensed eSign provider (e.g. eMudhra) **and/or** doctors' DSC | See cost section — per-signature cost matters at prescription volume |
| SMS | DLT-registered transactional SMS provider (Indian) | OTPs, card OTP, alerts |
| Email | Indian transactional email service (e.g. Zoho ZeptoMail) or cloud email service | Price to confirm |
| Maps | **Mappls** (MapmyIndia) or **Bhuvan** (ISRO) | Decided "Indian provider"; pick in pharmacy phase |
| ABDM, UIDAI, HPR, HFR, Jan Parichay, NOTTO, e-RaktKosh | Mock connectors in alpha → real APIs later | Decided |

### 2.8 DevOps and hosting
| Item | Choice | Why |
|---|---|---|
| Code | **GitHub** (free for the team) + monorepo (**NEW: pnpm + Turborepo**) | Web, mobile, API and shared types in one repo |
| CI/CD | **GitHub Actions** | Free minutes for small teams; deploys website to Vercel and backend containers to the Oracle server |
| Containers | **Docker** (all stages; **Docker Compose** on the alpha server) + **Kubernetes** (production) | Already decided |
| Infrastructure as code | **NEW: Terraform + Helm** | Same setup can be rebuilt in a second region or a different cloud |
| Monitoring | **NEW: Prometheus + Grafana + Loki**, **Sentry (self-hosted in India for production)** | Open source; error data stays in India |
| Testing | **NEW: Vitest (unit), Playwright (end-to-end), pytest (AI), k6 (load)** | Load tests matter for national scale |
| Synthetic data | **NEW: Synthea** (generates realistic synthetic FHIR R4 patients) + **Faker (en_IN)** for Indian names/addresses | Fits the "synthetic data only" alpha rule; Synthea output is already FHIR |

---

## 3. Hosting options

### 3.1 Alpha (synthetic data only) — DECIDED 2026-10-11: Vercel + Oracle Always Free + Neon = ₹0/month
| Part | Where | Plan | Monthly |
|---|---|---|---|
| Website (React front end) | **Vercel** | Hobby (free) | ₹0 |
| Node API, FastAPI (simulated AI), Keycloak, Valkey | **Oracle Cloud Always Free** — one Arm (Ampere A1) server running all four with Docker Compose + Caddy/nginx (free HTTPS via Let's Encrypt) | Always Free | ₹0 |
| PostgreSQL | **Neon** | Free plan | ₹0 |
| Files — demo scans, VCF, PDFs | **Cloudflare R2** | Free plan (10 GB) | ₹0 |
| Domain name | Any registrar | — | ~₹800–1,500 per **year** |
| **Total** | | | **₹0 / month** (+ domain) |

**Vercel (front end)**
- Free Hobby plan; Git push → automatic deploy; global CDN.
- ⚠ To verify: Vercel's Hobby plan terms on non-commercial/personal use. A funded research demo should be fine, but check the current terms; **fallback: Cloudflare Pages** (also free, same build).

**Oracle Cloud Always Free (backend)**
- Free forever (no expiry). Officially 4 OCPU + 24 GB memory (Arm), 200 GB storage, 10 TB/month outbound data. ⚠ 2026 reports say the Arm allowance was **halved to 2 OCPU + 12 GB** — **plan for 2 OCPU / 12 GB**, which is still enough for Node + FastAPI + Keycloak + Valkey.
- **Home region:** choose **Mumbai or Hyderabad** at signup — it **cannot be changed later**, and free servers must be in the home region.
- **Credit card needed** for identity check (not charged for Always Free resources).
- **"Out of capacity" errors** are common — keep retrying, or try another availability domain.
- **Idle reclaim:** Oracle can reclaim idle Always Free servers — keep a light health-check job running and keep backups.
- **Arm chips:** use arm64 Docker images (Node, Python, Keycloak and Valkey all have them).
- **Team manages the server:** OS updates, firewall (only ports 80/443 open; SSH by key only), backups.

**Neon (database)** — limits (checked 2026-10-11; confirm on neon.com):
- Permanent free plan, no expiry, no credit card
- 0.5 GB storage per project — enough for synthetic records; keep demo scans/VCF files in object storage, not the database
- 100 compute-hours per project per month; sleeping time does not count
- Sleeps after 5 minutes idle and wakes in a few hundred milliseconds — no manual unpause
- Take a regular database dump (backup)

**Cloudflare R2 (files)** — limits (checked 2026-10-11; confirm on cloudflare.com):
- 10 GB storage free; **no download (egress) fees**; about 1 million write and 10 million read operations per month
- S3-compatible — the app uses the normal S3 SDK; switching to MinIO or MeitY storage later is a settings change
- Separate from the Oracle server, so files survive if the server is lost or reclaimed
- A payment card may be needed to activate R2
- **Buckets private**; the app hands out short-lived signed download links; no public bucket URLs
- **What goes in:** synthetic VCF files, generated PDF reports, and a **small sample (a few hundred images) of a public, de-identified dataset** such as NIH Chest X-ray — well under 1 GB. Do not upload full datasets. **Never real patient scans.**
- Other free options considered: Backblaze B2 (10 GB — suggested for nightly backups, not yet decided), MinIO on the Oracle server disk (largest), Oracle Object Storage, Neon Object Storage (5 GB), Tigris (5 GB), Supabase Storage (1 GB, 50 MB file limit)

**Rules for all four:** **synthetic data only** — none of these is MeitY-empanelled, and some may host outside India. Set a billing alert at ₹1 on Oracle.

**Backup plan if Oracle gives no free server in an India region:** AWS Mumbai (new-account credit $100–200, Free plan up to 6 months), DigitalOcean Bangalore ($200 credit for 1 year via GitHub Student Pack, if a team member is a student), or Render paid (~₹4,700/month).

- Other alpha costs: SMS/e-Sign/maps **₹0** (mocks + free dev tiers).
- **Alpha total for ~4 months: about ₹800–1,500 (domain only).**

### 3.2 Production (real data — decided "MeitY-empanelled cloud + second India region")
| Option | Indian regions | Strengths | Watch out |
|---|---|---|---|
| **AWS** | Mumbai + Hyderabad | Widest managed services; two India regions → fits the "second region" decision | Costs add up (NAT, data transfer, proxies) |
| **Microsoft Azure** | Pune, Chennai, Mumbai | Strong government presence | — |
| **Google Cloud** | Mumbai, Delhi | Good AI tooling | — |
| **NIC / MeghRaj** | Government data centres | Many ministry projects run here; MoHFW may prefer it | Fewer managed services; access via MoHFW |
| **Indian providers** (E2E Networks, Yotta, Tata Vayu, Jio, Airtel Nxtra, CtrlS, ESDS) | Several | INR billing, often cheaper, cheap GPUs | Fewer managed services |

**Claude's suggestion:** build cloud-neutral, plan the pilot on **AWS Mumbai (primary) + Hyderabad (backup)** as the default, and let **MoHFW choose** the final provider. ⚠ MeitY empanelment can be **per service** (e.g. VMs empanelled but not a specific managed database) — check each service used against the official MeitY list.

---

## 4. Unit prices found (2026)
| Item | Price | Source date |
|---|---|---|
| Vercel Hobby (front end) | ₹0 | Oct 2026 |
| Oracle Cloud Always Free (Arm server, 200 GB storage) | ₹0 (2–4 OCPU, 12–24 GB — see 3.1) | Oct 2026 |
| Neon PostgreSQL free plan | ₹0 (0.5 GB/project, 100 compute-hours/month) | Oct 2026 |
| Cloudflare R2 free plan | ₹0 (10 GB, no egress fees, 1M write + 10M read ops/month) | Oct 2026 |
| AWS RDS PostgreSQL db.t4g.micro, Mumbai | ~$15/month on-demand (~$9 with 3-yr reservation) | Jul 2026 |
| AWS RDS PostgreSQL db.t4g.2xlarge, Mumbai | ~$488/month on-demand (~$288 reserved) | Jul 2026 |
| AWS RDS db.t4g.small (2 vCPU, 2 GB) | ~$23/month single-AZ; ~$47 Multi-AZ (US price; Mumbai slightly higher) | 2026 |
| GPU — NVIDIA H100, E2E Networks (India, MeitY-empanelled) | ₹362/hour on-demand; spot as low as ~₹70/hour | Aug–Sep 2026 |
| GPU — IndiaAI Mission (eligible startups/researchers) | ~₹65–92 per GPU-hour (subsidised) | 2026 |
| Transactional SMS (DLT route) | ₹0.10–0.25 per SMS; OTP ₹0.10–0.45 | 2026 |
| Aadhaar eSign API (eMudhra, low volume) | ₹5 per signature; volume pricing above 10 lakh/year | 2026 |
| DSC (USB token) | ~₹500–2,000 per year per person | Jul 2026 |
| Mappls APIs | Free tier for development; paid plans for production (quote needed) | — |
| Core software (React, Node, NestJS, FastAPI, PostgreSQL, Keycloak, HAPI FHIR, Valkey, Grafana…) | **₹0 licence** (open source) | — |

## 5. Cost picture

### 5.1 Alpha (4 months) — ≈ ₹800–1,500 total
Hosting ₹0/month (Vercel + Oracle Always Free + Neon + Cloudflare R2). Only cost: domain name. No real SMS, e-Sign or GPU.

### 5.2 Kerala pilot — sample estimate (ASSUMPTIONS, to refine)
Assume: 2 districts, ~1 lakh registered citizens, ~500 doctors, ~50 hospitals, ~200 pharmacies.
| Item | Assumption | Approx. monthly |
|---|---|---|
| Cloud infra (Kubernetes, database Multi-AZ, storage, KMS, WAF, monitoring) + warm backup in second region | Rough — needs the provider's calculator | ₹1.5–3 lakh |
| SMS | 3 SMS per user per month × ₹0.15 | ~₹45,000 |
| e-Sign — **if Aadhaar eSign per prescription** | 500 doctors × 20 prescriptions/day × 25 days × ₹5 | **~₹12.5 lakh** ⚠ |
| e-Sign — **if each doctor uses a DSC** | 500 × ₹500–2,000 per year | **~₹21,000–83,000** (per month equivalent) |
| GPU for AI validation/fine-tuning | A few hundred GPU-hours, one-off; IndiaAI rate if eligible | ₹20,000–1.5 lakh one-off |
| Maps, email | Quotes needed | Small |
| Security audit (CERT-In/STQC empanelled) | One-off | Quote needed |

**Key finding:** per-signature Aadhaar eSign is very costly at prescription volume. **Suggestion: doctors sign prescriptions with a DSC** (or a cloud/remote-signing DSC), and Aadhaar eSign is used only for one-off signatures (organ pledges, admin documents). ⚠ Verify the legal rules for signing e-prescriptions before deciding.

### 5.3 National rollout
Cannot be priced honestly yet — it depends on users, records per user, scan volumes and the provider MoHFW chooses. Biggest cost drivers: **storage of scans** (archive tier helps), **SMS volume**, **signature method**, **second-region backup**, **24×7 operations staff**. A sizing study is needed before the national phase.

---

## 6. Why this stack (advantages in short)
- **Fast to build:** TypeScript end to end + ready-made pieces (Keycloak, HAPI FHIR, PostGIS, Synthea) instead of writing them.
- **Government-ready:** open source, data in India, cloud-neutral, hardware-key MFA, hash-chained logs, FHIR R4 for ABDM.
- **Free to start:** alpha hosting costs ₹0/month (Vercel + Oracle Always Free + Neon); no licence fees ever.
- **Safe to grow:** same code from alpha to national; Kubernetes scales; second region for backup.
- **Matches the paper:** Python AI services keep the paper's models and design intact.

## 7. Trade-offs to know
- **Keycloak** is powerful but needs learning and ~1–2 GB RAM.
- **NestJS** adds a learning step over plain Express (but pays back in structure).
- **HAPI FHIR** is Java — a third runtime in production (alpha avoids it).
- **Kubernetes** is complex — only needed from the pilot; the alpha uses Docker Compose on one server.
- **Oracle Always Free** is self-managed (team handles updates, security, backups), can be hard to get, and may be reclaimed if idle — keep the backup plan ready.
- **Vercel, Oracle and Neon** free plans are not MeitY-empanelled — fine **only** for synthetic data (decided), never for real data.
- **Neon free** has small storage (0.5 GB) and monthly compute limits — enough for the alpha, not for a pilot.

## Open questions
1. Approve the NEW items (NestJS on Express, Keycloak, PostGIS, Valkey, HAPI FHIR, Orthanc, Synthea, MLflow, PWA offline)?
2. Production cloud: AWS Mumbai + Hyderabad as default, NIC, an Indian provider, or let MoHFW choose?
3. Prescription signing: DSC for doctors, Aadhaar eSign, or both? (legal check needed)
4. Maps: Mappls or Bhuvan?
5. Nightly backups (Neon database dump + key files): Backblaze B2 free (10 GB), or another option?
6. To verify: PostGIS on Neon free; Cloudflare R2 free limits and card requirement; Oracle free-server capacity in Mumbai/Hyderabad and the current Arm allowance; Vercel Hobby terms; per-service MeitY empanelment of each cloud service used; open-source policy text; e-prescription signing rules; all prices with providers.
