// Front end screens and persistence: title, pause, game over, and a save file in localStorage that
// carries money, position, weapons, wanted level and mission progress.
const SAVE_KEY = 'vice-harbor-save-v1';

export class Menus {
  constructor(audio) {
    this.audio = audio;
    this.title = document.getElementById('title');
    this.pause = document.getElementById('pause');
    this.over = document.getElementById('over');
    this.overText = document.getElementById('overText');
    this.state = 'title';
  }

  showTitle() {
    this.state = 'title';
    this.title.classList.add('on');
    this.pause.classList.remove('on');
    this.over.classList.remove('on');
  }

  hideTitle() {
    this.title.classList.remove('on');
  }

  showPause() {
    this.state = 'paused';
    this.pause.classList.add('on');
  }

  hidePause() {
    this.state = 'playing';
    this.pause.classList.remove('on');
  }

  showGameOver(reason = 'The harbor always collects.') {
    this.state = 'dead';
    this.overText.textContent = reason;
    this.over.classList.add('on');
  }

  hideGameOver() {
    this.state = 'playing';
    this.over.classList.remove('on');
  }
}

/** Save / load with a versioned key; anything unreadable is treated as no save. */
export const SaveSystem = {
  save(data) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, at: Date.now(), ...data }));
      return true;
    } catch {
      return false;
    }
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== 1) return null;
      return parsed;
    } catch {
      return null;
    }
  },
  clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* storage may be blocked; nothing to do */
    }
  },
  has() {
    return this.load() !== null;
  },
};
