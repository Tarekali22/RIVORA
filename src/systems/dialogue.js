// Conversations with pedestrians: Egyptian Arabic (and other dialects) or English, by preset replies, typed text,
// or optional push-to-talk speech recognition. The microphone is only opened while the talk button/key is held,
// only after the player agreed to it, and never records or stores audio itself.
import { T, toAR, isAR, addStrings, I18N } from '../core/i18n.js';
import * as L from '../world/layout.js';
import { bus, R, fmtTime } from '../core/util.js';

// ---------------- who people are ----------------
const NAT = {
  eg: { en: 'Egyptian', ar: 'مصري', arab: true, w: 12 }, lv: { en: 'Levantine', ar: 'شامي', arab: true, w: 7 }, gf: { en: 'Gulf', ar: 'خليجي', arab: true, w: 5 }, mg: { en: 'Moroccan', ar: 'مغربي', arab: true, w: 6 },
  us: { en: 'American', ar: 'أمريكي', w: 20 }, it: { en: 'Italian', ar: 'إيطالي', w: 6 }, fr: { en: 'French', ar: 'فرنسي', w: 5 }, de: { en: 'German', ar: 'ألماني', w: 4 }, uk: { en: 'British', ar: 'بريطاني', w: 5 },
  latam: { en: 'Latin American', ar: 'لاتيني', w: 9 }, ng: { en: 'Nigerian', ar: 'نيجيري', w: 6 }, in: { en: 'Indian', ar: 'هندي', w: 6 }, jp: { en: 'Japanese', ar: 'ياباني', w: 4 }, ph: { en: 'Filipino', ar: 'فلبيني', w: 4 },
};
const ARAB_NAMES = {
  eg: { m: [['Mohamed', 'محمد'], ['Ahmed', 'أحمد'], ['Mahmoud', 'محمود'], ['Mostafa', 'مصطفى'], ['Karim', 'كريم'], ['Youssef', 'يوسف'], ['Amr', 'عمرو'], ['Hassan', 'حسن'], ['Sherif', 'شريف'], ['Mina', 'مينا'], ['Bishoy', 'بيشوي'], ['Islam', 'إسلام'], ['Tamer', 'تامر'], ['Ashraf', 'أشرف']],
        f: [['Mona', 'منى'], ['Sara', 'سارة'], ['Yasmine', 'ياسمين'], ['Nourhan', 'نورهان'], ['Heba', 'هبة'], ['Dina', 'دينا'], ['Mariam', 'مريم'], ['Rehab', 'رحاب'], ['Shaimaa', 'شيماء'], ['Marina', 'مارينا'], ['Aya', 'آية'], ['Salma', 'سلمى']] },
  lv: { m: [['Rami', 'رامي'], ['Fadi', 'فادي'], ['Ziad', 'زياد'], ['Elie', 'إيلي']], f: [['Rana', 'رنا'], ['Lama', 'لمى'], ['Maya', 'مايا'], ['Nour', 'نور']] },
  gf: { m: [['Khalid', 'خالد'], ['Faisal', 'فيصل'], ['Saud', 'سعود'], ['Abdullah', 'عبدالله']], f: [['Noura', 'نورة'], ['Hessa', 'حصة'], ['Maha', 'مها'], ['Reem', 'ريم']] },
  mg: { m: [['Yassine', 'ياسين'], ['Mehdi', 'مهدي'], ['Anas', 'أنس'], ['Hamza', 'حمزة']], f: [['Salma', 'سلمى'], ['Imane', 'إيمان'], ['Kawtar', 'كوثر'], ['Houda', 'هدى']] },
};
const names = {}; for (const d of Object.values(ARAB_NAMES)) for (const s of ['m', 'f']) for (const [en, ar] of d[s]) names[en] = ar; addStrings(names);
function pickW(tbl) { let t = 0; for (const k in tbl) t += tbl[k].w; let r = R() * t; for (const k in tbl) { r -= tbl[k].w; if (r <= 0) return k; } return 'us'; }
export function profile(n) {
  if (n.nat) return n;
  const inNour = L.districtAt(n.pos.x, n.pos.z) === 'nour';
  n.nat = n.natFixed || (inNour ? (R() < 0.88 ? 'eg' : pickW({ lv: NAT.lv, gf: NAT.gf, mg: NAT.mg, us: NAT.us })) : pickW(NAT));
  if (NAT[n.nat].arab && ARAB_NAMES[n.nat] && !n.namedFixed) { const l = ARAB_NAMES[n.nat][n.a.sex === 'f' ? 'f' : 'm']; n.name = l[Math.floor(R() * l.length)][0]; }
  return n;
}

