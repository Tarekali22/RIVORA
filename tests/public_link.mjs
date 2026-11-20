// Opens the public artifact URL as an anonymous visitor and checks that RIVORA boots inside the viewer.
import { launch, THREE_LOCAL, sleep, shotDir } from './harness.mjs';
const LINK = process.argv[2];
const b = await launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }); const page = await ctx.newPage();
const blocked = new Set(); page.on('requestfailed', (r) => blocked.add(new URL(r.url()).host + ' ' + (r.failure() || {}).errorText));
await ctx.route('**/three.min.js', (r) => r.fulfill({ path: THREE_LOCAL, contentType: 'application/javascript' })); // container cannot reach jsDelivr
await page.goto(LINK, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto', e.message));
let found = null;
for (let i = 0; i < 90 && !found; i++) {
  await sleep(2000);
  for (const f of page.frames()) { try { const t = await f.evaluate(() => ({ title: document.title, loading: !!document.querySelector('#loading'), titleScreen: !!document.querySelector('#title'), err: (document.getElementById('err') || {}).textContent || '' })); if (t.titleScreen || t.loading || /RIVORA/.test(t.title)) { found = { url: f.url().slice(0, 80), ...t }; if (t.titleScreen) break; } } catch (e) {} }
  if (found && !found.titleScreen) found = found.loading ? found : null;
}
console.log('frames:', page.frames().map((f) => f.url().slice(0, 70)).join(' | '));
console.log('result:', JSON.stringify(found));
console.log('failed hosts:', [...blocked].slice(0, 8).join(' ; '));
await page.screenshot({ path: shotDir + '/40_public_link.png' });
await b.close();
