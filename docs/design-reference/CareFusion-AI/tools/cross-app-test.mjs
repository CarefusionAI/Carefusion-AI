#!/usr/bin/env node
// CareFusion AI prototype - cross-app communication test (Playwright).
//
// Usage:  node tools/cross-app-test.mjs
// Env:    BASE_URL (default http://localhost:8080/), HEIGHT (default 1000),
//         HEADED=1 to watch the browser, KEEP_OPEN_MS to pause before closing.
//         Chromium may need LD_LIBRARY_PATH set externally (same as check.mjs).
//
// All pages share ONE browser context, so they share localStorage and talk to
// each other through the demo bus (localStorage key "cf-demo-bus-v1", a JSON
// array of {id, type, from, to[], title, text, href, at}).
//
// Flows tested:
//   1. Prescription  : Doctor (e-Sign and send) -> Pharmacist (verify + Dispense all)
//                      -> CitizenMedicines (dispensed status / ready to collect)
//   2. Lab order     : Doctor (Orders > Place order) -> LabTech (Accept, upload report)
//                      -> Doctor + CitizenDocuments (result visible)
//   3. District alert: DistrictAdmin (Health alerts > Send advisory) -> CitizenAlerts
//
// Notes about the prototype this script relies on:
//   - Bus roles are doctor, citizen, pharmacist, labtech (not "lab"), district, ...
//   - The bus is seeded with events s1..s10 when localStorage is empty, so
//     "text appears" checks use content that only a NEW event can produce
//     (unique alert title, event timestamps, exact order aria-labels).
//   - Doctor button label is "e-Sign and send"; the order button is "Place order";
//     the alert button is "Send advisory".
//
// Playwright is resolved from /tmp/pw-checker/node_modules/playwright.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/tmp/pw-checker/package.json');
const { chromium } = require('/tmp/pw-checker/node_modules/playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = path.resolve(__dirname, 'shots');
const BASE_URL = (process.env.BASE_URL || 'http://localhost:8080/').replace(/\/?$/, '/');
const HEIGHT = Number(process.env.HEIGHT || 1000);
const BUS_KEY = 'cf-demo-bus-v1';
const POLL_WAIT = 8000; // pages poll every 2 s; allow a few cycles

fs.mkdirSync(SHOTS_DIR, { recursive: true });

// ---------------------------------------------------------------- reporting
const results = []; // {flow, name, ok, detail}
let currentFlow = '';
let currentPage = null; // page to screenshot on failure
const openPages = [];

const C = process.stdout.isTTY
  ? { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', x: '\x1b[0m' }
  : { g: '', r: '', y: '', d: '', x: '' };

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function note(msg) {
  console.log(`  ${C.d}note: ${msg}${C.x}`);
}

async function snap(page, label) {
  if (!page || page.isClosed()) return null;
  const file = path.join(SHOTS_DIR, `cross-app-FAIL-${slug(currentFlow)}-${slug(label)}.png`);
  try {
    await page.screenshot({ path: file, fullPage: true });
    return file;
  } catch {
    return null;
  }
}

/** Run one named check. Logs PASS/FAIL, screenshots on failure, never throws. */
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ flow: currentFlow, name, ok: true, detail: detail || '' });
    console.log(`  ${C.g}PASS${C.x} ${name}${detail ? `  ${C.d}(${detail})${C.x}` : ''}`);
    return true;
  } catch (err) {
    const msg = String(err && err.message ? err.message : err).split('\n')[0];
    const shot = await snap(currentPage, name);
    results.push({ flow: currentFlow, name, ok: false, detail: msg, shot });
    console.log(`  ${C.r}FAIL${C.x} ${name}\n       ${msg}${shot ? `\n       screenshot: ${shot}` : ''}`);
    return false;
  }
}

function skip(name, why) {
  results.push({ flow: currentFlow, name, ok: false, skipped: true, detail: `skipped: ${why}` });
  console.log(`  ${C.y}SKIP${C.x} ${name}  ${C.d}(${why})${C.x}`);
}

