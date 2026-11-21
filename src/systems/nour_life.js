// Life in El Nour Quarter: residents and vendors, Egyptian food and drink, Uncle Hassan's ahwa, and a short
// Egyptian story chain ("حكايات النور" / Nour Stories) with medals, optional objectives and a choice people remember.
import { T, L as Lx, isAR, addStrings } from '../core/i18n.js';
import { CONTACTS } from '../data/content.js';
import * as L from '../world/layout.js';
import { randomAppearance } from '../actors/humanoid.js';
import { R, bus, dist, fmtMoney } from '../core/util.js';
import { profile } from './dialogue.js';

const P = (ar, en) => ({ ar, en });
CONTACTS.hassan = { name: 'Uncle Hassan', role: 'Owner of Ahwa El Nour', color: '#2b8a3e', initials: 'عح' };
addStrings({ 'Uncle Hassan': 'عم حسن', 'Owner of Ahwa El Nour': 'صاحب قهوة النور', Hassan: 'حسن', Sayed: 'سيد', Mahmoud: 'محمود', Fawzy: 'فوزي', 'Nour Stories': 'حكايات النور', 'Call Hassan': 'اتصل بعم حسن', 'Bread delivery sprint': 'توصيل العيش السريع', 'Golden hour photo': 'صورة الساعة الذهبية' });
const MENU = {
  ahwa: [['tea', P('شاي كشري', 'Egyptian tea'), 1, 0, 12], ['coffee', P('قهوة تركي مظبوط', 'Turkish coffee (medium sugar)'), 2, 0, 18], ['sahlab', P('سحلب بالمكسرات', 'Sahlab with nuts'), 3, 6, 10], ['mint', P('ينسون / نعناع', 'Anise or mint tea'), 1, 4, 6], ['karkade', P('كركديه ساقع', 'Iced hibiscus (karkade)'), 2, 0, 14]],
  koshary: [['kosh', P('طبق كشري كبير', 'Large koshary plate'), 4, 40, 15], ['kosh2', P('كشري صغير', 'Small koshary'), 2, 22, 8], ['rice', P('رز بلبن', 'Rice pudding'), 2, 8, 6], ['om', P('أم علي', 'Om Ali (bread pudding)'), 3, 12, 6]],
  bakery: [['baladi', P('عيش بلدي (5 أرغفة)', 'Baladi bread (5 loaves)'), 1, 10, 4], ['feteer', P('فطير مشلتت', 'Feteer meshaltet'), 4, 30, 10], ['basbousa', P('بسبوسة', 'Basbousa'), 2, 8, 8], ['konafa', P('كنافة بالقشطة', 'Konafa with cream'), 3, 10, 8]],
  juice: [['asab', P('عصير قصب', 'Sugarcane juice'), 1, 4, 22], ['mango', P('عصير مانجا', 'Mango juice'), 2, 6, 16], ['guava', P('جوافة باللبن', 'Guava milk'), 2, 6, 14], ['lemon', P('ليمون بالنعناع', 'Lemon & mint'), 1, 2, 16]],
  nkiosk: [['water', P('مياه معدنية', 'Bottled water'), 1, 2, 10], ['chips', P('شيبسي', 'Crisps'), 1, 4, 4], ['taameya', P('ساندوتش طعمية', 'Taameya sandwich'), 1, 18, 6], ['fuul', P('ساندوتش فول', 'Fuul sandwich'), 1, 20, 6], ['soda', P('مشروب غازي', 'Fizzy drink'), 1, 0, 12]],
};
const TITLE = { ahwa: P('قهوة النور', 'Ahwa El Nour'), koshary: P('كشري النور', 'Koshary El Nour'), bakery: P('مخبز الأمل', 'Al-Amal Bakery'), juice: P('عصائر النيل', 'Nile Juice'), nkiosk: P('كشك النور', 'El Nour Kiosk') };
const BANTER = [P('يا معلم! واحد شاي سكر زيادة!', 'Boss! One tea, extra sugar!'), P('الماتش النهارده هيبقى نار.', 'Tonight\'s match is going to be fire.'), P('الأسعار غليت أوي يا جدعان.', 'Prices have gone crazy, guys.'), P('دورين طاولة وأنا أغلبك.', 'Two rounds of backgammon and I\'ll beat you.'), P('مين شاف أبو سيد النهارده؟', 'Has anyone seen Abu Sayed today?'), P('صلّوا على النبي يا جماعة، هي جت على دي؟', 'Calm down, folks — is it worth all that?'), P('الجو النهارده حلو، نقعد برة شوية.', 'Nice weather today, let\'s sit outside a while.'), P('ابني جاب مجموع حلو في الثانوية!', 'My son got great marks in his exams!')];
const HASSAN_GREET = { none: [P('أهلًا يا ابني! تعالى اقعد، الشاي على حسابي.', 'Welcome, son! Sit down, the tea\'s on me.'), P('منور القهوة! عامل إيه النهارده؟', 'You light up the ahwa! How are you today?')], stood: [P('أهلًا يا بطل الحتة! من يوم ما وقفت معانا والناس بتحلف بيك.', 'Hey, hero of the street! Since you stood up for us, people swear by you.')], paid: [P('أهلًا يا ابني… اللي دفعناه راح، ربنا يعوّض. المهم إنك بخير.', 'Hello son… what we paid is gone, God will make it up. What matters is you\'re safe.')] };
const HASSAN_SMALL = [P('القهوة مفتوحة لحد الفجر، عدّي في أي وقت.', 'The ahwa is open till dawn — drop by anytime.'), P('خلي بالك من نفسك يا ابني، المدينة دي سريعة.', 'Take care, son. This city moves fast.')];

