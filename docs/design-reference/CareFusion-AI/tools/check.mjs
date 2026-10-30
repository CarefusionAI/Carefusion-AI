#!/usr/bin/env node
// CareFusion AI prototype checker (Playwright).
//
// Usage:  node tools/check.mjs [PageName ...]
//   - No args: checks every *.dc.html in ../site
//   - With args: checks only those pages (with or without .dc.html suffix)
// Env:    BASE_URL (default http://localhost:8080/), HEIGHT (default 900)
//
// For every page it opens the page at its $preview width, waits for the
// runtime to render into #__dc, collects runtime/console/page errors, runs the
// layout checks, and saves a full-page screenshot. For pages with a
// CareFusion.Sidebar (<nav class="cf-sidebar">) it then clicks each sidebar
// button, re-runs the checks, and screenshots each section.
//
// Playwright is resolved from /tmp/pw-checker/node_modules/playwright.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/tmp/pw-checker/package.json');
const { chromium } = require('/tmp/pw-checker/node_modules/playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '../site');
const SHOTS_DIR = path.resolve(__dirname, 'shots');
const BASE_URL = (process.env.BASE_URL || 'http://localhost:8080/').replace(/\/?$/, '/');
const VIEWPORT_HEIGHT = Number(process.env.HEIGHT || 900);
const DEFAULT_WIDTH = 1440;
const EMPTY_SPACE_LIMIT = 140; // px of empty space allowed below a card's last content
const CARD_SELECTOR = '.box, .cf-card, .card, .panel';
const SIDEBAR_BUTTONS = 'nav.cf-sidebar button, .cf-sidebar button, nav button, [class*="sidebar"] button';

fs.mkdirSync(SHOTS_DIR, { recursive: true });

const slug = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

function listPages() {
  let files = fs.readdirSync(SITE_DIR).filter((f) => f.endsWith('.dc.html')).sort();
  const wanted = process.argv.slice(2);
  if (wanted.length) {
    const names = wanted.map((w) => (w.endsWith('.dc.html') ? w : `${w}.dc.html`));
    files = files.filter((f) => names.includes(f));
  }
  return files;
}

function previewWidth(file) {
  try {
    const html = fs.readFileSync(path.join(SITE_DIR, file), 'utf8');
    const m = html.match(/data-props='([^']*)'/) || html.match(/data-props="([^"]*)"/);
    if (m) {
      const json = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
      const w = json && json.$preview && Number(json.$preview.width);
      if (w > 0) return w;
    }
  } catch {
    /* fall through */
  }
  return DEFAULT_WIDTH;
}

// ---- in-page checks (serialized into the browser) ----
function inPageChecks({ cardSelector, emptyLimit }) {
  const out = { overflow: null, brokenImages: [], hrefs: [], emptyCards: [] };
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth) {
    // find the widest offenders to help debugging
    const offenders = [];
    for (const el of document.querySelectorAll('#__dc *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > de.clientWidth + 1) {
        offenders.push({
          el: describe(el),
          right: Math.round(r.right),
        });
      }
    }
    offenders.sort((a, b) => b.right - a.right);
    out.overflow = { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, offenders: offenders.slice(0, 5) };
  }

  function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.');
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return t ? `${s} "${t}"` : s;
  }
  function visible(el) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  }

  for (const img of document.querySelectorAll('img')) {
    if (!visible(img)) continue;
    if (img.complete && img.naturalWidth === 0) out.brokenImages.push(img.getAttribute('src') || '(no src)');
  }

  for (const a of document.querySelectorAll('a[href]')) out.hrefs.push(a.getAttribute('href'));

  for (const card of document.querySelectorAll(cardSelector.split(',').map((s) => '#__dc ' + s.trim()).join(','))) {
    if (!visible(card)) continue;
    const cr = card.getBoundingClientRect();
    if (cr.height <= emptyLimit) continue;
    let lastBottom = null;
    // text nodes and elements with real size count as content
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      let r;
      if (n.nodeType === 3) {
        if (!n.nodeValue.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        r = range.getBoundingClientRect();
      } else {
        if (!visible(n)) continue;
        // skip pure layout wrappers that merely stretch (no text, has element children)
        if (n.children.length && !n.matches('img,svg,canvas,input,button,select,textarea,table,hr')) continue;
        r = n.getBoundingClientRect();
      }
      if (r.width === 0 && r.height === 0) continue;
      if (lastBottom === null || r.bottom > lastBottom) lastBottom = r.bottom;
    }
    if (lastBottom === null) {
      out.emptyCards.push({ el: describe(card), height: Math.round(cr.height), gap: Math.round(cr.height), note: 'no content' });
      continue;
    }
    const gap = Math.round(cr.bottom - lastBottom);
    if (gap > emptyLimit) out.emptyCards.push({ el: describe(card), height: Math.round(cr.height), gap });
  }
  return out;
}

