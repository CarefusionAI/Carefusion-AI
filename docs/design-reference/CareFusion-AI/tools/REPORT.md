# CareFusion AI Prototype — QA Report

**Date:** 18 October 2026
**Pages checked:** 42 (all *.dc.html files)
**Sidebar sections tested:** 140+
**Cross-app flows tested:** 3 (prescription, lab order, district alert) — all passed

## What was fixed

| File | Change | Why |
|------|--------|-----|
| CentralAdmin.dc.html | `.replace(/^M0/, 'M26.7')` → `.replace(/^M0(\.0)?/, 'M26.7')` | SVG `<path d>` produced `M26.7.0` (invalid) because the regex only replaced `M0`, leaving the `.0` suffix from `toFixed(1)`. Broke the disease-surveillance baseline dashed line. |
| DistrictAdmin.dc.html | Same fix | Same bug |
| StateAdmin.dc.html | Same fix | Same bug |
| ZonalAdmin.dc.html | Same fix | Same bug |

## Remaining checker output — all confirmed benign

| Category | Count | Why it's not a bug |
|----------|------:|---------------------|
| React SVG attribute warnings | 123 | React wants `strokeWidth`, template uses `stroke-width`. Support.js passes them to React as-is; React renders them correctly but logs a development warning. No visual effect. |
| SVG path first-render transient errors | 79 | `<path d="{{hourBars}}">` shows a console error during the first React render cycle before `renderVals()` runs. The path is correct on the next render. No visual effect. |
| Optional prop undefined (dcError) | 62 | StatCard props like `tone`, `unit`, `trend`, `hint` are intentionally `undefined` for some items. Form error props (`fmErr`, `textErr`) start `undefined`. `aria-current` on stepper steps. All by design. |
| SVG circle cx/cy transient errors | 8 | Same first-render issue as paths, for QR code circles in CitizenAccess and CitizenHome. |
| Grid row height equalization | 6 | LabTech and Nurse have card rows where one card is taller; CSS grid stretches siblings to match. Standard layout behaviour. |
| Message list sidebar (sectionError) | 4 | CitizenMessages uses conversation buttons in the sidebar; clicking one changes the list, so the checker's next button index is stale. Not a real nav bug. |

## Cross-app link tests — all passed

Tested with `tools/cross-app-test.mjs` (Playwright, shared browser context for localStorage).

### 1. Prescription: Doctor → Pharmacist → CitizenMedicines ✓
- Doctor: navigated to Prescriptions, clicked "e-Sign and send"
- Bus event created with `type: 'prescription'`, `to: ['pharmacist','citizen']`
- Pharmacist: prescription appeared in Connected apps (live poll + fresh load)
- Pharmacist: clicked "Verify signature & QR" then "Dispense all"
- Bus event created with `type: 'dispensed'`
- CitizenMedicines: "Ready to collect" and "Dispensed" appeared

### 2. Lab order: Doctor → LabTech → Doctor + CitizenDocuments ✓
- Doctor: navigated to Orders, clicked "Place order"
- Bus event created with `type: 'lab-order'`
- LabTech: order appeared, clicked Accept, uploaded result
- Bus event created with `type: 'lab-result'`
- Doctor and CitizenDocuments: result appeared

### 3. District alert: DistrictAdmin → CitizenAlerts ✓
- DistrictAdmin: navigated to Health alerts, set title, clicked "Send advisory"
- Bus event created with `type: 'alert'`
- CitizenAlerts: alert appeared

## Static scan — clean

| Check | Result |
|-------|--------|
| `style="{{…}}"` (holes in style attributes) | 0 found |
| `<x-import style=…>` (style on import) | 0 found |
| `<sc-for>` inside `<table>/<thead>/<tbody>/<tr>` | 0 found |
| Holes not returned by `renderVals()` | 0 found |
| Broken `href` targets to `.dc.html` files | 0 found |
| Missing `alt` on `<img>` | 0 found |
| `index.html` listing vs actual files | 42/42 ✓ |

## Visual review — no issues

Compared Playwright screenshots (tools/shots/) against reference screenshots for:
- Landing page, Login, Register, DemoSignIn
- Citizen home + all sub-pages (documents, medicines, alerts, etc.)
- Doctor (all 13 sidebar sections)
- Nurse, LabTech, Pharmacist, RadiologyTech
- CentralAdmin, StateAdmin, DistrictAdmin, ZonalAdmin, HospitalAdmin, PharmacyAdmin

No misaligned forms, wrong-size buttons, unreadable text, overflows, raw placeholders, or blank areas found.

## How to re-run

```bash
# Start the server
cd CareFusion-AI/site && python3 -m http.server 8080 &

# Set library path for Chromium (WSL)
export LD_LIBRARY_PATH=/tmp/claude-1000/-home-athun-projects-Carefusion-AI/2fd43528-6ace-461e-8b8e-301d20b189da/scratchpad/libs/root/usr/lib/x86_64-linux-gnu

# Run the page checker
cd CareFusion-AI && node tools/check.mjs

# Run the cross-app flow tests
node tools/cross-app-test.mjs
```

## What couldn't be fixed

- **React SVG attribute warnings**: These are a fundamental mismatch between HTML SVG attributes (`stroke-width`) and React's JSX prop names (`strokeWidth`). Fixing them would require either modifying support.js to translate SVG attributes (risky — could break other things) or rewriting every SVG in every page. Since they cause no visual effect and only appear in the development console, they were left as-is.
- **First-render transient console errors**: The template runtime renders once with empty scope before `renderVals()` returns data. This is a support.js architecture issue. The charts and QR codes render correctly on the immediate re-render.
