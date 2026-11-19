// The story: six staged jobs with named characters, dialogue, objectives and rewards. A mission is a
// list of stages; each stage has an objective line, an optional line of dialogue and a completion
// test evaluated against the world.
import { dist2 } from '../core/math.js';

export const MISSIONS = [
  {
    id: 'ferry_ticket',
    name: 'Ferry Ticket',
    giver: 'mira',
    reward: 1200,
    district: 'harbor',
    stages: [
      {
        objective: 'Drive to the Cannery Ave drop and collect Mira\'s package',
        marker: { x: -150, z: -150 },
        dialogue: { who: 'Mira Kesang', portrait: 'mira', line: 'The cannery foreman owes me. Take the coupe, do not stop for anyone.' },
        complete: (s) => dist2(s.player.x, s.player.z, -150, -150) < 9,
      },
      {
        objective: 'Lose the pair of cruisers before they call it in',
        dialogue: { who: 'Mira Kesang', portrait: 'mira', line: 'They clocked the plate. Lose them in the Heights.' },
        onEnter: (s) => s.setWanted(2),
        complete: (s) => s.wanted === 0,
      },
      {
        objective: 'Bring the package back to the Anchor Way lockup',
        marker: { x: 150, z: 60 },
        dialogue: { who: 'Mira Kesang', portrait: 'mira', line: 'Good. Come back clean and we will talk about real money.' },
        complete: (s) => dist2(s.player.x, s.player.z, 150, 60) < 9,
      },
    ],
  },
  {
    id: 'salt_debt',
    name: 'Salt Debt',
    giver: 'tio',
    reward: 1800,
    district: 'coral',
    stages: [
      {
        objective: 'Find the loan shark on the Coral Heights boardwalk',
        marker: { x: 210, z: 150 },
        dialogue: { who: 'Tio Barrera', portrait: 'tio', line: 'The man on the boardwalk took my brother\'s boat. Get it back, or take the money.' },
        complete: (s) => dist2(s.player.x, s.player.z, 210, 150) < 12,
      },
      {
        objective: 'Take out his two bodyguards',
        dialogue: { who: 'Tio Barrera', portrait: 'tio', line: 'Two of them. Big ones. Shoot first, feel bad later.' },
        onEnter: (s) => { s.spawnThugs(210, 150, 2); s.setWanted(1); },
        complete: (s) => s.thugsDown >= 2,
      },
      {
        objective: 'Escape the beach patrol and reach the pier',
        marker: { x: 300, z: -70 },
        dialogue: { who: 'Tio Barrera', portrait: 'tio', line: 'Patrol boats called it in. Get to the pier, I have a man there.' },
        onEnter: (s) => s.setWanted(3),
        complete: (s) => dist2(s.player.x, s.player.z, 300, -70) < 16,
      },
    ],
  },
  {
    id: 'glass_hour',
    name: 'The Glass Hour',
    giver: 'vera',
    reward: 2600,
    district: 'neon',
    stages: [
      {
        objective: 'Meet Vera in the Neon Quarter alley behind the Meridian',
        marker: { x: 30, z: 30 },
        dialogue: { who: 'Vera Callas', portrait: 'vera', line: 'Two blocks of neon, one briefcase. Nobody in this city needs it more than me.' },
        complete: (s) => dist2(s.player.x, s.player.z, 30, 30) < 10,
      },
      {
        objective: 'Steal the courier car parked on Vice Blvd',
        dialogue: { who: 'Vera Callas', portrait: 'vera', line: 'Grey coupe, driver smokes on the corner. He will not fight you for it.' },
        onEnter: (s) => s.markCourierCar(),
        complete: (s) => s.driving && s.carIsCourier,
      },
      {
        objective: 'Outrun the response and park under the Verano overpass',
        marker: { x: -30, z: 150 },
        dialogue: { who: 'Vera Callas', portrait: 'vera', line: 'That is the alarm. Drive like the city owes you, because it does.' },
        onEnter: (s) => s.setWanted(4),
        complete: (s) => dist2(s.player.x, s.player.z, -30, 150) < 14,
      },
    ],
  },
  {
    id: 'dock_witness',
    name: 'Dock Witness',
    giver: 'deacon',
    reward: 3200,
    district: 'harbor',
    stages: [
      {
        objective: 'Reach the witness before the Deacon\'s men do',
        marker: { x: -210, z: -30 },
        dialogue: { who: 'Deacon Ruhl', portrait: 'deacon', line: 'A dockhand saw too much. He is at the north cannery. Move.' },
        complete: (s) => dist2(s.player.x, s.player.z, -210, -30) < 10,
      },
      {
        objective: 'Clear the dock of Deacon\'s crew',
        dialogue: { who: 'Deacon Ruhl', portrait: 'deacon', line: 'Four of them, and they know you are coming. Make it loud.' },
        onEnter: (s) => { s.spawnThugs(-210, -30, 4); s.setWanted(2); },
        complete: (s) => s.thugsDown >= 4,
      },
      {
        objective: 'Get the witness to the hospital in Coral Heights',
        marker: { x: 180, z: 210 },
        dialogue: { who: 'Deacon Ruhl', portrait: 'deacon', line: 'He talks to nobody but a doctor. Drive him yourself.' },
        onEnter: (s) => s.setWanted(3),
        complete: (s) => dist2(s.player.x, s.player.z, 180, 210) < 12,
      },
    ],
  },
  {
    id: 'last_call',
    name: 'Last Call at the Tide Room',
    giver: 'rico',
    reward: 4000,
    district: 'verano',
    stages: [
      {
        objective: 'Walk into the Tide Room and find Rico',
        marker: { x: 90, z: 90 },
        dialogue: { who: 'Rico Vance', portrait: 'rico', line: 'You look like the only person in here not carrying a grudge. Sit.' },
        complete: (s) => dist2(s.player.x, s.player.z, 90, 90) < 8,
      },
      {
        objective: 'Survive the ambush in the back room',
        dialogue: { who: 'Rico Vance', portrait: 'rico', line: 'That door should not be opening. It is a setup, and we are the setup.' },
        onEnter: (s) => { s.spawnThugs(90, 90, 3); s.setWanted(3); },
        complete: (s) => s.thugsDown >= 3,
      },
      {
        objective: 'Take Rico\'s car and shake the air unit',
        dialogue: { who: 'Rico Vance', portrait: 'rico', line: 'They brought a helicopter. Of course they brought a helicopter.' },
        onEnter: (s) => s.setWanted(5),
        complete: (s) => s.wanted === 0,
      },
    ],
  },
  {
    id: 'harbor_king',
    name: 'Harbor King',
    giver: 'mira',
    reward: 9000,
    district: 'neon',
    stages: [
      {
        objective: 'Take the fight to the Deacon\'s tower',
        marker: { x: 90, z: -90 },
        dialogue: { who: 'Mira Kesang', portrait: 'mira', line: 'Every job led here. Ruhl runs the harbor from the top floor of that tower.' },
        complete: (s) => dist2(s.player.x, s.player.z, 90, -90) < 12,
      },
      {
        objective: 'Fight up to the tower lobby',
        dialogue: { who: 'Deacon Ruhl', portrait: 'deacon', line: 'You climbed a long way to die in a lobby, courier.' },
        onEnter: (s) => { s.spawnThugs(90, -90, 5); s.setWanted(4); },
        complete: (s) => s.thugsDown >= 5,
      },
      {
        objective: 'Finish it and get out of the district alive',
        marker: { x: 0, z: 0 },
        dialogue: { who: 'Mira Kesang', portrait: 'mira', line: 'Whatever happens up there, the harbor is yours after tonight.' },
        onEnter: (s) => s.setWanted(5),
        complete: (s) => dist2(s.player.x, s.player.z, 0, 0) < 14 && s.wanted === 0,
      },
    ],
  },
];

