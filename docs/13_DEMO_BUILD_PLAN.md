# 13 — Demo Build Plan (weekends only)

> Written by Claude on 2026-10-11 at the user's request. **Status: APPROVED 2026-10-11** — change any week freely; record changes in 04_DECISION_LOG.md.
> **Builders:** Athun (user) + Claude. **Deadline:** full alpha demo ≈ **14 February 2027**.
> **Working time:** Saturday + Sunday only; **2 sessions a day of about 5 hours each** (confirmed 2026-10-11), sometimes a 3rd session depending on Claude usage limits.
> **Laptop:** Windows, 16 GB RAM → Docker Desktop with WSL 2; runs every container comfortably.
> Build order follows the approved stages: login + roles → citizen record + rotating key → doctor session with AI → prescription to pharmacy → donors → admin inboxes → dashboards.

---

## 1. The numbers
| Item | Value |
|---|---|
| Weekends from 17 Oct 2026 to 14 Feb 2027 | **18** |
| Planned sessions | 18 × 4 = **72 sessions** (~360 hours) |
| Extra 3rd sessions (if usage allows) | used only as **catch-up**, never planned work |
| Light weekends (festivals / year end) | W4 (Diwali, ~8 Nov), W11 (26–27 Dec), W12 (2–3 Jan) — less planned work |
| Milestone 1 — **Core demo online** | **W9, 12–13 Dec 2026** (before the expected ICMR call) |
| Milestone 2 — **Full alpha demo** | **W18, 13–14 Feb 2027** |

## 2. How every session works
| Part | Who | What |
|---|---|---|
| Start (~15 min) | Both | Read this plan + last log entry; agree the 2–4 tasks for the session |
| Build (~3 h) | **Claude** writes code, tests and docs in the repo; **Athun** prepares accounts, data, screenshots, or tests the previous part | |
| Run & check (~1 h) | **Athun** runs `docker compose up`, clicks through, reports what is wrong; **Claude** fixes | |
| Close (~30 min) | Both | All tests pass → merge to `main`; tick tasks; add a short entry to 04_DECISION_LOG.md; write the first task for next session |

**Rules:** each weekend ends with something that **works and can be shown**; never leave `main` broken; if Claude's usage runs out mid-session, Athun switches to testing/checking tasks and Claude continues in the next session.

## 3. Weekend-by-weekend plan

### Stage 0 — Setup
**W1 · 17–18 Oct**
| Session | Tasks |
|---|---|
| Sat S1 | Athun: create project email (2-step login), GitHub account, private repo `carefusion`; install Docker Desktop with WSL 2 (Windows). Claude: connect repo |
| Sat S2 | Claude: monorepo skeleton (pnpm + Turborepo: `apps/web`, `apps/api`, `apps/ai`, `packages/shared`, `carefusion-db`), `docker-compose.yml`, `.env.example` |
| Sun S1 | First `docker compose up` on Athun's laptop; database migrations + 46 tests run in Docker; fix laptop problems |
| Sun S2 | GitHub Actions: build + tests on every change; "SYNTHETIC DEMO DATA" banner; empty pages for each role. ✅ **Everything starts with one command** |

### Stage 1 — Login, roles, role switcher
**W2 · 24–25 Oct**
| Session | Tasks |
|---|---|
| Sat S1 | Keycloak realm: 10 roles, clients for web/API, MFA settings (demo-friendly) |
| Sat S2 | Main login page (User/Doctor switch) + separate staff/admin login pages; API checks tokens and roles |
| Sun S1 | Synthetic data generator v1 (Faker en_IN + Synthea): 2 Kerala districts, 20 hospitals, 40 pharmacies, ~2,000 citizens, doctors, staff, admins — all `DEMO-` ids |
| Sun S2 | **Demo role switcher** (one click to any role); audit log written on every login. ✅ **Log in as any of the 10 roles** |

**W3 · 31 Oct – 1 Nov**
| Session | Tasks |
|---|---|
| Sat S1 | Citizen registration: mock Aadhaar e-KYC + mock face check + background ABHA (mock connectors, same shape as real); minors with guardian consent |
| Sat S2 | Doctor self-registration (mock HPR check); hospital admin + pharmacy admin self-registration (mock HFR / licence check) |
| Sun S1 | Approval chain basics: district → state for doctors; flagged citizens; time limits + escalation job |
| Sun S2 | Admin creation chain (central → zonal → state → district) with two-person rule; staff and pharmacist accounts created by their admins. ✅ **Stage 1 done** |