// ------------------------------------------------------------------ helpers
async function waitForRender(page) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch {
    /* fonts/CDN may keep network busy */
  }
  await page.waitForFunction(
    () => {
      const el = document.getElementById('__dc');
      return !!el && el.children.length > 0 && el.innerText.trim().length > 0;
    },
    null,
    { timeout: 15000 },
  );
  await page.waitForTimeout(600);
}

async function openApp(context, file) {
  const page = await context.newPage();
  page.__file = file;
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(String(e.message || e)));
  openPages.push(page);
  currentPage = page;
  await page.goto(BASE_URL + file, { waitUntil: 'load', timeout: 30000 });
  await waitForRender(page);
  return page;
}

async function readBus(page) {
  return page.evaluate((key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, BUS_KEY);
}

/** Events present in `after` that were not in `before` (seed ids s1..s10 ignored). */
function newEvents(before, after) {
  const seen = new Set((before || []).map((e) => e.id));
  return (after || []).filter((e) => !seen.has(e.id) && !/^s\d+$/.test(String(e.id)));
}

/** Poll the bus until a new event matching `pred` shows up. */
async function waitForBusEvent(page, before, pred, timeout = 5000) {
  const t0 = Date.now();
  for (;;) {
    const fresh = newEvents(before, await readBus(page)).filter(pred);
    if (fresh.length) return fresh[0];
    if (Date.now() - t0 > timeout) throw new Error('no matching new event in localStorage bus');
    await page.waitForTimeout(250);
  }
}

function textOf(page) {
  return page.evaluate(() => {
    const el = document.getElementById('__dc');
    return (el ? el.innerText : document.body.innerText) || '';
  });
}

async function waitForText(page, re, timeout = POLL_WAIT) {
  try {
    await page.waitForFunction(
      ([src, flags]) => {
        const el = document.getElementById('__dc');
        return new RegExp(src, flags).test((el ? el.innerText : document.body.innerText) || '');
      },
      [re.source, re.flags],
      { timeout },
    );
  } catch {
    const t = await textOf(page);
    throw new Error(`text ${re} not found on ${page.__file || 'page'} (page text starts: "${t.replace(/\s+/g, ' ').slice(0, 120)}...")`);
  }
}

async function goSection(page, label) {
  const re = new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'i');
  const btn = page.locator('nav button').filter({ hasText: re }).first();
  if (!(await btn.count())) throw new Error(`sidebar button "${label}" not found in ${page.__file}`);
  await btn.click();
  await page.waitForTimeout(500);
}

async function clickButton(page, re, opts = {}) {
  const btn = page.locator('button').filter({ hasText: re }).first();
  try {
    await btn.waitFor({ state: 'visible', timeout: opts.timeout || 5000 });
  } catch {
    throw new Error(`button ${re} not found/visible on ${page.__file}`);
  }
  if (await btn.isDisabled()) throw new Error(`button ${re} is disabled on ${page.__file}`);
  await btn.click();
}