// ---------------- what people say ----------------
const P = (ar, en) => ({ ar, en });
const EG = {
  greetM: [P('صباح الفل يا باشا! إزيك؟', 'Morning, boss! How are you?'), P('صباح النور! عامل إيه النهارده؟', 'Good morning! How are you doing today?')],
  greetE: [P('مساء الخير! إزيك يا صاحبي؟', 'Good evening! How are you, my friend?'), P('مساء الفل! منور الحتة.', 'Evening! You light up the street.')],
  greet: [P('أهلًا يا باشا، إزيك؟', 'Hey boss, how are you?'), P('يا أهلًا وسهلًا! منورنا.', 'Welcome, welcome! Good to see you.'), P('إزيك يا صاحبي؟ عامل إيه؟', 'How are you, my friend? What\'s up?')],
  again: [P('إنت تاني! أهلًا يا {p}، وحشتنا.', 'You again! Hey {p}, we missed you.'), P('يا مرحب يا {p}! إيه الأخبار؟', 'Hey {p}! What\'s new?')],
  how: [P('الحمد لله، تمام. وإنت عامل إيه؟', 'Thank God, all good. And you?'), P('ماشي الحال، الدنيا زحمة شوية بس كله تمام.', 'Getting by — it\'s a bit hectic, but all good.'), P('زي الفل والحمد لله.', 'Fine as jasmine, thank God.')],
  name: [P('أنا {n}. وإنت اسمك إيه؟', 'I\'m {n}. And what\'s your name?'), P('اسمي {n}، تحت أمرك.', 'My name\'s {n}, at your service.')],
  myname: [P('اتشرفنا يا {p}! هفتكرك.', 'Nice to meet you, {p}! I\'ll remember you.'), P('أهلًا يا {p}، اسم جميل.', 'Hello {p}, nice name.')],
  food: [P('عايز تاكل؟ امشي {d} حوالي {m} متر، هتلاقي {place}. حطيتهولك على الخريطة.', 'Hungry? Head {d} about {m} metres and you\'ll find {place}. I\'ve put it on your map.'), P('أقرب أكل؟ {place}، {d} على بعد {m} متر تقريبًا. أكلهم يجنن.', 'Nearest food? {place}, {d}, about {m} metres. Their food is amazing.')],
  coffee: [P('القهوة؟ {place} {d}، يجي {m} متر. قولّهم إني باعتك.', 'Coffee? {place}, {d}, about {m} metres. Tell them I sent you.'), P('روح {place}، {d} حوالي {m} متر. الشاي هناك مظبوط.', 'Go to {place}, {d}, about {m} metres. The tea there is just right.')],
  shop: [P('فيه {place} {d}، حوالي {m} متر.', 'There\'s {place} {d}, about {m} metres.')],
  gym: [P('الجيم؟ {place}، {d} على بعد {m} متر. ربنا معاك!', 'The gym? {place}, {d}, {m} metres away. Good luck!')],
  hospital: [P('ألف سلامة! المستشفى {d}، حوالي {m} متر. حطيتها على الخريطة.', 'Get well soon! The hospital is {d}, about {m} metres. I\'ve marked it.')],
  police: [P('قسم الشرطة {d}، يجي {m} متر.', 'The police station is {d}, about {m} metres.')],
  gun: [P('محل السلاح؟ {place}، {d} حوالي {m} متر. بس خلي بالك من نفسك.', 'The arms shop? {place}, {d}, about {m} metres. But take care of yourself.')],
  job: [P('شغل؟ روح لعم حسن في قهوة النور، دايمًا عنده مشاوير ومهمات.', 'Work? Go see Uncle Hassan at Ahwa El Nour — he always has errands and jobs.'), P('بص في تليفونك، الشغلانات بتيجي هناك. ولو عايز حاجة بجد، عم حسن في القهوة.', 'Check your phone, the jobs come there. And for real work, Uncle Hassan at the ahwa.')],
  area: [P('ده حي النور يا سيدي، أحلى حتة في المدينة. القهوة هنا ليها طعم تاني.', 'This is El Nour quarter — best spot in the city. Coffee tastes different here.'), P('إنت في {area}. المنطقة هنا هادية بالنهار وبتولّع بالليل.', 'You\'re in {area}. Quiet by day, lively at night.')],
  time: [P('الساعة دلوقتي {t} تقريبًا.', 'It\'s about {t} now.')],
  weather: [P('الجو النهارده {w}. ربنا يستر.', 'The weather today is {w}. Let\'s hope it holds.')],
  thanks: [P('العفو يا باشا، على إيه!', 'Don\'t mention it, boss!'), P('ولا يهمك، إحنا إخوات.', 'No worries, we\'re brothers.')],
  bye: [P('مع السلامة، نورتنا!', 'Take care — good to see you!'), P('في رعاية الله، خلي بالك من نفسك.', 'God keep you, take care of yourself.')],
  joke: [P('واحد بيقول لصاحبه: عملت دايت. قاله: خسرت كام؟ قاله: أسبوعين!', 'A guy says: I went on a diet. Friend: How much did you lose? Him: Two weeks!'), P('مرة واحد اشترى ساعة مية… غرقت!', 'A guy bought a waterproof watch… it drowned!')],
  compliment: [P('تسلم يا ذوق! ربنا يخليك.', 'That\'s kind of you! Bless you.')],
  insult: [P('إيه يا عم الكلام ده؟ احترم نفسك!', 'Hey, what kind of talk is that? Show some respect!'), P('لا مؤاخذة، أنا مش فاضي للكلام ده.', 'Excuse me, I don\'t have time for that.')],
  here: [P('إنت واقف قدامها يا باشا! {place} أهي.', 'You\'re standing right at it! That\'s {place} right here.'), P('بص جنبك! دي {place}.', 'Look next to you — that\'s {place}.')],
  unknown: [P('مش فاهمك أوي، تقصد إيه؟', 'I didn\'t quite get you — what do you mean?'), P('معلش، قول تاني؟', 'Sorry, say that again?')],
  busy: [P('معلش، أنا مستعجل شوية. نتكلم بعدين.', 'Sorry, I\'m in a bit of a rush. Talk later.')],
  interrupt: [P('لحظة واحدة… (التليفون بيرن) أيوه يا ماما، جاي حالًا! معلش لازم أمشي.', 'One second… (phone rings) Yes, mum, coming right now! Sorry, I have to go.')],
};
const DIALECT = {
  lv: { greet: [P('مرحبا! كيفك؟', 'Hi! How are you?')], how: [P('منيح الحمدلله، وإنت كيفك؟', 'Good, thank God — and you?')], thanks: [P('تكرم عينك!', 'You\'re welcome!')], bye: [P('يلا، مع السلامة!', 'Alright, bye!')], unknown: [P('عفوًا؟ ما فهمت عليك.', 'Sorry? I didn\'t get you.')], name: [P('أنا {n}، تشرفنا.', 'I\'m {n}, pleased to meet you.')] },
  gf: { greet: [P('هلا والله! شلونك؟', 'Hey there! How are you?')], how: [P('بخير الله يسلمك، وأنت شخبارك؟', 'Fine, God bless you — and how are you?')], thanks: [P('العفو، ما سوينا شي.', 'It\'s nothing.')], bye: [P('في أمان الله.', 'Go in God\'s safety.')], unknown: [P('ما فهمت عليك، شنو تقصد؟', 'I didn\'t get you — what do you mean?')], name: [P('أنا {n}، حياك الله.', 'I\'m {n}, welcome.')] },
  mg: { greet: [P('السلام! لاباس عليك؟', 'Hello! You alright?')], how: [P('لاباس الحمد لله، وأنت؟', 'All good, thank God — you?')], thanks: [P('بلا جميل.', 'No need to thank me.')], bye: [P('بسلامة!', 'Bye!')], unknown: [P('سمح ليا، ما فهمتكش.', 'Sorry, I didn\'t understand you.')], name: [P('أنا {n}، مرحبا بيك.', 'I\'m {n}, welcome.')] },
};
const FOREIGN_GREET = { us: P('أهلًا! عامل إيه؟', 'Hey! How\'s it going?'), it: P('تشاو! عامل إيه؟', 'Ciao! How\'s it going?'), fr: P('بونجور! يوم حلو، صح؟', 'Bonjour! Lovely day, isn\'t it?'), de: P('هالو! الجو حلو النهارده.', 'Hallo! Nice weather today.'), uk: P('أهلًا! يوم جميل.', 'Alright? Lovely day for it.'), latam: P('أولا! إيه الأخبار؟', '¡Hola! What\'s up?'), ng: P('إزيك يا صاحبي؟ الدنيا ماشية؟', 'How far, my friend? All good?'), in: P('ناماستي! كله تمام؟', 'Namaste! All good?'), jp: P('كونيتشيوا! أهلًا.', 'Konnichiwa! Hello.'), ph: P('أهلًا يا صديقي! الدنيا عاملة إيه؟', 'Hey friend! How\'s life?') };
const PERSONA_TAIL = { nervous: P(' …بصراحة أنا مستعجل شوية.', ' …honestly, I\'m in a bit of a hurry.'), shy: P(' …يعني… أهلًا.', ' …um… hi.'), aggressive: P(' عايز إيه بالظبط؟', ' What exactly do you want?'), wealthy: P(' بس بسرعة، عندي ميعاد.', ' Quickly though, I have an appointment.') };

