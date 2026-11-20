// Melee resolution shared by the player, pedestrians, thugs and police.
import { clamp, angleDiff, R, bus, dist2 } from '../core/util.js';

const BASE = { jab: 6, cross: 9, hook: 12, uppercut: 15, body: 8, kick: 14, knee: 16, push: 0 };
const REACH = { jab: 1.35, cross: 1.45, hook: 1.25, uppercut: 1.2, body: 1.2, kick: 1.75, knee: 1.05, push: 1.3 };
export class Combat {
  constructor(game) { this.game = game; this.active = 0; this.hitStop = 0; }
  fighters() { const G = this.game; const out = [G.player]; for (const n of G.npcs.list) if (n.active && !n.down && n.object.visible) out.push(n); return out; }
  nearestEnemy(f, range) {
    const G = this.game; let best = null, bd = range * range;
    const list = f === G.player ? G.npcs.list.filter((n) => n.active && !n.down && n.state !== 'staff') : [G.player];
    for (const o of list) {
      const d2 = dist2(o.pos.x, o.pos.z, f.pos.x, f.pos.z); if (d2 > bd || Math.abs(o.pos.y - f.pos.y) > 1.2) continue;
      const a = Math.abs(angleDiff(f.heading, Math.atan2(o.pos.x - f.pos.x, o.pos.z - f.pos.z)));
      const score = d2 * (a < 0.9 ? 1 : 3) * (o.state === 'fight' ? 0.5 : 1);
      if (score < bd) { bd = score; best = o; }
    }
    return best;
  }
  resolveAttack(att, a) {
    const G = this.game, isP = att === G.player;
    const reach = a.reach || REACH[a.name] || 1.3;
    let hits = 0;
    for (const t of this.fighters()) {
      if (t === att || t.down) continue;
      if (!isP && t !== G.player && !(att.foe === t)) continue;
      if (isP && t.state === 'staff' && !t.hostile) continue;
      const dx = t.pos.x - att.pos.x, dz = t.pos.z - att.pos.z, d = Math.hypot(dx, dz);
      if (d > reach + 0.35 || Math.abs(t.pos.y - att.pos.y) > 1.1) continue;
      if (Math.abs(angleDiff(att.heading, Math.atan2(dx, dz))) > 0.95) continue;
      if (t === G.player && (G.player.invuln > 0 || G.player.state !== 'foot')) continue;
      hits++;
      if (a.push) { t.pos.x += dx / d * 1.2; t.pos.z += dz / d * 1.2; if (t.react) t.react(att); G.audio.block(t.pos); if (t !== G.player && isP) G.crime('assault', t.pos, 1, true); continue; }
      let dmg = BASE[a.name] || 8;
      if (isP) { dmg *= 1 + G.player.stats.strength * 0.025; if (G.player.counter && G.time - G.player.counter < 1.5) { dmg *= 2; G.player.counter = 0; } }
      else dmg *= a.dmgMul || 0.8;
      dmg *= 0.85 + R() * 0.3;
      const knock = a.heavy && (dmg > 15 || (t.health - dmg) < (t.maxHealth || 100) * 0.3) && R() < 0.6;
      const done = t.damage(dmg, att, { knock });
      if (done > 0) {
        G.audio.punch(t.pos, a.heavy);
        t.pos.x += dx / (d || 1) * 0.25; t.pos.z += dz / (d || 1) * 0.25;
        if (isP) { G.cam.addShake(a.heavy ? 0.25 : 0.12); this.hitStop = a.heavy ? 0.07 : 0.04; }
        if (G.settings.violence === 'full' && G.fx && R() < 0.5) G.fx.blood(t.pos, t.h ? t.h.bonePos('head', new THREE.Vector3()) : null);
        bus.emit('hit', att, t, dmg);
      }
    }
    if (!hits && isP) G.audio.whoosh(att.pos);
    if (hits) this.active = 6;
    return hits;
  }
  update(dt) { this.active = Math.max(0, this.active - dt); if (this.hitStop > 0) this.hitStop -= dt; }
}