// -------------------------------------------------------------------- flows
async function flowPrescription(context) {
  currentFlow = '1. Prescription: Doctor -> Pharmacist -> CitizenMedicines';
  console.log(`\n${currentFlow}`);

  // Pre-open the pharmacist so we can test live polling, not just read-on-mount.
  const pharmLive = await openApp(context, 'Pharmacist.dc.html');
  const doctor = await openApp(context, 'Doctor.dc.html');
  const before = await readBus(doctor);

  if (!(await check('Doctor: open Prescriptions section', () => goSection(doctor, 'Prescriptions')))) return;
  if (!(await check('Doctor: click "e-Sign and send"', () => clickButton(doctor, /e-Sign\s*(and|&)\s*send/i)))) return;

  let rxEv;
  if (
    !(await check('Bus: new prescription event (from doctor, to pharmacist + citizen)', async () => {
      rxEv = await waitForBusEvent(doctor, before, (e) => e.type === 'prescription');
      if (rxEv.from !== 'doctor') throw new Error(`from is "${rxEv.from}", expected doctor`);
      for (const r of ['pharmacist', 'citizen']) {
        if (!rxEv.to.includes(r)) throw new Error(`"to" is missing ${r}: ${JSON.stringify(rxEv.to)}`);
      }
      return `${rxEv.id} "${rxEv.title}" at ${rxEv.at}`;
    }))
  ) {
    return;
  }

  const sentRe = new RegExp(`Sent from the Doctor app at ${rxEv.at}`);

  // Live update on a page that was already open (2 s poll).
  currentPage = pharmLive;
  await check('Pharmacist (already open): prescription appears without reload', async () => {
    await waitForText(pharmLive, sentRe);
  });

  // Fresh page (read on mount) - the one we then act on.
  const pharm = await openApp(context, 'Pharmacist.dc.html');
  if (!(await check('Pharmacist (fresh load): prescription in queue + "Connected apps" feed', async () => {
    await waitForText(pharm, sentRe, 4000);
    await waitForText(pharm, /Connected apps/i, 2000);
    const t = await textOf(pharm);
    if (!/e-Signed prescription\s*·\s*Anjali Menon/.test(t)) throw new Error('feed does not show "e-Signed prescription · Anjali Menon"');
  }))) {
    return;
  }

  const beforeDisp = await readBus(pharm);
  if (!(await check('Pharmacist: click "Verify signature & QR"', () => clickButton(pharm, /Verify signature/i)))) return;
  if (!(await check('Pharmacist: verification completes', () => waitForText(pharm, /Valid digital signature/i, 5000)))) return;
  if (!(await check('Pharmacist: click "Dispense all"', () => clickButton(pharm, /Dispense all/i)))) return;

  let dispEv;
  if (
    !(await check('Bus: new dispensed event (to citizen + doctor/pharmacyadmin)', async () => {
      dispEv = await waitForBusEvent(pharm, beforeDisp, (e) => e.type === 'dispensed');
      if (dispEv.from !== 'pharmacist') throw new Error(`from is "${dispEv.from}", expected pharmacist`);
      if (!dispEv.to.includes('citizen')) throw new Error(`"to" is missing citizen: ${JSON.stringify(dispEv.to)}`);
      if (!dispEv.to.includes('doctor')) {
        note(`dispensed event goes to ${JSON.stringify(dispEv.to)} - the doctor is NOT a recipient (brief expected citizen + doctor)`);
      }
      return `${dispEv.id} "${dispEv.title}" at ${dispEv.at}`;
    }))
  ) {
    return;
  }

  const med = await openApp(context, 'CitizenMedicines.dc.html');
  await check('CitizenMedicines: "Dispensed <time>" status for the new dispense', async () => {
    await waitForText(med, new RegExp(`Dispensed\\s+${dispEv.at}`), 4000);
  });
  await check('CitizenMedicines: "Ready to collect" notice shown', () => waitForText(med, /Ready to collect/i, 2000));
}