// ---------------- understanding the player ----------------
const norm = (s) => s.toLowerCase().replace(/[إأآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[ؤئ]/g, 'ء').replace(/[ً-ْ]/g, '').replace(/[?؟!.,،]/g, ' ').replace(/\s+/g, ' ').trim();
const INTENTS = [
  ['myname', /(اسمي|انا اسمي|my name is|i am called|call me)\s+([^\s]+)/],
  ['insult', /(غبي|حمار|يا زفت|اخرس|idiot|stupid|shut up|loser)/],
  ['how', /(عامل ايه|اخبارك|ازيك|ازيكم|كيفك|شلونك|لاباس|how are you|how's it going|how are things|what's up|whats up)/],
  ['greet', /^(اهلا|هاي|مرحبا|السلام عليكم|سلام عليكم|صباح|مساء|hi|hello|hey|good (morning|evening|afternoon)|salam)/],
  ['name', /(اسمك|انت مين|مين انت|what's your name|whats your name|who are you|your name)/],
  ['food', /(مطعم|اكل|جعان|كشري|فول|اتغدي|اتعشي|restaurant|food|eat|hungry|lunch|dinner)/],
  ['coffee', /(قهوه|كافيه|شاي|مقهي|coffee|cafe|tea)/],
  ['gun', /(سلاح|اسلحه|مسدس|gun|weapon|arms|ammo)/],
  ['hospital', /(مستشفي|دكتور|اسعاف|تعبان|hospital|doctor|hurt|injured)/],
  ['police', /(قسم|شرطه|بوليس|police|cops)/],
  ['gym', /(جيم|تمرين|رياضه|gym|workout|train)/],
  ['shop', /(سوبر ?ماركت|محل|كشك|اشتري|shop|store|market|buy)/],
  ['job', /(شغل|شغلانه|مهمه|فلوس|عايز اشتغل|job|work|mission|money)/],
  ['area', /(المكان ده|انا فين|احنا فين|المنطقه|الحي|where am i|this place|what is this|neighbourhood|neighborhood|area)/],
  ['time', /(الساعه كام|الوقت|what time|the time)/],
  ['weather', /(الجو|مطر|weather|rain)/],
  ['joke', /(نكته|ضحكني|joke|funny)/],
  ['thanks', /(شكرا|متشكر|تسلم|ميرسي|thank|thanks|cheers)/],
  ['bye', /(سلام|مع السلامه|باي|يلا بينا|bye|goodbye|see you|later)/],
  ['compliment', /(جميل|حلو|ذوق|طيب|nice|cool|kind|great)/],
];
export function intentOf(text) {
  const t = norm(text); for (const [k, re] of INTENTS) { const m = re.exec(t); if (m) return { k, m, raw: text }; }
  if (/(^|\s)(where|فين)(\s|$)/.test(t)) return { k: 'area', raw: text };
  return { k: 'unknown', raw: text };
}
const PRESETS = [['how', 'إزيك؟ عامل إيه؟', 'Hi! How are you?'], ['name', 'اسمك إيه؟', 'What\'s your name?'], ['food', 'فين أقرب مطعم؟', 'Where\'s the nearest restaurant?'], ['coffee', 'فين أقرب قهوة؟', 'Where can I get coffee?'], ['job', 'فيه شغل؟', 'Any work around here?'], ['area', 'إيه المكان ده؟', 'What is this place?'], ['joke', 'قولّي نكتة', 'Tell me a joke'], ['thanks', 'شكرًا', 'Thanks'], ['bye', 'مع السلامة', 'Goodbye']];

export class Dialogue {
  constructor(game) {
    this.game = game; this.ov = null; this.npc = null; this.rec = null; this.listening = false; this.sel = 0; this.playerName = null; this.log = [];
    try { this.micOK = localStorage.getItem('rivora.micConsent') === '1'; } catch (e) { this.micOK = false; }
    this.SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    window.addEventListener('keydown', (e) => this._key(e, true), true); window.addEventListener('keyup', (e) => this._key(e, false), true);
  }
  get open_() { return !!this.ov; }
  _bound(code, action) { return (this.game.input.bindings[action] || []).includes(code); }
  _key(e, down) {
    if (!this.ov) { // push-to-talk near someone starts a voice conversation
      if (down && !e.repeat && this._bound(e.code, 'talk') && this.game.running && !this.game.ui.blockingUI && this.game.player.state === 'foot' && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) { const n = this.game.ctxTarget && this.game.ctxTarget.src === 'npc' ? this.game.ctxTarget.npc : null; if (n) { this.open(n); this.startPTT(); e.preventDefault(); } }
      return;
    }
    const inInput = e.target && e.target.tagName === 'INPUT';
    if (this._bound(e.code, 'talk') && !inInput) { e.preventDefault(); e.stopPropagation(); if (down && !e.repeat) this.startPTT(); else if (!down) this.stopPTT(); return; }
    if (!down || inInput) return;
    const btns = [...this.ov.querySelectorAll('.dlg-opts button')];
    if (e.code === 'ArrowDown' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); const d = (e.code === 'ArrowDown' || e.code === (isAR() ? 'ArrowLeft' : 'ArrowRight')) ? 1 : -1; this.sel = (this.sel + d + btns.length) % btns.length; this._hl(); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); const b = btns[this.sel]; if (b) b.click(); }
  }
  _hl() { this.ov.querySelectorAll('.dlg-opts button').forEach((b, i) => b.classList.toggle('sel', i === this.sel)); }
  open(n) {
    const G = this.game; if (this.ov) this.close();
    profile(n); this.npc = n; n.memory.met++; n.persistent = true; n.talking = true; n.state = 'idle'; n.stateT = 999;
    n.heading = Math.atan2(G.player.pos.x - n.pos.x, G.player.pos.z - n.pos.z); G.player.faceTarget = Math.atan2(n.pos.x - G.player.pos.x, n.pos.z - G.player.pos.z);
    const nat = NAT[n.nat] || NAT.us, ar = isAR();
    const presets = PRESETS.map(([k, a, e], i) => `<button class="btn small${i === 0 ? ' sel' : ''}" data-k="${k}" data-noi18n>${ar ? a : e}</button>`).join('');
    this.ov = G.ui.panel(`<div class="dlg" data-noi18n>
      <div class="dlg-head"><b class="dlg-name"></b> <span class="dlg-tag"></span></div>
      <div class="dlg-line"></div><div class="dlg-tr"></div>
      <div class="dlg-opts">${presets}</div>
      <div class="dlg-in"><input type="text" maxlength="120" autocomplete="off"><button class="btn small primary" data-send>${ar ? 'إرسال' : 'Send'}</button>
      <button class="btn small dlg-mic" data-mic title="">${ar ? '🎤 اضغط مطوّلًا وتكلّم' : '🎤 Hold to talk'}</button></div>
      <div class="dlg-note"></div></div>`, { onClose: () => this._closed() });
    this.ov.classList.add('dlg-ov');
    const nm = ar ? (T(n.name) || n.name) : n.name; this.ov.querySelector('.dlg-name').textContent = nm;
    this.ov.querySelector('.dlg-tag').textContent = (ar ? nat.ar : nat.en) + (n.role === 'vendor' ? (ar ? ' · بائع' : ' · vendor') : '');
    const inp = this.ov.querySelector('input'); inp.placeholder = ar ? 'اكتب كلامك هنا… (Enter للإرسال)' : 'Type to talk… (Enter to send)';
    inp.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); this.send(inp.value); inp.value = ''; } else if (e.code === 'Escape') { inp.blur(); } e.stopPropagation(); });
    this.ov.querySelector('[data-send]').onclick = () => { this.send(inp.value); inp.value = ''; };
    this.ov.querySelector('.dlg-opts').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; this.player(b.textContent, { k: b.dataset.k }); });
    const mic = this.ov.querySelector('[data-mic]');
    const start = (e) => { e.preventDefault(); this.startPTT(); }, stop = (e) => { e.preventDefault(); this.stopPTT(); };
    mic.addEventListener('pointerdown', start); mic.addEventListener('pointerup', stop); mic.addEventListener('pointerleave', stop); mic.addEventListener('pointercancel', stop);
    this.ov.querySelector('.dlg-note').textContent = this.SR ? (ar ? 'الميكروفون اختياري: يعمل فقط وأنت ضاغط على الزر (أو B). يمكنك دائمًا استخدام الأزرار أو الكتابة.' : 'Microphone is optional and only listens while you hold the button (or B). Buttons and typing always work.') : (ar ? 'التعرّف على الصوت غير مدعوم في هذا المتصفح — استخدم الأزرار أو اكتب.' : 'Speech recognition isn\'t supported in this browser — use the buttons or type.');
    this.sel = 0;
    // opening line
    const isHassan = G.nour && n === G.nour.hassan;
    const L0 = isHassan ? { ...G.nour.greetFor() } : n.memory.met > 1 && this.playerName ? this._line('again') : this._line(G.env.hour < 12 && G.env.hour > 4 ? 'greetM' : G.env.hour > 17 ? 'greetE' : 'greet');
    if (!isHassan && n.persona && PERSONA_TAIL[n.persona] && R() < 0.6) { L0.ar += PERSONA_TAIL[n.persona].ar; L0.en += PERSONA_TAIL[n.persona].en; }
    this.say(L0); bus.emit('talked', n);
  }
  _closed() { const n = this.npc; this.stopPTT(true); if (n) { n.talking = false; n.persistent = false; n.state = 'walk'; n.stateT = 1 + R() * 2; n.anim.talk = false; } this.ov = null; this.npc = null; }
  close() { if (this.ov) this.game.ui.close(this.ov); }
  _pool(k) {
    const n = this.npc, d = DIALECT[n.nat];
    if (d && d[k]) return d[k];
    if (!NAT[n.nat].arab && k.startsWith('greet')) return [FOREIGN_GREET[n.nat] || FOREIGN_GREET.us];
    return EG[k] || EG.unknown;
  }
  _line(k, vars = {}) {
    const pool = this._pool(k); const p = pool[Math.floor(R() * pool.length)];
    const n = this.npc, nm = n.name, pn = this.playerName || this.game.player.name.split(' ')[0];
    const fill = (s, ar) => s.replace('{n}', ar ? toAR(nm) : nm).replace('{p}', pn).replace(/\{(\w+)\}/g, (m, key) => (vars[key] != null ? (typeof vars[key] === 'object' ? (ar ? vars[key].ar : vars[key].en) : vars[key]) : m));
    return { ar: fill(p.ar, true), en: fill(p.en, false) };
  }
  say(line) {
    const G = this.game, n = this.npc; if (!n || !this.ov) return;
    const arabNPC = NAT[n.nat].arab, ar = isAR();
    const main = ar || arabNPC ? line.ar : line.en, sub = !ar && arabNPC ? line.en : '';
    this.ov.querySelector('.dlg-line').textContent = main; this.ov.querySelector('.dlg-tr').textContent = sub;
    n.anim.talk = true; clearTimeout(this._tt); this._tt = setTimeout(() => { if (n) n.anim.talk = false; }, 600 + main.length * 55);
    this.log.push({ who: n.name, text: main });
    // Arab characters speak Arabic even with the English interface (the translation is shown under the line)
    G.speak && G.speak(ar || arabNPC ? line.ar : line.en, n.a.sex, n.name, { raw: true, lang: ar || arabNPC ? 'ar' : 'en' });
  }
  send(text) { text = (text || '').trim(); if (!text) return; this.player(text, intentOf(text)); }
  player(text, it) {
    const G = this.game, n = this.npc; if (!n || !this.ov) return;
    this.ov.querySelector('.dlg-tr').textContent = (isAR() ? 'أنت: ' : 'You: ') + text;
    this.log.push({ who: 'player', text });
    setTimeout(() => this.reply(it.k ? it : intentOf(text)), G.testFast ? 10 : 450);
  }
  reply(it) {
    const G = this.game, n = this.npc; if (!n || !this.ov) return;
    let k = it.k, vars = {};
    if (n.persona === 'aggressive' && (k === 'insult' || (n.memory.met > 2 && R() < 0.3))) { this.say(this._line('insult')); if (k === 'insult') { setTimeout(() => { this.close(); n.state = 'fight'; n.foe = G.player; n.atkT = 1; }, 900); } return; }
    if (k === 'job' && n.missionGiver) { bus.emit('dialogue', n, k); return; } // the mission giver answers with real work (NourLife.offer)
    if (k === 'myname') { const nm = (it.m && it.m[2]) || ''; if (nm) { this.playerName = nm.slice(0, 18); n.memory.playerName = this.playerName; } this.say(this._line('myname')); return; }
    if (['food', 'coffee', 'shop', 'gym', 'hospital', 'police', 'gun'].includes(k)) {
      const dest = this.nearest(k); if (!dest) { this.say(this._line('unknown')); return; }
      if (dest.raw < 18) { this.say(this._line('here', { place: dest.place })); bus.emit('dialogue', n, k); return; } // already standing at it
      Object.assign(vars, dest); G.ui.waypoint = { x: dest.x, z: dest.z }; G.ui.routeT = 0;
    }
    if (k === 'area') vars.area = { ar: toAR(L.DISTRICTS[L.districtAt(n.pos.x, n.pos.z)].name), en: L.DISTRICTS[L.districtAt(n.pos.x, n.pos.z)].name };
    if (k === 'time') vars.t = fmtTime(G.env.hour);
    if (k === 'weather') { const w = G.weatherLabel(); vars.w = { ar: toAR(w), en: w.toLowerCase() }; }
    if (k === 'insult') { n.memory.hits = (n.memory.hits || 0) + 0; }
    if (k === 'how' && n.memory.met > 1 && this.playerName) k = 'how';
    const line = this._line(k, vars); this.say(line);
    if (k === 'bye') setTimeout(() => this.close(), G.testFast ? 50 : 1600);
    else if (k !== 'unknown' && R() < 0.04 && n.nat === 'eg') setTimeout(() => { if (this.npc === n) { this.say(this._line('interrupt')); setTimeout(() => this.close(), 2500); } }, 2600);
    bus.emit('dialogue', n, k);
  }
  // nearest place of a kind, described from the player's point of view
  nearest(k) {
    const G = this.game, p = G.player.pos;
    const kinds = { food: ['food', 'cafe', 'koshary', 'bakery', 'foul'], coffee: ['ahwa', 'cafe'], shop: ['store', 'kiosk', 'market'], gym: ['gym', 'beachgym'], hospital: ['hospital'], police: ['police'], gun: ['gunshop'] }[k];
    let best = null, bd = 1e9;
    for (const [id, q] of Object.entries(L.POI)) { if (!kinds.includes(q.kind) && !kinds.includes(id)) continue; const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = { ...q, id }; } }
    if (!best) return null;
    const a = Math.atan2(best.x - p.x, best.z - p.z), rel = Math.atan2(Math.sin(a - G.player.heading), Math.cos(a - G.player.heading));
    const d = Math.abs(rel) < 0.6 ? { ar: 'على طول قدامك', en: 'straight ahead' } : Math.abs(rel) > 2.4 ? { ar: 'ورا ضهرك', en: 'back the way you came' } : rel > 0 ? { ar: 'على إيدك الشمال', en: 'on your left' } : { ar: 'على إيدك اليمين', en: 'on your right' };
    return { x: best.x, z: best.z, raw: bd, m: Math.max(20, Math.round(bd / 10) * 10), d, place: { ar: toAR(best.name), en: best.name } };
  }
  // ---------------- push-to-talk ----------------
  async startPTT() {
    if (!this.ov || this.listening) return;
    const ar = isAR(), note = (t) => { const el = this.ov && this.ov.querySelector('.dlg-note'); if (el) el.textContent = t; };
    if (!this.SR) { note(ar ? 'التعرّف على الصوت غير مدعوم في هذا المتصفح — استخدم الأزرار أو اكتب.' : 'Speech recognition isn\'t supported here — use the buttons or type.'); return; }
    if (!window.isSecureContext) { note(ar ? 'الميكروفون يحتاج صفحة آمنة (https).' : 'The microphone needs a secure (https) page.'); return; }
    if (!this.micOK) {
      const ok = await this.game.ui.confirm(ar ? 'استخدام الميكروفون' : 'Use the microphone?', ar ? 'سيستمع RIVORA فقط وأنت ضاغط على زر الميكروفون. يتم تحويل كلامك إلى نص بواسطة خدمة التعرّف على الصوت في متصفحك (قد تُرسل للخادم الخاص بالمتصفح). اللعبة لا تسجّل ولا تحفظ صوتك.' : 'RIVORA only listens while you hold the talk button. Your browser\'s speech service turns speech into text (it may send audio to its own servers). The game never records or stores your voice.', ar ? 'موافق' : 'Allow', ar ? 'لا' : 'No');
      if (!ok) return; this.micOK = true; try { localStorage.setItem('rivora.micConsent', '1'); } catch (e) {}
      if (!this.ov) return;
    }
    try {
      const rec = new this.SR(); this.rec = rec; rec.lang = ar ? 'ar-EG' : 'en-US'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 3;
      let finalText = ''; this.listening = true; this._micUI(true);
      rec.onresult = (e) => { let t = ''; for (const r of e.results) { t += r[0].transcript; if (r.isFinal) finalText = t; } note((ar ? '🎤 ' : '🎤 ') + t); };
      rec.onerror = (e) => { this.listening = false; this._micUI(false); note(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? (ar ? 'الميكروفون محجوب في هذه الصفحة (مثلًا داخل Claude). استخدم الأزرار أو اكتب.' : 'The microphone is blocked on this page (for example inside Claude). Use the buttons or type.') : e.error === 'no-speech' ? (ar ? 'لم أسمع شيئًا. جرّب تاني.' : 'I didn\'t hear anything — try again.') : (ar ? 'تعذّر التعرّف على الصوت.' : 'Speech recognition failed.')); };
      rec.onend = () => { this.listening = false; this._micUI(false); this.rec = null; if (finalText) this.player(finalText, intentOf(finalText)); };
      rec.start();
    } catch (e) { this.listening = false; this._micUI(false); note(ar ? 'تعذّر تشغيل الميكروفون.' : 'Could not start the microphone.'); }
  }
  stopPTT(abort) { if (this.rec) { try { abort ? this.rec.abort() : this.rec.stop(); } catch (e) {} } if (abort) { this.rec = null; this.listening = false; } this._micUI(false); }
  _micUI(on) { const b = this.ov && this.ov.querySelector('[data-mic]'); if (b) { b.classList.toggle('rec', on); b.textContent = on ? (isAR() ? '● يستمع… اترك الزر للإرسال' : '● Listening… release to send') : (isAR() ? '🎤 اضغط مطوّلًا وتكلّم' : '🎤 Hold to talk'); } }
  update() {
    const G = this.game, n = this.npc; if (!n || !this.ov) return;
    if (!n.active || n.down || Math.hypot(n.pos.x - G.player.pos.x, n.pos.z - G.player.pos.z) > 5 || G.player.state !== 'foot') this.close();
    else { n.state = 'idle'; n.stateT = 999; n.heading = Math.atan2(G.player.pos.x - n.pos.x, G.player.pos.z - n.pos.z); }
  }
}