function brokenDcLinks(hrefs, fileSet) {
  const bad = [];
  for (const href of hrefs) {
    if (!href) continue;
    const clean = href.split('#')[0].split('?')[0];
    if (!/\.dc\.html$/i.test(clean)) continue;
    if (/^[a-z]+:\/\//i.test(clean) && !clean.startsWith(BASE_URL)) continue; // external
    const base = decodeURIComponent(clean.replace(/^.*\//, ''));
    if (!fileSet.has(base)) bad.push(href);
  }
  return [...new Set(bad)];
}

async function waitForRender(page) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch {
    /* fonts/CDN might keep network busy; continue */
  }
  await page.waitForFunction(
    () => {
      const el = document.getElementById('__dc');
      return !!el && el.children.length > 0 && el.innerText.trim().length > 0;
    },
    null,
    { timeout: 15000 },
  );
  await page.waitForTimeout(600); // let React settle
}

async function runChecks(page, ctx, label, state, fileSet) {
  const issues = [];
  const add = (type, detail) => issues.push({ state: label, type, detail });

  // runtime errors (only new ones since last check)
  const dcErrors = await page.evaluate(() => (Array.isArray(window.__dcErrors) ? window.__dcErrors.slice() : []));
  for (const e of dcErrors.slice(state.dcSeen)) add('dcError', e);
  state.dcSeen = dcErrors.length;

  for (const e of new Set(ctx.consoleErrors.splice(0))) {
    if (state.seenConsole.has(e)) continue;
    state.seenConsole.add(e);
    add('consoleError', e);
  }
  for (const e of ctx.pageErrors.splice(0)) add('pageError', e);
  for (const e of ctx.failedRequests.splice(0)) add('failedRequest', e);

  const r = await page.evaluate(inPageChecks, { cardSelector: CARD_SELECTOR, emptyLimit: EMPTY_SPACE_LIMIT });
  if (r.overflow) add('horizontalOverflow', r.overflow);
  for (const src of r.brokenImages) add('brokenImage', src);
  for (const href of brokenDcLinks(r.hrefs, fileSet)) add('brokenLink', href);
  for (const c of r.emptyCards) add('emptyCardSpace', c);
  return issues;
}

async function listSidebarButtons(page) {
  return page.evaluate((sel) => {
    const nav = document.querySelector('#__dc nav.cf-sidebar, #__dc .cf-sidebar') || document.querySelector('#__dc nav');
    if (!nav) return [];
    const btns = Array.from(nav.querySelectorAll('button'));
    return btns.map((b, i) => ({
      index: i,
      id: b.getAttribute('data-section-id') || b.getAttribute('data-id') || '',
      label: (b.textContent || '').trim().replace(/\s+/g, ' '),
    }));
  }, SIDEBAR_BUTTONS);
}

async function checkPage(browser, file, fileSet) {
  const name = file.replace(/\.dc\.html$/, '');
  const width = previewWidth(file);
  const result = { file, width, issues: [], sections: [], error: null };

  const context = await browser.newContext({ viewport: { width, height: VIEWPORT_HEIGHT } });
  const page = await context.newPage();
  const ctx = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') {
      // React warnings use %s placeholders; join the args for a readable message and drop the stack
      const args = m.args().length ? m.text().split('\n    at ')[0] : m.text();
      ctx.consoleErrors.push(args.replace(/%s/g, '').replace(/\s+/g, ' ').trim());
    }
  });
  page.on('pageerror', (e) => ctx.pageErrors.push(String(e && e.message ? e.message : e)));
  page.on('response', (r) => {
    if (r.status() >= 400) ctx.failedRequests.push(`${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => ctx.failedRequests.push(`FAILED ${r.url()} (${r.failure() && r.failure().errorText})`));

  const state = { dcSeen: 0, seenConsole: new Set() };
  try {
    await page.goto(BASE_URL + file, { waitUntil: 'load', timeout: 30000 });
    await waitForRender(page);

    result.issues.push(...(await runChecks(page, ctx, 'initial', state, fileSet)));
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });

    // sidebar sections
    const buttons = await listSidebarButtons(page);
    const usedIds = new Set();
    for (const b of buttons) {
      let sectionId = slug(b.id || b.label) || `item${b.index}`;
      if (usedIds.has(sectionId)) sectionId += `-${b.index}`;
      usedIds.add(sectionId);
      const sec = { sectionId, label: b.label, issues: [] };
      try {
        // re-query by index: the sidebar re-renders after each click
        const clicked = await page.evaluate((idx) => {
          const nav = document.querySelector('#__dc nav.cf-sidebar, #__dc .cf-sidebar') || document.querySelector('#__dc nav');
          const btn = nav && nav.querySelectorAll('button')[idx];
          if (!btn) return false;
          btn.scrollIntoView({ block: 'center' });
          btn.click();
          return true;
        }, b.index);
        if (!clicked) throw new Error('sidebar button disappeared');
        await page.waitForTimeout(500);
        await page.evaluate(() => window.scrollTo(0, 0));
        sec.issues = await runChecks(page, ctx, `section:${sectionId}`, state, fileSet);
        await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${sectionId}.png`), fullPage: true });
      } catch (e) {
        sec.issues.push({ state: `section:${sectionId}`, type: 'sectionError', detail: String(e.message || e) });
      }
      result.sections.push({ sectionId, label: b.label });
      result.issues.push(...sec.issues);
    }
  } catch (e) {
    result.error = String(e.message || e);
    result.issues.push({ state: 'load', type: 'pageCrash', detail: result.error });
    try {
      await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-ERROR.png`) });
    } catch {
      /* ignore */
    }
  } finally {
    await context.close().catch(() => {});
  }
  return result;
}

async function main() {
  const files = listPages();
  if (!files.length) {
    console.error('No *.dc.html files found in ' + SITE_DIR);
    process.exit(2);
  }
  const fileSet = new Set(fs.readdirSync(SITE_DIR).filter((f) => f.endsWith('.dc.html')));

  const browser = await chromium.launch();
  const results = [];
  for (const file of files) {
    process.stderr.write(`checking ${file} ... `);
    let r;
    try {
      r = await checkPage(browser, file, fileSet);
    } catch (e) {
      r = { file, width: previewWidth(file), issues: [{ state: 'load', type: 'pageCrash', detail: String(e.message || e) }], sections: [], error: String(e.message || e) };
    }
    process.stderr.write(`${r.issues.length} issue(s)${r.sections.length ? `, ${r.sections.length} sidebar section(s)` : ''}\n`);
    results.push(r);
  }
  await browser.close();

  const report = {};
  let total = 0;
  for (const r of results) {
    if (r.issues.length) {
      report[r.file] = r.issues;
      total += r.issues.length;
    }
  }
  console.log(JSON.stringify(report, null, 2));

  const withIssues = Object.keys(report);
  console.log('\n===== SUMMARY =====');
  console.log(`Pages checked : ${results.length}`);
  console.log(`Sidebar pages : ${results.filter((r) => r.sections.length).length} (${results.reduce((n, r) => n + r.sections.length, 0)} sections)`);
  console.log(`Total issues  : ${total}`);
  console.log(`Pages w/ issues: ${withIssues.length}`);
  for (const f of withIssues) {
    const byType = {};
    for (const i of report[f]) byType[i.type] = (byType[i.type] || 0) + 1;
    console.log(`  - ${f}: ${Object.entries(byType).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  console.log(`Screenshots   : ${SHOTS_DIR}`);
  process.exitCode = total ? 1 : 0;
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(2);
});
