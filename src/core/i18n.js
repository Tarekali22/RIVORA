// Arabic / English localisation layer.
// - T(s): translate a string for the current language (exact match, case-insensitive match, {n} patterns, " · " segments).
// - The DOM translator watches the UI and translates text nodes and placeholder/title/aria-label attributes as they appear,
//   remembering the English original so switching back to English restores it.
// - Arabic switches the document to right-to-left, loads an Arabic font and removes letter-spacing so letters stay joined.
import { AR } from '../data/ar.js';

export const I18N = { lang: 'en', missing: new Set() };
const NAMES = { Dani: 'داني', 'Dani Navarro': 'داني نافارو', 'Mr. Vale': 'مستر فيل', Kai: 'كاي', 'Kai Okafor': 'كاي أوكافور', Mila: 'ميلا', 'Mila Sorensen': 'ميلا سورنسن', Jett: 'جيت', 'Jett Alvarez': 'جيت ألفاريز', Rosa: 'روزا', 'Rosa Quintero': 'روزا كينتيرو', Rico: 'ريكو', 'Marcus Reed': 'ماركوس ريد', 'SAPD Traffic': 'مرور الشرطة', 'Harbor Bank': 'بنك هاربر',
  Mateo: 'ماتيو', Jamal: 'جمال', Owen: 'أوين', Luca: 'لوكا', Theo: 'ثيو', Andre: 'أندريه', Kenji: 'كينجي', Rafael: 'رافاييل', Omar: 'عمر', Elias: 'إلياس', Malik: 'مالك', Nico: 'نيكو', Dario: 'داريو', Felix: 'فيليكس', Hugo: 'هوجو', Tariq: 'طارق', Wes: 'ويس', Caleb: 'كاليب', Ivan: 'إيفان', Jonah: 'يونس',
  Sofia: 'صوفيا', Amara: 'أمارا', Leila: 'ليلى', Maya: 'مايا', Chloe: 'كلوي', Nadia: 'نادية', Hana: 'هنا', Imani: 'إيماني', Lucia: 'لوسيا', Zara: 'زارا', Elena: 'إيلينا', Priya: 'بريا', Talia: 'تاليا', Noor: 'نور', Iris: 'إيريس', Camila: 'كاميلا', Yara: 'يارا', Bea: 'بيا', Ines: 'إيناس',
  Orbi: 'أوربي', Rocket: 'روكيت', Mango: 'مانجو', Airport: 'المطار', Pacific: 'المحيط', INDOORS: 'بالداخل', N: 'ش', stranger: 'شخص' };
const EXACT = new Map(), LOWER = new Map(), PATTERNS = [];
function esc(s) { return s.replace(/[.*+?^$()|[\]\\]/g, '\\$&'); }
function build() {
  const all = { ...NAMES, ...AR };
  for (const [en, ar] of Object.entries(all)) {
    if (/\{\d\}/.test(en)) {
      const order = []; const src = esc(en).replace(/\\?\{(\d)\\?\}/g, (_, d) => { order.push(+d); return '([\\s\\S]+?)'; });
      PATTERNS.push({ re: new RegExp('^' + src + '$'), order, ar, len: en.length });
    } else { EXACT.set(en, ar); LOWER.set(en.toLowerCase(), ar); }
  }
  PATTERNS.sort((a, b) => b.len - a.len);
}
build();
export function addStrings(obj) { // add-on modules register their own strings
  for (const [en, ar] of Object.entries(obj)) {
    if (/\{\d\}/.test(en)) { const order = []; const src = esc(en).replace(/\\?\{(\d)\\?\}/g, (_, d) => { order.push(+d); return '([\\s\\S]+?)'; }); PATTERNS.push({ re: new RegExp('^' + src + '$'), order, ar, len: en.length }); PATTERNS.sort((a, b) => b.len - a.len); }
    else { EXACT.set(en, ar); LOWER.set(en.toLowerCase(), ar); }
  }
}
const LATIN = /[A-Za-z]{2}/;
function tr(s, depth = 0) {
  if (EXACT.has(s)) return EXACT.get(s);
  const lo = s.toLowerCase(); if (LOWER.has(lo)) return LOWER.get(lo);
  // keep punctuation around a known phrase
  const m0 = /^([\s"“(…—-]*)(.*?)([\s.!?:,;"”)…—-]*)$/.exec(s);
  if (m0 && (m0[1] || m0[3]) && m0[2] && (EXACT.has(m0[2]) || LOWER.has(m0[2].toLowerCase()))) return m0[1] + (EXACT.get(m0[2]) || LOWER.get(m0[2].toLowerCase())) + fixPunct(m0[3]);
  for (const p of PATTERNS) {
    const m = p.re.exec(s); if (!m) continue;
    let out = p.ar; p.order.forEach((d, i) => { const v = m[i + 1]; const rv = depth < 2 && LATIN.test(v) ? (tr(v, depth + 1) ?? v) : v; out = out.replace('{' + d + '}', () => rv); });
    return out;
  }
  if (depth < 2 && s.includes(' · ')) { const parts = s.split(' · '); const t = parts.map((p) => tr(p, depth + 1)); if (t.some((x, i) => x !== parts[i])) return t.join(' · '); }
  return null;
}
function fixPunct(p) { return p.replace(/\?/g, '؟').replace(/,/g, '،'); }
export function T(s) {
  if (I18N.lang === 'en' || s == null) return s;
  s = String(s); if (!LATIN.test(s)) return s;
  const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], core = s.trim();
  const r = tr(core);
  if (r == null) { if (I18N.missing.size < 2000) I18N.missing.add(core); return s; }
  return lead + r + trail;
}
export const isAR = () => I18N.lang === 'ar';
// Arabic form of a string whatever the interface language (Arab characters speak Arabic even in the English UI)
export function toAR(s) { if (s == null) return s; s = String(s); if (!LATIN.test(s)) return s; const r = tr(s.trim()); return r == null ? s : r; }

