import { launch, openGame, sleep, shotDir } from './harness.mjs';
const b = await launch();
const { page, logs } = await openGame(b);
const t0 = Date.now();
try { await page.waitForSelector('#title', { timeout: 120000 }); } catch (e) { console.log('NO TITLE'); }
console.log('title after', ((Date.now() - t0) / 1000).toFixed(1), 's');
await sleep(3000);
await page.screenshot({ path: shotDir + '/01_title.png' });
const info = await page.evaluate(() => { const G = window.__rivora; return G ? { fps: G.fps, calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles, veh: G.vehicles.list.length, npcs: G.npcs.list.filter(n=>n.active).length, traffic: G.traffic.cars.length } : null; });
console.log(JSON.stringify(info));
console.log(logs.slice(0, 30).join('\n'));
await b.close();