### Stage 2 — Citizen record + rotating key
**W4 · 7–8 Nov (Diwali — light)**
| Session | Tasks |
|---|---|
| Sat S1 | Citizen home: profile, locked identity fields, editable fields, special category with status |
| Sat S2 | Folders + documents: upload to MinIO (R2 later), 4 AI folders + Doctor uploads, move documents, highlights |
| Sun | Catch-up / rest |

**W5 · 14–15 Nov**
| Session | Tasks |
|---|---|
| Sat S1 | Emergency contacts (registered users) + emergency code; allergies, conditions, medicines, vaccinations, family history, lifestyle |
| Sat S2 | Dates panel; home vitals (self-reported) with simple chart |
| Sun S1 | **Rotating 10-second key**: QR + number on citizen screen; doctor scans/types → 30-minute session; one doctor at a time |
| Sun S2 | "End session" button; access history; notifications in Mailpit (email) + in-app. ✅ **Doctor opens a record with the key** |

**W6 · 21–22 Nov**
| Session | Tasks |
|---|---|
| Sat S1 | Health card (printable ABHA QR) + OTP to basic phone (mock SMS); assisted registration by ASHA/staff |
| Sat S2 | Admission mode: grant to treating team until discharge; shift handover note |
| Sun S1 | Emergency: basic info without key; emergency contact approves on own phone; Aadhaar + code fallback (mock) |
| Sun S2 | Break-glass with reason; district review → central verify within 24 h; lost-phone recovery. ✅ **Stage 2 done** |

### Stage 3 — Doctor session with (simulated) AI
**W7 · 28–29 Nov**
| Session | Tasks |
|---|---|
| Sat S1 | Doctor home: profile, work time, appointments, past patients (name + own additions only) |
| Sat S2 | Session screen: timer, geofence check (browser location; reason if outside → flag to district) |
| Sun S1 | File manager in session; new document from template (auto-named); voice note → text (mock Whisper in alpha) |
| Sun S2 | Orders: doctor orders vitals/lab/scan/VCF → staff orders queue → staff upload → doctor notified; referrals |

**W8 · 5–6 Dec**
| Session | Tasks |
|---|---|
| Sat S1 | FastAPI AI service: 4 simulated tools (symptom chat, image, genomic, temporal) with the paper's output shape — top-3, VERIFIED / SUPPORTED_WITH_CAUTION / UNCERTAIN, evidence list, disagreement report; labelled "simulated AI output" |
| Sat S2 | Doctor UI for the 4 tools; results saved locked + encrypted + hashed in the right AI folder |
| Sun S1 | Agree/disagree with reason; patient sees result only after review |
| Sun S2 | Citizen AI guidance chat (no diagnosis, emergency flagging, "see a doctor"). ✅ **Stage 3 done** |

### ⭐ Milestone 1 — Core demo online
**W9 · 12–13 Dec**
| Session | Tasks |
|---|---|
| Sat S1 | Athun: create Neon, Cloudflare R2, Vercel, Oracle accounts (Mumbai/Hyderabad region) and domain if decided. Claude: deploy scripts |
| Sat S2 | Deploy: web → Vercel; API, AI, Keycloak, Valkey, Caddy → Oracle; migrations + synthetic data → Neon; files → R2 |
| Sun S1 | Test everything online; fix; HTTPS; backups (database dump) |
| Sun S2 | Demo script v1 + short screen recording of the core flow (register → key → doctor session → AI → review). ✅ **Core demo link ready for ICMR** |

### Stage 4 — Prescription to pharmacy
**W10 · 19–20 Dec**
| Session | Tasks |
|---|---|
| Sat S1 | Medicine catalogue (demo list, generic names); prescription template; allergy + interaction warnings (demo rules) |
| Sat S2 | Mock e-signature + verifiable QR; signed PDF in the patient's folder; validity dates in Dates panel |
| Sun S1 | Patient sends to any pharmacy / shows QR; doctor sends to own hospital pharmacy with patient's consent |
| Sun S2 | Stock shown while prescribing; buffer |

**W11 · 26–27 Dec (year end — light)**
| Session | Tasks |
|---|---|
| Sat S1 | Pharmacist queue + QR scan; e-signature + not-dispensed check |
| Sat S2 | Dispense / substitute / out-of-stock; stock reduces; controlled-drug register for Schedule H/H1/X |
| Sun | Catch-up / rest |

