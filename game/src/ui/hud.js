// The HUD: every overlay element in one place, updated from a single snapshot object so the DOM is
// only touched when a value actually changes.
import { drawPortrait } from './portraits.js';

const fmtMoney = (v) => `$${Math.max(0, Math.round(v)).toLocaleString('en-US')}`;
const fmtDist = (d) => (d >= 1000 ? `${(d / 1000).toFixed(1)}k` : `${Math.max(1, Math.round(d))}m`);

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    const $ = (id) => document.getElementById(id);
    this.el = {
      misTag: $('misTag'),
      misName: $('misName'),
      misStage: $('misStage'),
      misObj: $('misObj'),
      misNext: $('misNext'),
      misBar: $('misBar'),
      pursuit: $('pursuit'),
      purHead: $('purHead'),
      purCount: $('purCount'),
      purUnits: $('purUnits'),
      purMore: $('purMore'),
      money: $('money'),
      clock: $('clock'),
      stars: $('stars'),
      place: $('place'),
      rankNum: $('rankNum'),
      rankTitle: $('rankTitle'),
      repBar: $('repBar'),
      repTxt: $('repTxt'),
      hpBar: $('hpBar'),
      hpTxt: $('hpTxt'),
      arBar: $('arBar'),
      arTxt: $('arTxt'),
      standName: $('standName'),
      standBar: $('standBar'),
      radioSt: $('radioSt'),
      radioTrack: $('radioTrack'),
      loadout: $('loadout'),
      speedo: $('speedo'),
      kmh: $('kmh'),
      carName: $('carName'),
      carSpec: $('carSpec'),
      carDmg: $('carDmg'),
      carDmgTxt: $('carDmgTxt'),
      minimap: $('minimap'),
      subtitle: $('subtitle'),
      subWho: $('subWho'),
      subLine: $('subLine'),
      portrait: $('portrait'),
      banner: $('banner'),
      banTag: $('banTag'),
      banName: $('banName'),
      banReward: $('banReward'),
      toast: $('toast'),
      help: $('help'),
    };
    this.cache = {};
    this.bannerTimer = 0;
    this.toastTimer = 0;
    this.portraitId = null;
    this.loadoutSig = null;
  }

  show(on = true) {
    this.root.classList.toggle('on', on);
  }

  set(key, value, apply) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    apply(value);
  }

  /** snapshot: everything the HUD shows, from the game state. */
  update(s) {
    this.set('money', fmtMoney(s.money), (v) => { this.el.money.textContent = v; });
    this.set('stars', s.wanted, (v) => {
      let html = '';
      for (let i = 0; i < 5; i++) html += i < v ? '<b>★</b>' : '★';
      this.el.stars.innerHTML = html;
    });
    this.set('place', `${s.district} · ${s.street}`, (v) => { this.el.place.textContent = v; });
    this.set('clock', s.clock ?? '', (v) => { this.el.clock.textContent = v; });

    this.set('hp', Math.round(s.health), (v) => {
      this.el.hpBar.style.width = `${Math.max(0, v)}%`;
      this.el.hpTxt.textContent = String(Math.max(0, v));
    });
    this.set('ar', Math.round(s.armour), (v) => {
      this.el.arBar.style.width = `${Math.max(0, v)}%`;
      this.el.arTxt.textContent = String(Math.max(0, v));
    });
    this.set('stand', `${s.standing}|${s.standingHeat}`, () => {
      this.el.standName.textContent = s.standing;
      this.el.standBar.style.width = `${Math.round((s.standingHeat ?? 0) * 100)}%`;
    });

    this.set('misTag', s.missionChapter ?? 'Chapter', (v) => { this.el.misTag.textContent = v; });
    this.set('misName', s.missionName ?? 'No job active', (v) => { this.el.misName.textContent = v; });
    this.set('misStage', s.missionStage ?? '—', (v) => { this.el.misStage.textContent = v; });
    this.set('misObj', s.objective ?? 'Press T to call a job from the burner phone', (v) => { this.el.misObj.textContent = v; });
    this.set('misNext', s.nextObjective ?? '', (v) => {
      this.el.misNext.innerHTML = v ? `<b>NEXT</b> ${v}` : '';
      this.el.misNext.style.display = v ? 'block' : 'none';
    });
    this.set('misBar', Math.round((s.missionProgress ?? 0) * 100), (v) => { this.el.misBar.style.width = `${v}%`; });

    const units = s.units ?? [];
    this.set('purSig', units.map((u) => `${u.name}${u.role}${Math.round(u.dist / 10)}`).join('|'), () => {
      this.el.pursuit.classList.toggle('on', units.length > 0);
      this.el.purHead.textContent = s.pursuitLabel ?? 'KPD RESPONSE';
      this.el.purCount.textContent = units.length ? `${units.length} UNIT${units.length === 1 ? '' : 'S'}` : '';
      this.el.purUnits.innerHTML = units
        .slice(0, 5)
        .map((u) => `<div class="u"><span>${u.name}</span><i>${u.role}</i><em>${fmtDist(u.dist)}</em></div>`)
        .join('');
      this.el.purMore.textContent = units.length > 5 ? `+${units.length - 5} more inbound` : '';
    });

    this.set('rank', `${s.rank}|${s.rankTitle}`, () => {
      this.el.rankNum.textContent = String(s.rank ?? 1);
      this.el.rankTitle.textContent = s.rankTitle ?? 'RUNNER';
    });
    this.set('rep', `${s.repInto}|${s.repNeed}`, () => {
      const pct = s.repNeed ? Math.min(100, (s.repInto / s.repNeed) * 100) : 0;
      this.el.repBar.style.width = `${pct}%`;
      this.el.repTxt.textContent = `${Math.round(s.repInto)} / ${Math.round(s.repNeed)} RP`;
    });

    this.set('radioSt', s.radio ?? 'WAVE 88.3', (v) => { this.el.radioSt.textContent = `RADIO · ${v}`; });
    this.set('radioTrack', s.radioTrack ?? '', (v) => { this.el.radioTrack.textContent = v; });

    const load = s.loadout ?? [];
    this.set('loadSig', load.map((w) => `${w.key}:${w.ammo}:${w.cur ? 1 : 0}`).join('|'), () => {
      this.el.loadout.innerHTML = load
        .map((w) => `<div class="slot${w.cur ? ' cur' : ''}${w.melee ? ' melee' : ''}"><span>${w.name}</span><small>${w.ammo}</small></div>`)
        .join('');
    });

    const driving = !!s.driving;
    this.set('driving', driving, (v) => { this.el.speedo.classList.toggle('on', v); });
    if (driving) {
      this.set('kmh', Math.round(s.kmh ?? 0), (v) => { this.el.kmh.textContent = String(v); });
      // keyed on the pair: caching on the gear alone left the previous car's spec line on screen
      // whenever the player swapped cars in the same gear
      this.set('gear', `${s.gear ?? 1}|${s.carSpec ?? ''}`, (v) => {
        const [gear, spec] = v.split('|');
        this.el.carSpec.textContent = `GEAR ${gear} · ${spec}`;
      });
      this.set('carName', s.carName ?? '—', (v) => { this.el.carName.textContent = v; });
      this.set('carDmg', Math.round((s.carDamage ?? 0) * 100), (v) => {
        this.el.carDmg.style.width = `${v}%`;
        this.el.carDmgTxt.textContent = v > 62 ? 'ENGINE CRITICAL' : v > 28 ? 'BODY DAMAGE' : 'CONDITION OK';
      });
    }

    this.set('sub', s.subtitle ? `${s.subtitle.who}|${s.subtitle.line}` : '', () => {
      if (s.subtitle) {
        this.el.subtitle.classList.add('on');
        this.el.subWho.textContent = s.subtitle.who;
        this.el.subLine.textContent = s.subtitle.line;
        if (this.portraitId !== s.subtitle.portrait) {
          this.portraitId = s.subtitle.portrait;
          drawPortrait(this.el.portrait, s.subtitle.portrait);
        }
      } else {
        this.el.subtitle.classList.remove('on');
      }
    });
  }

  banner(tag, name, reward, seconds = 4) {
    this.el.banTag.textContent = tag;
    this.el.banName.textContent = name;
    this.el.banReward.textContent = reward;
    this.el.banner.classList.add('on');
    this.bannerTimer = seconds;
  }

  toast(text, seconds = 2.4) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('on');
    this.toastTimer = seconds;
  }

  tick(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.classList.remove('on');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove('on');
    }
  }
}
