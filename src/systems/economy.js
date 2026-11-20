// Cash, bank, transactions, fines, properties and passive income. Money only moves when committed.
import { fmtMoney, bus } from '../core/util.js';
import { PROPERTIES } from '../data/content.js';

export class Economy {
  constructor(game) { this.game = game; this.cash = 500; this.bank = 2500; this.tx = []; this.fines = []; this.props = { safehouse: true }; this.inventory = { cigs: 0, lighter: 0, medkit: 0 }; this.reputation = 0; }
  log(desc, amount, kind) { this.tx.unshift({ t: this.game.env.day + ' · ' + this.game.timeStr(), desc, amount, kind }); if (this.tx.length > 60) this.tx.pop(); bus.emit('money'); }
  canAfford(n) { return this.cash + this.bank >= n; }
  // pay using cash first, then the bank card
  pay(n, desc) {
    if (!this.canAfford(n)) { this.game.audio.ui('error'); this.game.ui.toast('Not enough money', `${desc} costs ${fmtMoney(n)}.`, 'bad', 2.5); return false; }
    const fromCash = Math.min(this.cash, n); this.cash -= fromCash; this.bank -= n - fromCash;
    this.log(desc, -n, n - fromCash > 0 ? 'card' : 'cash'); this.game.audio.ui('cash'); return true;
  }
  earn(n, desc, toBank = false) { if (toBank) this.bank += n; else this.cash += n; this.log(desc, n, toBank ? 'bank' : 'cash'); this.game.audio.ui('cash'); bus.emit('earned', n); }
  fine(n, desc) { this.bank -= n; this.fines.unshift({ t: this.game.env.day + ' · ' + this.game.timeStr(), desc, amount: n }); this.log(desc, -n, 'fine'); bus.emit('fined', n, desc); }
  deposit(n) { n = Math.min(n, this.cash); if (n <= 0) return; this.cash -= n; this.bank += n; this.log('Deposit', 0, 'transfer'); }
  withdraw(n) { n = Math.min(n, Math.max(0, this.bank)); if (n <= 0) return; this.bank -= n; this.cash += n; this.log('Withdrawal', 0, 'transfer'); }
  buyProperty(id) { const p = PROPERTIES[id]; if (!p || this.props[id]) return false; if (!this.pay(p.price, 'Purchase: ' + p.name)) return false; this.props[id] = true; bus.emit('property', id); return true; }
  dailyIncome() { let total = 0; for (const [id, own] of Object.entries(this.props)) if (own && PROPERTIES[id] && PROPERTIES[id].income) total += PROPERTIES[id].income; if (total) this.earn(total, 'Business income', true); }
  serialize() { return { cash: this.cash, bank: this.bank, tx: this.tx.slice(0, 30), fines: this.fines.slice(0, 20), props: this.props, inventory: this.inventory, reputation: this.reputation }; }
  restore(s) { if (!s) return; Object.assign(this, { cash: s.cash ?? 500, bank: s.bank ?? 2500, tx: s.tx || [], fines: s.fines || [], props: s.props || { safehouse: true }, inventory: Object.assign({ cigs: 0, lighter: 0, medkit: 0 }, s.inventory || {}), reputation: s.reputation || 0 }); }
}