async function flowLab(context) {
  currentFlow = '2. Lab order: Doctor -> LabTech -> Doctor + CitizenDocuments';
  console.log(`\n${currentFlow}`);

  const doctor = await openApp(context, 'Doctor.dc.html');
  const before = await readBus(doctor);

  if (!(await check('Doctor: open Orders section', () => goSection(doctor, 'Orders')))) return;
  // Defaults: Anjali Menon / HbA1c (lab) / Routine.
  if (!(await check('Doctor: click "Place order" (HbA1c, lab)', () => clickButton(doctor, /^\s*Place order\s*$/i)))) return;

  let orderEv;
  if (
    !(await check('Bus: new lab-order event (from doctor, to labtech + citizen)', async () => {
      orderEv = await waitForBusEvent(doctor, before, (e) => e.type === 'lab-order');
      if (orderEv.from !== 'doctor') throw new Error(`from is "${orderEv.from}", expected doctor`);
      for (const r of ['labtech', 'citizen']) {
        if (!orderEv.to.includes(r)) throw new Error(`"to" is missing ${r}: ${JSON.stringify(orderEv.to)}`);
      }
      return `${orderEv.id} "${orderEv.title}"`;
    }))
  ) {
    return;
  }

  const lab = await openApp(context, 'LabTech.dc.html');
  // The new order row's Accept button has aria-label "Accept LO-xxxxx, HbA1c" (exact test name).
  // The seeded order is "HbA1c, lipid profile", so the exact suffix identifies the new one.
  const acceptBtn = lab.locator('button[aria-label^="Accept "][aria-label$=", HbA1c"]').first();
  if (!(await check('LabTech: new order appears in "Incoming orders"', async () => {
    try {
      await acceptBtn.waitFor({ state: 'visible', timeout: 4000 });
    } catch {
      throw new Error('no Accept button with aria-label "Accept LO-..., HbA1c" - order not in queue');
    }
    return await acceptBtn.getAttribute('aria-label');
  }))) {
    return;
  }

  if (!(await check('LabTech: click "Accept" on the order', async () => {
    await acceptBtn.click();
    await waitForText(lab, /Accepted\s*·\s*collect sample/i, 3000);
  }))) {
    return;
  }

  const beforeRes = await readBus(lab);
  if (!(await check('LabTech: open "Upload report" section', () => goSection(lab, 'Upload report')))) return;
  if (!(await check('LabTech: choose a PDF report', async () => {
    await lab.locator('button[aria-label="Choose a PDF report to upload"]').click();
    await lab.waitForTimeout(300);
  }))) {
    return;
  }
  if (!(await check('LabTech: click "Attach to order and notify"', () => clickButton(lab, /Attach to order and notify/i)))) return;

  let resEv;
  if (
    !(await check('Bus: new lab-result event (from labtech, to doctor + citizen)', async () => {
      resEv = await waitForBusEvent(lab, beforeRes, (e) => e.type === 'lab-result');
      if (resEv.from !== 'labtech') throw new Error(`from is "${resEv.from}", expected labtech`);
      for (const r of ['doctor', 'citizen']) {
        if (!resEv.to.includes(r)) throw new Error(`"to" is missing ${r}: ${JSON.stringify(resEv.to)}`);
      }
      return `${resEv.id} "${resEv.title}"`;
    }))
  ) {
    return;
  }
  note('LabTech upload dropdown only offers its fixed orders (LO-55120/55109/55097), so the result is for the HbA1c, FBS order, not the order the doctor just placed - prototype limitation');

  // The lab-result title is "Result ready · <tests>"; seed s4 is "Lipid profile", so this is unique.
  const resultRe = new RegExp(resEv.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'));

  const doctor2 = await openApp(context, 'Doctor.dc.html');
  await check('Doctor (fresh load): lab result visible', () => waitForText(doctor2, resultRe, 4000));

  const docs = await openApp(context, 'CitizenDocuments.dc.html');
  await check('CitizenDocuments: new lab result listed', async () => {
    const tests = resEv.title.replace(/^Result ready\s*·\s*/, '');
    await waitForText(docs, new RegExp(tests.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 4000);
  });
}

async function flowAlert(context) {
  currentFlow = '3. District alert: DistrictAdmin -> CitizenAlerts';
  console.log(`\n${currentFlow}`);

  const unique = `E2E advisory ${Date.now().toString(36)}`;
  const admin = await openApp(context, 'DistrictAdmin.dc.html');
  const before = await readBus(admin);

  if (!(await check('DistrictAdmin: open "Health alerts" section', () => goSection(admin, 'Health alerts')))) return;
  if (!(await check('DistrictAdmin: set a unique alert title', async () => {
    const field = admin.getByLabel('Title', { exact: true }).first();
    await field.waitFor({ state: 'visible', timeout: 4000 });
    await field.fill(unique);
    await admin.waitForTimeout(300);
    const v = await field.inputValue();
    if (v !== unique) throw new Error(`title field holds "${v}"`);
  }))) {
    return;
  }
  if (!(await check('DistrictAdmin: click "Send advisory"', () => clickButton(admin, /^\s*Send advisory\s*$/i)))) return;

  let alertEv;
  if (
    !(await check('Bus: new alert event (from district, to citizen)', async () => {
      alertEv = await waitForBusEvent(admin, before, (e) => e.type === 'alert' && e.title.includes(unique));
      if (alertEv.from !== 'district') throw new Error(`from is "${alertEv.from}", expected district`);
      if (!alertEv.to.includes('citizen')) throw new Error(`"to" is missing citizen: ${JSON.stringify(alertEv.to)}`);
      return `${alertEv.id} "${alertEv.title}" to ${JSON.stringify(alertEv.to)}`;
    }))
  ) {
    return;
  }

  const alerts = await openApp(context, 'CitizenAlerts.dc.html');
  await check('CitizenAlerts: the new alert is listed', () => waitForText(alerts, new RegExp(unique), 4000));
}

// --------------------------------------------------------------------- main
async function main() {
  console.log(`CareFusion AI cross-app test  -  ${BASE_URL}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: process.env.HEADED ? false : true });
  } catch (e) {
    console.error(`Could not launch Chromium: ${e.message.split('\n')[0]}`);
    console.error('Hint: set LD_LIBRARY_PATH for the Playwright Chromium libraries and retry.');
    process.exit(2);
  }

  // Quick reachability check so we fail with a clear message.
  try {
    const probe = await fetch(BASE_URL + 'Doctor.dc.html');
    if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
  } catch (e) {
    console.error(`Cannot reach ${BASE_URL}Doctor.dc.html (${e.message}). Start the prototype server first.`);
    await browser.close();
    process.exit(2);
  }

  // ONE context for everything => shared localStorage across all pages.
  const context = await browser.newContext({ viewport: { width: 1440, height: HEIGHT } });
  // Start from a clean bus so the run is repeatable (pages then fall back to their seed list).
  {
    const boot = await context.newPage();
    await boot.goto(BASE_URL + 'Doctor.dc.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await boot.evaluate((key) => localStorage.removeItem(key), BUS_KEY);
    await boot.close();
  }

  const flows = [flowPrescription, flowLab, flowAlert];
  for (const flow of flows) {
    try {
      await flow(context);
    } catch (err) {
      const shot = await snap(currentPage, 'unexpected-error');
      const msg = String(err && err.message ? err.message : err).split('\n')[0];
      results.push({ flow: currentFlow, name: 'unexpected error', ok: false, detail: msg, shot });
      console.log(`  ${C.r}FAIL${C.x} unexpected error: ${msg}${shot ? `\n       screenshot: ${shot}` : ''}`);
    }
  }

  // Page errors seen during the run (informational).
  const errs = openPages.flatMap((p) => (p.__errors || []).map((e) => `${p.__file}: ${e}`));
  if (errs.length) {
    console.log(`\n${C.y}Page errors seen (informational):${C.x}`);
    [...new Set(errs)].slice(0, 10).forEach((e) => console.log(`  - ${e}`));
  }

  if (process.env.KEEP_OPEN_MS) await new Promise((r) => setTimeout(r, Number(process.env.KEEP_OPEN_MS)));
  await browser.close();

  // ------------------------------------------------------------- summary
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log('\n==================== SUMMARY ====================');
  let last = '';
  for (const r of results) {
    if (r.flow !== last) {
      console.log(`\n${r.flow}`);
      last = r.flow;
    }
    console.log(`  ${r.ok ? C.g + 'PASS' : r.skipped ? C.y + 'SKIP' : C.r + 'FAIL'}${C.x} ${r.name}`);
  }
  console.log(`\n${passed} passed, ${failed.length} failed, ${results.length} checks total`);
  if (failed.length) {
    console.log(`Failure screenshots: ${SHOTS_DIR}`);
    process.exit(1);
  }
  console.log(`${C.g}ALL CROSS-APP CHECKS PASSED${C.x}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
