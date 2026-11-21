// Extracts human-visible English strings from the source for translation.
// Template literals keep their ${...} slots as {0},{1}...; HTML templates are split at tags.
import fs from 'fs'; import path from 'path';
const root = path.resolve(process.argv[2] || 'src');
const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(js|html)$/.test(f) && !/web\/|realskin|realcars|geo\.js|util\.js|textures\.js/.test(p)) files.push(p); } })(root);
const out = new Map();
const human = (s) => /[a-z]/.test(s) && /[A-Za-z]{2}/.test(s) && !/^[a-z0-9_.\-/#:]+$/.test(s) && !/^(rgba?|#|url\(|var\(|translate|linear-gradient|calc\()/.test(s) && !/[{};=]\s*$/.test(s) && !/^\s*[.#]?[a-z-]+\s*\{/.test(s) && !/\b(px|em|vh|vw)\b.*[;:]/.test(s) && !/^[A-Z][a-zA-Z]+$/.test(s) || /^[A-Z][a-z]+( [A-Za-z&'’.-]+)*[.!?]?$/.test(s);
function add(s, file) {
  s = s.replace(/\s+/g, ' ').trim(); if (s.length < 2 || s.length > 400) return;
  if (!human(s)) return; if (/^(Key|Digit|Arrow|Mouse|Shift|Control)[A-Z0-9]/.test(s)) return;
  if (/^(sans-serif|monospace|anonymous|use strict)/.test(s)) return;
  if (!out.has(s)) out.set(s, file);
}
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8'), rel = path.relative(root, f);
  const re = /(['"])((?:\\.|(?!\1)[^\\\n])*)\1|`((?:\\.|\$\{(?:[^{}]|\{[^{}]*\})*\}|[^`\\])*)`/g; let m;
  const body = f.endsWith('.html') ? src.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '') : src;
  if (f.endsWith('.html')) { for (const t of body.split(/<[^>]+>/)) add(t, rel); }
  while ((m = re.exec(src))) {
    let s = m[2] ?? m[3]; if (s == null) continue;
    let k = 0; s = s.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, () => '{' + (k++) + '}');
    s = s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, ' ');
    if (/<[a-z][^>]*>/i.test(s)) { for (const part of s.split(/<[^>]*>/)) add(part, rel); } else add(s, rel);
  }
}
const arr = [...out.entries()].map(([s, f]) => ({ s, f }));
fs.writeFileSync(process.argv[3] || 'tools/i18n_strings.json', JSON.stringify(arr, null, 0));
console.log('strings', arr.length, 'chars', arr.reduce((a, b) => a + b.s.length, 0));
const byF = {}; for (const a of arr) byF[a.f] = (byF[a.f] || 0) + 1; console.log(JSON.stringify(byF));
