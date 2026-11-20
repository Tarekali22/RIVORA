// Shared Playwright harness: serves the built page with three.js routed to the local copy.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
import path from 'path';
import fs from 'fs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const THREE_LOCAL = path.join(root, 'tools/node_modules/three/build/three.min.js');
export async function launch() {
  return chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
}
export async function openGame(browser, opts = {}) {
  const ctx = await browser.newContext(opts.device ? { ...devices[opts.device], deviceScaleFactor: 1 } : { viewport: opts.viewport || { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await page.route('**/three.min.js', (r) => r.fulfill({ path: THREE_LOCAL, contentType: 'application/javascript' }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('file://' + path.join(root, 'dist/test.html'));
  return { ctx, page, logs };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const shotDir = path.join(root, 'tests/screens'); fs.mkdirSync(shotDir, { recursive: true });