export class MissionRunner {
  constructor(hud, audio) {
    this.hud = hud;
    this.audio = audio;
    this.index = -1;
    this.stage = 0;
    this.active = false;
    this.completed = new Set();
    this.subtitleTimer = 0;
    this.subtitle = null;
    this.thugsDown = 0;
  }

  get mission() {
    return this.index >= 0 ? MISSIONS[this.index] : null;
  }

  get stageData() {
    const m = this.mission;
    return m ? m.stages[this.stage] : null;
  }

  /** Start the next unfinished job. */
  startNext(game) {
    for (let i = 0; i < MISSIONS.length; i++) {
      if (!this.completed.has(MISSIONS[i].id)) {
        this.begin(i, game);
        return MISSIONS[i];
      }
    }
    this.hud.toast('Every job on the board is done. The harbor is quiet.');
    return null;
  }

  begin(index, game) {
    this.index = index;
    this.stage = 0;
    this.active = true;
    this.thugsDown = 0;
    const st = this.stageData;
    if (st.onEnter) st.onEnter(game);
    if (st.dialogue) this.say(st.dialogue);
    this.hud.toast(`NEW JOB · ${this.mission.name}`);
    if (this.audio) this.audio.play('click');
  }

  say(dialogue, seconds = 6.5) {
    this.subtitle = dialogue;
    this.subtitleTimer = seconds;
  }

  /** Called each simulation step. */
  update(dt, game) {
    if (this.subtitleTimer > 0) {
      this.subtitleTimer -= dt;
      if (this.subtitleTimer <= 0) this.subtitle = null;
    }
    if (!this.active) return;
    const st = this.stageData;
    if (!st) return;
    if (st.complete(game)) {
      this.stage++;
      this.thugsDown = 0;
      const next = this.stageData;
      if (!next) {
        this.finish(game);
      } else {
        if (next.onEnter) next.onEnter(game);
        if (next.dialogue) this.say(next.dialogue);
        this.hud.toast(`STAGE ${this.stage + 1} · ${next.objective}`);
      }
    }
  }

  finish(game) {
    const m = this.mission;
    this.completed.add(m.id);
    this.active = false;
    game.money += m.reward;
    this.hud.banner('MISSION COMPLETE', m.name, `+$${m.reward.toLocaleString('en-US')}`, 5);
    if (this.audio) this.audio.play('click');
    this.subtitle = null;
    this.index = -1;
  }

  get marker() {
    const st = this.stageData;
    return st?.marker ?? null;
  }

  get progress() {
    if (!this.mission) return 0;
    return this.stage / this.mission.stages.length;
  }

  get objective() {
    const st = this.stageData;
    return st ? st.objective : null;
  }

  get stageLabel() {
    if (!this.mission) return null;
    return `Stage ${this.stage + 1} of ${this.mission.stages.length}`;
  }

  toJSON() {
    return { index: this.index, stage: this.stage, active: this.active, completed: [...this.completed] };
  }

  fromJSON(data) {
    if (!data) return;
    this.index = data.index ?? -1;
    this.stage = data.stage ?? 0;
    this.active = !!data.active;
    this.completed = new Set(data.completed ?? []);
  }
}