**W12 · 2–3 Jan (new year — light)**
| Session | Tasks |
|---|---|
| Sat S1 | Pharmacy admin: stock, pharmacists, hours, near-expiry + low-stock alerts, dispensing report |
| Sat S2 | **Medicine stock finder** with map (MapLibre + free tiles in alpha) and distance. ✅ **Stage 4 done** |
| Sun | Catch-up / rest |

### Stage 5 — Donors
**W13 · 9–10 Jan**
| Session | Tasks |
|---|---|
| Sat S1 | Blood: "ready to donate" toggle + eligibility check; auto-OFF after donation; next date in Dates panel |
| Sat S2 | Blood requests → matching donors nearby (approximate area map) → alerts |
| Sun S1 | Donor chat / call with hidden number; payment-talk blocking + report; e-RaktKosh (mock) stock |
| Sun S2 | Organ pledge at hospital with verified doctor; NOTTO link (mock); authorised-doctor list. ✅ **Stage 5 done** |

### Stage 6 — Admin inboxes and services
**W14 · 16–17 Jan**
| Session | Tasks |
|---|---|
| Sat S1 | District admin inbox: approvals, emergency reviews, flagged users, location flags (with counts, due dates) |
| Sat S2 | State, zonal and central inboxes: confirmations, escalations, emergency verification, flagged doctors, zones, master lists |
| Sun S1 | Suspensions (two-person), misuse case → medical council report (mock); log viewing with central permission + chain verification screen |
| Sun S2 | Admin handover on transfer; doctor transfer (geofence + patient list move) |

**W15 · 23–24 Jan**
| Session | Tasks |
|---|---|
| Sat S1 | Hospital admin: profile + geofence map, staff accounts, departments, bed availability, admissions list |
| Sat S2 | Appointments: slots, citizen request, hospital confirm (free booking) |
| Sun S1 | Ratings + replies + district moderation; complaints |
| Sun S2 | Health alerts (mute normal, never emergency); death record flow. ✅ **Stage 6 done** |

### Stage 7 — Dashboards
**W16 · 30–31 Jan**
| Session | Tasks |
|---|---|
| Sat S1 | District + hospital dashboards (de-identified report views) |
| Sat S2 | State, zonal, national dashboards |
| Sun S1 | Unusual-pattern alerts (many break-glass uses, shortages, demo disease spike) |
| Sun S2 | Bed availability for citizens/ambulances; buffer. ✅ **Stage 7 done** |

### Finish
**W17 · 6–7 Feb — Test and harden**
| Session | Tasks |
|---|---|
| Sat S1 | Full end-to-end tests (Playwright) for each role's main flow |
| Sat S2 | Security pass: OWASP ZAP scan, dependency scan, check no real data, no secrets in repo |
| Sun S1 | Accessibility pass (axe-core / Lighthouse); mobile-width check |
| Sun S2 | Fix list; final deploy |

**W18 · 13–14 Feb — Demo ready**
| Session | Tasks |
|---|---|
| Sat S1 | Fresh synthetic data; reviewer guide (how to log in as each role, what to try) |
| Sat S2 | Final demo script (10–15 minutes) + full screen recording |
| Sun S1 | Two full rehearsals; fix anything that breaks |
| Sun S2 | Freeze version `v0.1-alpha`; update all docs + log. ✅ **Full alpha demo ready** |

---

## 4. If we fall behind (cut in this order — never cut stages 1–3)
1. Voice notes (keep typed notes)
2. Organ pledge screens (keep blood donation)
3. Zonal + national dashboards (keep district + state)
4. Ratings moderation details, complaints
5. Health card printing (keep OTP flow)
6. Pharmacy admin reports (keep stock + dispensing)

The extra 3rd session on any day goes to catch-up first, then to these items.

## 5. What Athun needs (and when)
| When | What |
|---|---|
| Before W1 | Windows laptop (16 GB) with Docker Desktop + WSL 2 installed |
| W1 | Project email, GitHub account + private repo |
| W9 | Neon, Cloudflare (R2), Vercel, Oracle Cloud accounts (card needed for Cloudflare/Oracle verification); domain if wanted (~₹800–1,500/year) |
| Every session | Run the system, click through, report problems with screenshots |

## 6. Tracking
- This file = the plan. 04_DECISION_LOG.md = what actually happened (one short entry per weekend).
- Each weekend's ✅ line is the "done" check.

## Open questions
1. Any weekends you already know you can't work (exams, travel, festivals)?

Answered 2026-10-11: sessions ≈ 5 hours; laptop Windows, 16 GB RAM; Milestone 1 (core demo online by 12–13 Dec) kept.
