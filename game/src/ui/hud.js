// The HUD: every overlay element in one place, updated from a single snapshot object so the DOM is
// only touched when a value actually changes.
import { drawPortrait } from './portraits.js';

const fmtMoney = (v) => `$${Math.max(0, Math.round(v)).toLocaleString('en-US')}`;

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.el = {
      misName: document.getElementById('misName'),
      misStage: document.getElementById('misStage'),
      misObj: document.getElementById('misObj'),
      misBar: document.getElementById('misBar'),
      money: document.getElementById('money'),
      stars: document.getElementById('stars'),
      place: document.getElementById('place'),
      hpBar: document.getElementById('hpBar'),
      arBar: document.getElementById('arBar'),
      wName: document.getElementById('wName'),
      wAmmo: document.getElementById('wAmmo'),
      speedo: document.getElementById('speedo'),
      kmh: document.getElementById('kmh'),
      carName: document.getElementById('carName'),
      carDmg: document.getElementById('carDmg'),
      minimap: document.getElementById('minimap'),
      subtitle: document.getElementById('subtitle'),
      subWho: document.getElementById('subWho'),
      subLine: document.getElementById('subLine'),
      portrait: document.getElementById('portrait'),
      banner: document.getElementById('banner'),
      banTag: document.getElementById('banTag'),
      banName: document.getElementById('banName'),
      banReward: document.getElementById('banReward'),
      toast: document.getElementById('toast'),
      radio: document.getElementById('radio'),
      help: document.getElementById('help'),
    };
    this.cache = {};
    this.bannerTimer = 0;
    this.toastTimer = 0;
    this.portraitId = null;
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
    this.set('hp', Math.round(s.health), (v) => { this.el.hpBar.style.width = `${Math.max(0, v)}%`; });
    this.set('ar', Math.round(s.armour), (v) => { this.el.arBar.style.width = `${Math.max(0, v)}%`; });
    this.set('wn', s.weapon, (v) => { this.el.wName.textContent = v; });
    this.set('wa', s.ammo, (v) => { this.el.wAmmo.textContent = v; });
    this.set('misName', s.missionName ?? 'No job active', (v) => { this.el.misName.textContent = v; });
    this.set('misStage', s.missionStage ?? '—', (v) => { this.el.misStage.textContent = v; });
    this.set('misObj', s.objective ?? 'Press T to call a job from the burner phone', (v) => { this.el.misObj.textContent = v; });
    this.set('misBar', Math.round((s.missionProgress ?? 0) * 100), (v) => { this.el.misBar.style.width = `${v}%`; });

    const driving = !!s.driving;
    this.set('driving', driving, (v) => { this.el.speedo.classList.toggle('on', v); });
    if (driving) {
      this.set('kmh', Math.round(s.kmh ?? 0), (v) => { this.el.kmh.textContent = String(v); });
      this.set('carName', s.carName ?? '—', (v) => { this.el.carName.textContent = v; });
      this.set('carDmg', Math.round((s.carDamage ?? 0) * 100), (v) => { this.el.carDmg.style.width = `${v}%`; });
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
    this.set('radio', s.radio ?? 'WAVE 88.3', (v) => { this.el.radio.textContent = `RADIO · ${v}`; });
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
