// Versioned save data: browser autosave (when storage works) + portable save codes.
const KEY = 'rivora.save.v1', VERSION = 1;
export class SaveSystem {
  constructor(game) { this.game = game; }
  storageOK() { try { localStorage.setItem('__rv', '1'); localStorage.removeItem('__rv'); return true; } catch (e) { return false; } }
  collect() {
    const G = this.game;
    G.vehicles.syncOwned();
    return {
      v: VERSION, game: 'RIVORA', ts: Date.now(), weapons: G.weapons ? G.weapons.serialize() : null, nour: G.nour ? G.nour.serialize() : null, lang: G.settings.lang,
      player: G.player.serialize(), companion: G.companion.serialize(), economy: G.economy.serialize(),
      owned: G.vehicles.owned, missions: G.missions.serialize(), env: G.env.serialize(), phone: G.phone.serialize(),
      outfits: [...G.ownedOutfits], contacts: [...G.contacts], relations: G.relations, gymToday: G.gymToday || 0,
      settings: G.settings, levels: G.audio.levels, bindings: G.input.bindings,
    };
  }
  exportCode() { const json = JSON.stringify(this.collect()); return 'RIVORA1:' + btoa(unescape(encodeURIComponent(json))); }
  parse(text) {
    try {
      text = String(text || '').trim(); if (!text) return { ok: false, error: 'Paste a save code first.' };
      let json = text; if (text.startsWith('RIVORA1:')) json = decodeURIComponent(escape(atob(text.slice(8).replace(/\s+/g, ''))));
      const d = JSON.parse(json);
      if (d.game !== 'RIVORA') return { ok: false, error: 'That is not a RIVORA save.' };
      if (!d.v || d.v > VERSION) return { ok: false, error: 'This save comes from a newer version of RIVORA.' };
      if (!d.player || !d.economy || !d.missions) return { ok: false, error: 'The save is incomplete or damaged.' };
      if (!Array.isArray(d.player.pos) || d.player.pos.some((n) => typeof n !== 'number' || !isFinite(n))) d.player.pos = null;
      if (typeof d.economy.cash !== 'number' || typeof d.economy.bank !== 'number') return { ok: false, error: 'The save\'s money values are damaged.' };
      return { ok: true, data: d };
    } catch (e) { return { ok: false, error: 'Could not read that save code — it may be cut off. Copy it again in full.' }; }
  }
  write() { try { localStorage.setItem(KEY, JSON.stringify(this.collect())); return true; } catch (e) { return false; } }
  peekAutosave() { try { const t = localStorage.getItem(KEY); if (!t) return null; const r = this.parse(t); return r.ok ? r.data : null; } catch (e) { return null; } }
}