// ---------------- DOM translator ----------------
const ORIG = new WeakMap(); // node -> { en, out }
const ATTRS = ['placeholder', 'title', 'aria-label'];
let observer = null, tracked = new Set();
function skip(el) { if (!el) return true; const t = el.nodeName; return t === 'SCRIPT' || t === 'STYLE' || t === 'TEXTAREA' || t === 'INPUT' || (el.closest && el.closest('[data-noi18n]')); }
function doText(n) {
  const rec = ORIG.get(n); const cur = n.nodeValue;
  if (rec && cur === rec.out) return; // our own write
  const en = cur; if (!LATIN.test(en) || skip(n.parentElement)) { if (rec) ORIG.delete(n); return; }
  const out = T(en); if (out === en) return;
  ORIG.set(n, { en, out }); tracked.add(n); n.nodeValue = out;
}
function doAttrs(el) {
  for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a); if (!v || !LATIN.test(v)) continue; const key = '__i18n_' + a; if (el[key] && el[key].out === v) continue; const out = T(v); if (out !== v) { el[key] = { en: v, out }; el.setAttribute(a, out); tracked.add(el); } }
}
function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1 || skip(root)) return;
  doAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n; while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
}
function startObserver() {
  if (observer) return;
  observer = new MutationObserver((list) => {
    if (I18N.lang === 'en') return;
    for (const m of list) {
      if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doAttrs(m.target);
      else for (const n of m.addedNodes) walk(n);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
function restoreAll() {
  for (const n of tracked) {
    if (n.nodeType === 3) { const r = ORIG.get(n); if (r && n.nodeValue === r.out) n.nodeValue = r.en; ORIG.delete(n); }
    else for (const a of ATTRS) { const r = n['__i18n_' + a]; if (r && n.getAttribute(a) === r.out) n.setAttribute(a, r.en); n['__i18n_' + a] = null; }
  }
  tracked = new Set();
}
let fontLoaded = false;
export function setLang(lang) {
  lang = lang === 'ar' ? 'ar' : 'en';
  const changed = lang !== I18N.lang; I18N.lang = lang;
  const html = document.documentElement; html.lang = lang; html.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.body.classList.toggle('rtl', lang === 'ar');
  if (lang === 'ar' && !fontLoaded) { fontLoaded = true; try { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap'; document.head.appendChild(l); } catch (e) {} }
  startObserver();
  if (lang === 'ar') walk(document.body); else if (changed) restoreAll();
  try { localStorage.setItem('rivora.lang', lang); } catch (e) {}
  window.dispatchEvent(new CustomEvent('rivora:lang', { detail: lang }));
}
export function initialLang() {
  try { const s = localStorage.getItem('rivora.lang'); if (s) return s; } catch (e) {}
  const q = new URLSearchParams(location.search).get('lang'); if (q) return q;
  return /^ar/i.test(navigator.language || '') ? 'ar' : 'en';
}
// Bilingual helper for dialogue written natively in both languages: L({ar, en})
export function L(o) { if (o == null) return ''; if (typeof o === 'string') return T(o); return I18N.lang === 'ar' ? (o.ar || o.en) : (o.en || o.ar); }
if (typeof window !== 'undefined') { window.__rivora_i18n = I18N; I18N.setLang = (l) => setLang(l); }
