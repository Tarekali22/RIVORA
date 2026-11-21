// Bundles src/ into a single self-contained HTML artifact (dist/rivora.html) + a local test wrapper.
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const r = await build({ entryPoints: [path.join(root, 'src/main.js')], bundle: true, format: 'iife', write: false, minify: !process.argv.includes('--dev'), target: 'es2020', charset: 'ascii', legalComments: 'none', sourcemap: false, logLevel: 'warning' });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const three = '<script src="https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js"></script>\n<script>if(!window.THREE){document.write(\'<script src="https://unpkg.com/three@0.158.0/build/three.min.js"><\\/script>\')}</script>';
let html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
html = html.replace('<!--THREE-->', () => three).replace('<!--BUNDLE-->', () => '<script>\n' + js + '\n</script>');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/rivora.html'), html);
// local test page mimics the artifact skeleton (doctype + viewport-fit=cover)
const wrap = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}</style></head><body>' + html + '</body></html>';
fs.writeFileSync(path.join(root, 'dist/test.html'), wrap);
console.log('built dist/rivora.html', (html.length / 1024).toFixed(1) + ' KB');

// ---- multi-file "realistic" build (dist/web): local three r160 + Rocketbox people + real cars + bloom ----
{
  const web = path.join(root, 'dist/web');
  fs.rmSync(web, { recursive: true, force: true }); fs.mkdirSync(path.join(web, 'a'), { recursive: true });
  const head = '<script type="importmap">{"imports":{"three":"./lib/three.module.min.js","three/addons/":"./lib/addons/"}}</script>';
  let page = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
  page = page.replace('<!--THREE-->', () => head).replace('<!--BUNDLE-->', () => '<script type="module" src="./boot.js"></script>');
  fs.writeFileSync(path.join(web, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}</style></head><body>' + page + '</body></html>');
  fs.writeFileSync(path.join(web, 'game.js'), r.outputFiles[0].text);
  fs.copyFileSync(path.join(root, 'src/web/boot.js'), path.join(web, 'boot.js'));
  fs.cpSync(path.join(root, 'vendor/three'), path.join(web, 'lib'), { recursive: true });
  for (const f of fs.readdirSync(path.join(root, 'assets/real'))) fs.copyFileSync(path.join(root, 'assets/real', f), path.join(web, 'a', f));
  console.log('built dist/web (multi-file realistic build)');
}