export class NourLife {
  constructor(game) {
    this.game = game; this.done = new Set(); this.flags = {}; this.residents = []; this.best = {};
    const G = game, M = G.missions;
    bus.onHandle('door', (pt) => { if (!MENU[pt.kind]) return false; this.menu(pt.kind); return true; });
    bus.on('tick', (dt) => this.update(dt));
    bus.on('dialogue', (n, k) => { if (n === this.hassan && k === 'job') this.offer(); });
    const oc = M.onCallContact.bind(M); M.onCallContact = (id) => (id === 'hassan' ? this.onCall() : null) || oc(id);
    const st = M.smallTalk.bind(M); M.smallTalk = (id) => (id === 'hassan' ? Lx(HASSAN_SMALL[Math.floor(R() * 2)]) : st(id));
    const jl = M.jobList.bind(M); M.jobList = () => [...jl(), ...this.jobs()];
    bus.on('missionComplete', (id) => { if (id.startsWith('nour')) { this.done.add(id); this.flags.lastDoneT = G.time; } });
  }
  // ---------------- food & drink ----------------
  menu(kind) {
    const G = this.game, items = MENU[kind].map(([id, name, price, hp, st]) => ({ id, name: Lx(name), price, desc: (hp ? (isAR() ? `+${hp} صحة ` : `+${hp} health `) : '') + (st ? (isAR() ? `+${st} تحمّل` : `+${st} stamina`) : ''), hp, st }));
    G.ui.shop(Lx(TITLE[kind]), isAR() ? 'أكل وشرب مصري أصيل. الدفع كاش.' : 'Authentic Egyptian food and drink. Cash, please.', items, (it) => {
      if (!G.economy.pay(it.price, it.name)) return; const P1 = G.player; P1.health = Math.min(P1.maxHealth, P1.health + it.hp); P1.stamina = Math.min(P1.maxStamina || 100, P1.stamina + it.st);
      G.audio.ui('buy'); G.ui.toast(it.name, it.desc || '', 'good', 2); bus.emit('ateEgyptian', kind, it.id);
      if (kind === 'ahwa' && !G.contacts.has('hassan')) { G.contacts.add('hassan'); }
    });
  }
  // ---------------- residents ----------------
  _spawnResidents() {
    const G = this.game, A = (sex, real, tone) => { const a = randomAppearance(R, { sex }); a.skinTone = tone; if (real) a.real = real; if (a.hair) a.hair.color = '#18120e'; return a; };
    const mk = (x, z, h, a, name, o = {}) => { const n = G.npcs.spawnAt(x, z, 'ped', a, { state: o.state || 'idle', t: 1e9, heading: h, persistent: true, fixed: o.fixed ?? true, y: o.y }); n.natFixed = 'eg'; n.nat = 'eg'; n.name = name; n.namedFixed = true; n.role = o.role || 'vendor'; n.persona = 'friendly'; this.residents.push(n); return n; };
    this.hassan = mk(-228.9, 268.6, Math.PI / 2, A('m', 'luca', 'tan'), 'Hassan'); this.hassan.missionGiver = true; this.hassan.role = 'owner';
    mk(-228.7, 258.5, Math.PI / 2, A('m', 'andre', 'base'), 'Mahmoud');
    mk(-226.8, 226.6, Math.PI / 2, A('m', 'carlos', 'brown'), 'Sayed');
    const seats = G.city.seats.filter((s) => Math.abs(s.x + 227.9) < 0.2 && s.z > 262 && s.z < 284 && !s.taken).slice(0, 4);
    const names = ['Ahmed', 'Mostafa', 'Karim', 'Amr'];
    seats.forEach((s, i) => { s.taken = true; const n = mk(s.x + Math.sin(s.heading) * 0.05, s.z + Math.cos(s.heading) * 0.05, s.heading, A(i === 2 ? 'f' : 'm', null, ['olive', 'tan', 'brown', 'tan'][i]), i === 2 ? 'Mona' : names[i], { state: 'sit', y: s.y - 0.5, role: 'ped', fixed: true }); n.seat = s; });
  }
  _releaseResidents() { for (const n of this.residents) { n.persistent = false; n.fixed = false; if (n.seat) n.seat.taken = false; n.state = 'walk'; } this.residents = []; this.hassan = null; }
  update(dt) {
    const G = this.game; if (!G.running || !G.player) return; const p = G.player.pos, d = dist(p.x, p.z, -228, 272);
    if (!this.residents.length && d < 170 && !G.interior) this._spawnResidents();
    else if (this.residents.length && d > 260) this._releaseResidents();
    if (this.hassan && this.hassan.active) { const H = this.hassan; if (!H.talking && H.state !== 'fight' && !H.down) { H.state = 'idle'; H.stateT = 1e9; } }
    // ahwa banter when the player is near
    this.banterT = (this.banterT ?? 6) - dt;
    if (this.banterT <= 0 && d < 14 && !G.ui.blockingUI && !G.missions.active && this.residents.length > 3) { this.banterT = 9 + R() * 8; const who = this.residents[3 + Math.floor(R() * Math.max(1, this.residents.length - 3))]; if (who && who.active) { const l = BANTER[Math.floor(R() * BANTER.length)]; G.ui.subtitle(isAR() ? T(who.name) : who.name, Lx(l), 3.2); who.anim.talk = true; setTimeout(() => { if (who.anim) who.anim.talk = false; }, 2500); } }
    // story beats: Hassan calls with the next chapter
    this.t = (this.t || 0) + dt; const M = G.missions;
    if (!M.active && !G.cutscene) {
      if (!this.flags.introCall && M.done.has('homecoming') && this.t > 40) { this.flags.introCall = true; G.contacts.add('hassan'); G.phone.addMessage('hassan', isAR() ? 'أنا عم حسن صاحب قهوة النور، جارك اللي في الحي اللي جنبك. عدّي عليّا، عندي شغلانة صغيرة وكوباية شاي.' : 'Uncle Hassan here, owner of Ahwa El Nour — the quarter next to your place. Drop by, I have a small job and a glass of tea for you.', { coords: { x: L.POI.ahwa.x, z: L.POI.ahwa.z, label: T('Ahwa El Nour') } }); }
      const next = this.nextId();
      if (next && next !== 'nour1' && this.flags.called !== next && G.time - (this.flags.lastDoneT || 0) > 70 && this.done.size > 0) { this.flags.called = next; G.contacts.add('hassan'); G.phone.ring('hassan', () => this.callBrief(next), () => {}); }
    }
  }
  nextId() { for (const id of ['nour1', 'nour2', 'nour3', 'nour4']) if (!this.done.has(id)) return id; return null; }
  onCall() { const n = this.nextId(); if (!n || this.game.missions.active) return null; return () => this.callBrief(n); }
  async callBrief(id) {
    const M = this.game.missions, lines = {
      nour1: [P('ألو يا ابني! تعالى القهوة، محمود الميكانيكي مستني أكل وشاي ومحدش فاضي يوصّله.', 'Hello son! Come to the ahwa — Mahmoud the mechanic is waiting for food and tea and no one is free to take it.')],
      nour2: [P('مصيبة يا ابني! ميكروباص سيد اتسرق من قدام القهوة. الناس هنا شافوا حاجة، اسألهم.', 'Disaster, son! Sayed\'s microbus was stolen right outside the ahwa. People here saw something — ask them.')],
      nour3: [P('فيه شوية عيال جايين يطلبوا إتاوة من القهوة. أنا مش عايز مشاكل… بس تعالى اقف جنبي.', 'Some thugs are coming to demand protection money from the ahwa. I don\'t want trouble… but come stand with me.')],
      nour4: [P('عايزك تصوّر المئذنة وقت الغروب، الساعة الذهبية. هعلّقها في القهوة.', 'I want you to photograph the minaret at sunset — the golden hour. I\'ll hang it in the ahwa.')],
    }[id];
    for (const l of lines) await M.say('Hassan', Lx(l));
    M.start(this.def(id));
  }
  offer() { const id = this.nextId(), M = this.game.missions, D = this.game.dialogue; if (!id) { D.say(P('ربنا يخليك يا ابني، كفاية عليك كده النهارده. اشرب الشاي!', 'Bless you son, that\'s enough for today. Drink your tea!')); return; } if (M.active) { D.say(P('خلّص اللي في إيدك الأول يا ابني، وبعدين تعالى.', 'Finish what you\'re on first, son, then come back.')); return; } D.close(); this.callBrief(id); }
  greetFor() { const c = this.flags.choice || 'none'; const l = HASSAN_GREET[c] || HASSAN_GREET.none; return l[Math.floor(R() * l.length)]; }
  jobs() {
    const G = this.game, busy = !!G.missions.active, id = this.nextId(), ar = isAR();
    const list = [];
    if (id) list.push({ title: (ar ? 'حكايات النور' : 'Nour Stories') + ' ' + (['nour1', 'nour2', 'nour3', 'nour4'].indexOf(id) + 1) + '/4', desc: ar ? 'قصة مصرية في حي النور مع عم حسن. ميداليات ذهبية وفضية وبرونزية.' : 'An Egyptian story in El Nour with Uncle Hassan. Gold, silver and bronze medals.', enabled: !busy, button: T('Call Hassan'), start: () => { G.contacts.add('hassan'); this.callBrief(id); } });
    list.push({ title: ar ? 'توصيل العيش السريع' : 'Bread delivery sprint', desc: (ar ? 'وصّل العيش من مخبز الأمل على العجلة قبل ما يبرد. أفضل وقت: ' : 'Deliver bread from Al-Amal Bakery by bicycle before it goes cold. Best: ') + (this.best.bread ? this.best.bread.toFixed(1) + 's' : '—'), enabled: !busy, start: () => G.missions.start(this.def('bread')) });
    return list;
  }
  // ---------------- missions ----------------
  def(id) {
    const G = this.game, M = G.missions, ar = isAR(), say = (who, l) => M.say(who, Lx(l)), tx = (l) => Lx(l);
    const medalT = (t, g, s) => (t <= g ? 'gold' : t <= s ? 'silver' : 'bronze');
    if (id === 'nour1') {
      const pick = L.POI.koshary, dest = { x: -278, z: -47 }; let scooter = null;
      return { id, title: ar ? 'توصيلة شاي وكشري' : 'Tea & Koshary Run', kind: 'story', reward: 250, bonus: 60,
        medal: (m) => medalT(m.data.dt || 999, 38, 55),
        optional: [{ text: P('وصّل الطلب من غير ما توقع الشاي (العجلة سليمة 90٪)', 'Don\'t spill the tea (scooter ≥ 90% condition)'), ok: (m) => m.data.hp >= 90 }],
        steps: [
          { text: tx(P('استلم الطلب من كشري النور', 'Pick up the order at Koshary El Nour')), marker: () => ({ x: pick.x, z: pick.z }), update: () => (M.near(pick, 4) ? 'done' : null) },
          { text: tx(P('اركب سكوتر التوصيل', 'Get on the delivery scooter')), start: () => { scooter = M.track(G.vehicles.spawn('zipp', -223.4, 300, Math.PI, { color: '#ffb703' })); scooter.owner = 'player'; scooter.keep = false; say('Hassan', P('السكوتر قدامك، والشاي في الصينية. براحة على المطبات!', 'The scooter\'s right there and the tea\'s on the tray. Easy on the bumps!')); }, marker: () => scooter && ({ x: scooter.pos.x, z: scooter.pos.z }), update: () => (G.player.vehicle === scooter ? 'done' : null) },
          { text: tx(P('وصّل الطلب لورشة محمود جنب جراج نافارو', 'Deliver to Mahmoud\'s workshop by Navarro Garage')), start: (m) => { m.timer = 70; m.data.t0 = m.t; }, marker: () => dest,
            update: (dt, m) => { m.timer -= dt; if (m.timer <= 0) return 'fail:' + tx(P('الأكل برد والشاي اتدلق.', 'The food went cold and the tea spilled.')); if (!scooter || scooter.disabled) return 'fail:' + tx(P('السكوتر اتكسر.', 'The scooter broke down.')); if (M.near(dest, 7)) { m.data.dt = m.t - m.data.t0; m.data.hp = scooter.health; return 'done'; } } },
          { text: tx(P('سلّم الطلب', 'Hand over the order')), start: async (m) => { await say('Mahmoud', P('يا سلام! كشري سخن وشاي مظبوط. تسلم إيدك يا باشا.', 'Wow! Hot koshary and perfect tea. Bless your hands, boss.')); await say('Mahmoud', P('قول لعم حسن إن الحساب عندي المرة الجاية.', 'Tell Uncle Hassan the bill is on me next time.')); m.data.ok = true; }, update: (dt, m) => (m.data.ok ? 'done' : null) },
        ] };
    }
    if (id === 'nour2') {
      let bus2 = null, thugs = [], spawned = false; const port = { x: -150, z: -560 }, home = { x: -300, z: 244 }, witness = () => this.residents[3] || this.hassan;
      return { id, title: ar ? 'الميكروباص التايه' : 'The Missing Microbus', kind: 'story', reward: 600, bonus: 100, allowGuns: true,
        medal: (m) => (m.data.hp >= 90 ? 'gold' : m.data.hp >= 60 ? 'silver' : 'bronze'),
        optional: [{ text: P('محدش من الناس العاديين اتأذى', 'No bystanders hurt'), ok: (m) => !m.data.bystander }, { text: P('رجّعه في أقل من 3 دقايق', 'Bring it back within 3 minutes'), ok: (m) => m.t < 180 }],
        steps: [
          { text: tx(P('اسأل الناس في القهوة', 'Ask the regulars at the ahwa')), marker: () => { const w = witness(); return w ? { x: w.pos.x, z: w.pos.z } : { x: -228, z: 272 }; }, update: (dt, m) => { const w = witness(); if (w && M.near(w.pos, 2.6)) { if (!m.data.asked) { m.data.asked = true; (async () => { await say(w.name || 'Ahmed', P('شفت اتنين ركبوه وطلعوا بيه ناحية الميناء، فاوندري. كانوا بيضحكوا.', 'I saw two guys jump in and head for the port — Foundry. They were laughing.')); await say('Hassan', P('روح وراهم يا ابني، بس خلي بالك.', 'Go after them, son — but be careful.')); m.data.go = true; })(); } } return m.data.go ? 'done' : null; } },
          { text: tx(P('دوّر على الميكروباص في ميناء فاوندري', 'Search Foundry Port for the microbus')), marker: () => ({ ...port, r: 20 }),
            update: (dt, m) => { if (!spawned && M.near(port, 60)) { spawned = true; bus2 = M.track(G.vehicles.spawn('micro', port.x + 8, port.z + 6, 0.4, { color: '#f2f2f2' })); bus2.owner = 'player'; for (let i = 0; i < 2; i++) { const t = G.npcs.spawnAt(port.x + 4 + i * 2, port.z + 10, 'thug', null, { persistent: true }); t.name = i ? 'Fawzy' : 'Harbor Saint'; thugs.push(M.track(t)); } } return spawned && bus2 && M.near(bus2.pos, 14) ? 'done' : null; } },
          { text: tx(P('استرجع الميكروباص', 'Take the microbus back')), start: () => { for (const t of thugs) { t.state = 'fight'; t.foe = G.player; } say('Fawzy', P('إنت جاي تعمل إيه هنا؟ امشي من سكات!', 'What are you doing here? Get lost quietly!')); }, marker: () => bus2 && ({ x: bus2.pos.x, z: bus2.pos.z }), update: () => (bus2 && bus2.disabled ? 'fail:' + tx(P('الميكروباص اتدمر.', 'The microbus was wrecked.')) : G.player.vehicle === bus2 ? 'done' : null) },
          { text: tx(P('رجّع الميكروباص لحي النور', 'Drive the microbus back to El Nour')), marker: () => ({ ...home, r: 6 }), update: (dt, m) => { if (!bus2 || bus2.disabled) return 'fail:' + tx(P('الميكروباص اتدمر.', 'The microbus was wrecked.')); if (G.player.vehicle !== bus2) G.ui.hint(tx(P('ارجع للميكروباص', 'Get back in the microbus')), 0.3); if (G.player.vehicle === bus2 && M.near(home, 9)) { m.data.hp = bus2.health; return 'done'; } } },
          { text: tx(P('سلّم الميكروباص لسيد', 'Hand the microbus to Sayed')), start: async (m) => { await say('Sayed', P('ده رزقي ورزق عيالي! مش عارف أقولك إيه… ربنا يجبر بخاطرك.', 'That\'s my living and my kids\' living! I don\'t know what to say… God bless you.')); m.data.ok = true; }, update: (dt, m) => (m.data.ok ? 'done' : null) },
        ] };
    }
    if (id === 'nour3') {
      let thugs = []; const ahwa = { x: -226, z: 272 };
      return { id, title: ar ? 'مشكلة في القهوة' : 'Trouble at the Ahwa', kind: 'story', reward: (m) => (m.data.choice === 'stood' ? 800 : 0), bonus: 100, allowGuns: false,
        medal: (m) => (m.data.choice === 'paid' ? 'bronze' : m.hpMin >= 0.7 * G.player.maxHealth ? 'gold' : m.hpMin >= 0.4 * G.player.maxHealth ? 'silver' : 'bronze'),
        optional: [{ text: P('من غير سلاح ناري', 'No firearms used'), ok: (m) => !m.data.shot }],
        onComplete: (m) => { this.flags.choice = m.data.choice; },
        steps: [
          { text: tx(P('روح قهوة النور', 'Go to Ahwa El Nour')), marker: () => ahwa, update: () => (M.near(ahwa, 8) ? 'done' : null) },
          { text: tx(P('واجه العصابة', 'Face the gang')), start: async (m) => {
            this._shotOff = bus.on('shot', () => { m.data.shot = true; });
            for (let i = 0; i < 3; i++) { const t = G.npcs.spawnAt(-224 + i * 1.2, 266 + i, 'thug', null, { persistent: true, state: 'idle', t: 999, heading: -Math.PI / 2 }); t.name = i === 0 ? 'Fawzy' : 'Harbor Saint'; thugs.push(M.track(t)); }
            await say('Fawzy', P('يا حاج حسن، الحماية بقت 300 في الأسبوع. وإلا القهوة دي ممكن يحصلها حاجة.', 'Hajj Hassan, protection is 300 a week now. Otherwise something might happen to this ahwa.'));
            await say('Hassan', P('يا ابني ده رزق ناس غلابة… (يبص لك) إنت شايف إيه؟', 'Son, this is how poor folks earn a living… (looks at you) What do you think?'));
            const ok = await G.ui.confirm(ar ? 'القرار لك' : 'Your call', ar ? 'تدفع لهم 300$ وتخلص المشكلة بهدوء، ولا تقف في وشهم؟ عم حسن هيفتكر اختيارك.' : 'Pay them $300 and end it quietly, or stand up to them? Uncle Hassan will remember your choice.', ar ? 'أقف في وشهم' : 'Stand up to them', ar ? 'أدفع 300$' : 'Pay $300');
            if (ok) { m.data.choice = 'stood'; for (const t of thugs) { t.state = 'fight'; t.foe = G.player; t.hostile = true; } say('Fawzy', P('كده؟ ماشي… هاتوه!', 'Like that? Fine… get him!')); }
            else { m.data.choice = 'paid'; if (!G.economy.pay(300, 'Protection money')) { G.economy.cash = Math.max(0, G.economy.cash); } await say('Fawzy', P('كده الكلام. نشوفك الأسبوع الجاي يا حاج.', 'That\'s more like it. See you next week, Hajj.')); for (const t of thugs) { t.persistent = false; t.flee(G.player.pos, 40); } m.data.resolved = true; }
          }, update: (dt, m) => { if (m.data.choice === 'stood' && thugs.every((t) => t.down || !t.active || t.health <= 0)) return 'done'; if (m.data.resolved) return 'done'; } },
          { text: tx(P('اتكلم مع عم حسن', 'Talk to Uncle Hassan')), start: async (m) => { if (m.data.choice === 'stood') { await say('Hassan', P('والله ما شفت جدعنة زي دي من زمان! الحي كله هيعرف اللي عملته.', 'I swear I haven\'t seen such bravery in years! The whole quarter will know what you did.')); } else { await say('Hassan', P('ماشي يا ابني… السلامة أهم من الفلوس. بس الحكاية دي مش هتخلص كده.', 'Alright son… safety matters more than money. But this story won\'t end here.')); } m.data.ok = true; if (this._shotOff) this._shotOff(); }, update: (dt, m) => (m.data.ok ? 'done' : null) },
        ] };
    }
    if (id === 'nour4') {
      const spot = { x: -282, z: 96 };
      return { id, title: ar ? 'الساعة الذهبية' : 'Golden Hour', kind: 'activity', reward: 300, bonus: 80,
        medal: (m) => (m.data.golden ? 'gold' : 'silver'),
        optional: [{ text: P('صوّرها في الساعة الذهبية (5–7 مساءً)', 'Shoot it in the golden hour (5–7 pm)'), ok: (m) => m.data.golden }],
        steps: [
          { text: tx(P('روح عند تقاطع شارع ميركادو وشارع صن ست', 'Go to the corner of Mercado Ave and Sunset St')), marker: () => spot, update: () => (M.near(spot, 10) ? 'done' : null) },
          { text: tx(P('افتح وضع التصوير (O) وصوّر المئذنة', 'Open photo mode (O) and photograph the minaret')), start: (m) => { this._photoOff = bus.on('photoTaken', (info) => { const mx = -234.5, mz = 114.5, my = 38; const c = info.cam; const dir = new THREE.Vector3(mx - c.x, my - c.y, mz - c.z); const dd = dir.length(); dir.normalize(); if (dd < 260 && dir.dot(info.dir) > Math.cos(0.42)) { m.data.ok = true; m.data.golden = G.env.hour >= 17 && G.env.hour <= 19; } else G.ui.hint(tx(P('المئذنة مش في الصورة. جرّب تاني.', 'The minaret isn\'t in the shot. Try again.')), 2.5); }); }, update: (dt, m) => { if (m.data.ok) { if (this._photoOff) this._photoOff(); return 'done'; } } },
        ] };
    }
    if (id === 'bread') {
      const from = L.POI.bakery, homes = [[-360, 120], [-480, 170], [-300, 360], [-420, 380], [-150, 388], [-80, 240]], h = homes[Math.floor(R() * homes.length)], dest = { x: h[0], z: h[1] }; let bike = null;
      return { id: 'bread', title: ar ? 'توصيل العيش السريع' : 'Bread delivery sprint', kind: 'activity', reward: (m) => Math.round(80 + Math.max(0, m.timer) * 3),
        medal: (m) => { const t = m.data.dt || 999; if (!this.best.bread || t < this.best.bread) this.best.bread = t; return medalT(t, 30, 42); },
        steps: [
          { text: tx(P('اركب العجلة اللي قدام مخبز الأمل', 'Get on the bicycle outside Al-Amal Bakery')), start: () => { bike = M.track(G.vehicles.spawn('bicycle', from.x + 4, from.z, Math.PI, { color: '#2a9d8f' })); bike.owner = 'player'; }, marker: () => bike && ({ x: bike.pos.x, z: bike.pos.z }), update: () => (G.player.vehicle === bike ? 'done' : null) },
          { text: tx(P('وصّل العيش وهو سخن', 'Deliver the bread while it\'s hot')), start: (m) => { m.timer = 60; m.data.t0 = m.t; }, marker: () => dest, update: (dt, m) => { m.timer -= dt; if (m.timer <= 0) return 'fail:' + tx(P('العيش برد.', 'The bread went cold.')); if (M.near(dest, 7)) { m.data.dt = m.t - m.data.t0; return 'done'; } } },
        ] };
    }
    return null;
  }
  serialize() { return { done: [...this.done], flags: this.flags, best: this.best }; }
  restore(s) { this.done = new Set(s.done || []); this.flags = s.flags || {}; this.best = s.best || {}; }
}
export { profile };
