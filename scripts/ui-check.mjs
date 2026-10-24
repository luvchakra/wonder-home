#!/usr/bin/env node
// Text before pixels: open a page, optionally click, then print each matched
// element's text and box, one line each. Token-cheap alternative to a screenshot.
//
//   node scripts/ui-check.mjs <path> [--base http://localhost:3000] [--width 360]
//     [--find role:name]... [--click role:name]... [--state storage.json] [--shot out.jpg]
//
// role is an ARIA role (button, link, heading, textbox, ...) or `text` for visible
// text. name is a case-insensitive substring. Without --find it lists headings and
// buttons. --shot writes a 1x JPEG at quality 60, cropped to the matched elements.
// Exit code 2 when a --find or --click matches nothing.

import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const MAX_LINES_PER_SPEC = 50;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: 'string', default: 'http://localhost:3000' },
    width: { type: 'string', default: '360' },
    height: { type: 'string', default: '740' },
    find: { type: 'string', multiple: true, default: [] },
    click: { type: 'string', multiple: true, default: [] },
    state: { type: 'string' },
    shot: { type: 'string' },
  },
});

if (positionals.length !== 1) {
  console.error('usage: node scripts/ui-check.mjs <path> [--base URL] [--width 360] [--find role:name] [--click role:name] [--state file.json] [--shot out.jpg]');
  process.exit(1);
}

const [path] = positionals;
const finds = values.find.length ? values.find : ['heading:', 'button:'];
let unmatched = false;

function locate(page, spec) {
  const at = spec.indexOf(':');
  if (at < 0) throw new Error(`expected role:name, got "${spec}"`);
  const role = spec.slice(0, at).trim();
  const name = spec.slice(at + 1).trim();
  const found = role === 'text' ? page.getByText(name) : page.getByRole(role, { name });
  return found.locator('visible=true');
}

const oneLine = (s) => s.replace(/\s+/g, ' ').trim();
const round = (n) => Math.round(n);

const browser = await chromium.launch();
try {
  const width = Number(values.width);
  const context = await browser.newContext({
    viewport: { width, height: Number(values.height) },
    deviceScaleFactor: 1,
    storageState: values.state,
  });
  const page = await context.newPage();
  await page.goto(new URL(path, values.base).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

  for (const spec of values.click) {
    const target = locate(page, spec).first();
    if ((await target.count()) === 0) {
      console.log(`NO MATCH (click) ${spec}`);
      unmatched = true;
      continue;
    }
    await target.click();
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    console.log(`clicked ${spec}`);
  }

  const boxes = [];
  for (const spec of finds) {
    const matches = locate(page, spec);
    const total = await matches.count();
    if (total === 0) {
      console.log(`NO MATCH ${spec}`);
      unmatched = true;
      continue;
    }
    for (let i = 0; i < Math.min(total, MAX_LINES_PER_SPEC); i++) {
      const el = matches.nth(i);
      const text = oneLine(await el.evaluate((e) => e.innerText || e.value || e.getAttribute('aria-label') || ''));
      const box = await el.boundingBox();
      if (!box) continue;
      boxes.push(box);
      console.log(`${spec} | ${JSON.stringify(text)} | x=${round(box.x)} y=${round(box.y)} w=${round(box.width)} h=${round(box.height)}`);
    }
    if (total > MAX_LINES_PER_SPEC) console.log(`${spec} | ... ${total - MAX_LINES_PER_SPEC} more`);
  }

  const { clientWidth, scrollWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  console.log(`page width=${clientWidth} scrollWidth=${scrollWidth}${scrollWidth > clientWidth ? '  HORIZONTAL OVERFLOW' : ''}`);

  if (values.shot) {
    const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    const clip = boxes.length
      ? (() => {
          const left = Math.min(...boxes.map((b) => b.x)) - 8;
          const top = Math.min(...boxes.map((b) => b.y)) - 8;
          const right = Math.max(...boxes.map((b) => b.x + b.width)) + 8;
          const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + 8;
          return { x: Math.max(0, left) + scroll.x, y: Math.max(0, top) + scroll.y, width: right - Math.max(0, left), height: bottom - Math.max(0, top) };
        })()
      : { x: 0, y: 0, width, height: Number(values.height) };
    await page.screenshot({ path: values.shot, type: 'jpeg', quality: 60, scale: 'css', fullPage: true, clip });
    console.log(`shot ${values.shot} (${round(clip.width)}x${round(clip.height)})`);
  }
} finally {
  await browser.close();
}

process.exit(unmatched ? 2 : 0);
