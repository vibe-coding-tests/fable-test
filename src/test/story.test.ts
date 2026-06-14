import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data/index';
import { REG } from '../core/registry';
import { Game, HeadlessAudio, HeadlessScene, newGameSave, type AudioLike } from '../systems/game';
import { CinematicDirector } from '../engine/cinematic';
import { compileCutsceneDsl } from '../engine/cutscene-dsl';
import { OUTWORLD_CLAIMANT_RAID_IDS } from '../data/cutscenes';
import { StoryDetector } from '../engine/story-detectors';
import type { Sim } from '../core/sim';
import type { CutsceneDef, GameSave, SimEvent, StingerId } from '../core/types';
import type { CinematicMixMode } from '../engine/audio';

beforeAll(() => registerAllContent());

function freshGame(): Game {
  return Game.headless(newGameSave('juggernaut'), { cinematics: true });
}

class RecordingAudio implements AudioLike {
  stingers: StingerId[] = [];
  mixes: CinematicMixMode[] = [];
  dialogue: string[] = [];
  setSettings(): void {}
  handleEvent(): void {}
  playStinger(id: StingerId): void { this.stingers.push(id); }
  setCinematicMix(mode: CinematicMixMode): void { this.mixes.push(mode); }
  playDialogueBlip(seed = ''): void { this.dialogue.push(seed); }
  update(): void {}
}

function recordedGame(save: GameSave = newGameSave('juggernaut')): { game: Game; audio: RecordingAudio } {
  const audio = new RecordingAudio();
  return { game: new Game(null, save, { scene: new HeadlessScene(), audio }), audio };
}

function fullPartyGame(regionId = 'tranquil-vale'): Game {
  const save = newGameSave('juggernaut');
  const heroes = ['juggernaut', 'axe', 'crystal-maiden', 'sniper', 'sven'];
  const template = save.roster[0];
  save.playtimeSec = 1;
  save.regionId = regionId;
  save.playerPos = { ...REG.region(regionId).town.pos };
  save.party = heroes;
  save.recruited = heroes;
  save.roster = heroes.map((heroId) => ({
    ...structuredClone(template),
    heroId,
    level: 30,
    xp: 0
  }));
  return Game.headless(save, { cinematics: true });
}

interface FakeUnit {
  uid: number;
  team: number;
  pos: { x: number; y: number };
  alive: boolean;
  hp: number;
  heroId?: string;
  stats: { maxHp: number };
  ctrl: { kind: string };
}

function fakeSim(units: FakeUnit[]): Sim {
  return {
    unit: (uid: number) => units.find((u) => u.uid === uid),
    unitsArr: units
  } as unknown as Sim;
}

function castEvent(uid: number, abilityId: string): Extract<SimEvent, { t: 'cast' }> {
  return { t: 'cast', uid, abilityId, vfx: { archetype: 'ground-aoe', color: '#fff' } };
}

// ----------------------------------------------------------------
// STORY §7.3 — esports legend detector (Pit Remembers, Hooked Home)
// ----------------------------------------------------------------
describe('STORY §7.3 legend detector', () => {
  function enemyRing(count: number, center: { x: number; y: number }, radius: number): FakeUnit[] {
    return Array.from({ length: count }, (_, i) => ({
      uid: 100 + i, team: 1, pos: { x: center.x + radius * (i % 2), y: center.y }, alive: true, hp: 100, stats: { maxHp: 100 }, ctrl: { kind: 'gambit' }
    }));
  }

  it('fires Pit Remembers on an Echo Slam catching 4+ enemies inside Roshan\'s Pit', () => {
    const es: FakeUnit = { uid: 1, team: 0, heroId: 'earthshaker', pos: { x: 0, y: 0 }, alive: true, hp: 500, stats: { maxHp: 500 }, ctrl: { kind: 'gambit' } };
    const sim = fakeSim([es, ...enemyRing(4, { x: 100, y: 0 }, 50)]);
    const det = new StoryDetector();
    const out = det.observe([castEvent(1, 'es-echo-slam')], { sim, nowSec: 1, playerTeam: 0, raidId: 'roshan-pit' });
    expect(out).toContainEqual({ kind: 'legend', legendId: 'pit-remembers' });
  });

  it('does NOT fire Pit Remembers with too few enemies, or outside the Pit (no false positives)', () => {
    const es: FakeUnit = { uid: 1, team: 0, heroId: 'earthshaker', pos: { x: 0, y: 0 }, alive: true, hp: 500, stats: { maxHp: 500 }, ctrl: { kind: 'gambit' } };
    const few = fakeSim([es, ...enemyRing(3, { x: 100, y: 0 }, 50)]);
    expect(new StoryDetector().observe([castEvent(1, 'es-echo-slam')], { sim: few, nowSec: 1, playerTeam: 0, raidId: 'roshan-pit' })).toHaveLength(0);

    const plenty = fakeSim([es, ...enemyRing(5, { x: 100, y: 0 }, 50)]);
    expect(new StoryDetector().observe([castEvent(1, 'es-echo-slam')], { sim: plenty, nowSec: 1, playerTeam: 0, raidId: 'lord-of-terror' })).toHaveLength(0);
  });

  it('fires Hooked Home when a player Pudge in the base zone hooks a victim to its death', () => {
    const pudge: FakeUnit = { uid: 1, team: 0, heroId: 'pudge', pos: { x: 0, y: 0 }, alive: true, hp: 500, stats: { maxHp: 500 }, ctrl: { kind: 'player' } };
    const victim: FakeUnit = { uid: 2, team: 1, pos: { x: 30, y: 0 }, alive: false, hp: 0, stats: { maxHp: 100 }, ctrl: { kind: 'gambit' } };
    const sim = fakeSim([pudge, victim]);
    const det = new StoryDetector();
    const events: SimEvent[] = [{ ...castEvent(1, 'pudge-meat-hook'), target: 2 }, { t: 'death', uid: 2, killer: 1 }];
    const out = det.observe(events, { sim, nowSec: 1, playerTeam: 0, townPos: { x: 0, y: 0 }, townRadius: 900 });
    expect(out).toContainEqual({ kind: 'legend', legendId: 'hooked-home' });
  });

  it('does NOT fire Hooked Home when Pudge or the victim is nowhere near home', () => {
    const pudge: FakeUnit = { uid: 1, team: 0, heroId: 'pudge', pos: { x: 5000, y: 5000 }, alive: true, hp: 500, stats: { maxHp: 500 }, ctrl: { kind: 'player' } };
    const victim: FakeUnit = { uid: 2, team: 1, pos: { x: 5030, y: 5000 }, alive: false, hp: 0, stats: { maxHp: 100 }, ctrl: { kind: 'gambit' } };
    const sim = fakeSim([pudge, victim]);
    const events: SimEvent[] = [{ ...castEvent(1, 'pudge-meat-hook'), target: 2 }, { t: 'death', uid: 2, killer: 1 }];
    expect(new StoryDetector().observe(events, { sim, nowSec: 1, playerTeam: 0, townPos: { x: 0, y: 0 }, townRadius: 900 })).toHaveLength(0);

    const homePudge: FakeUnit = { ...pudge, pos: { x: 0, y: 0 } };
    const farVictim: FakeUnit = { ...victim, pos: { x: 2200, y: 0 } };
    expect(new StoryDetector().observe(events, { sim: fakeSim([homePudge, farVictim]), nowSec: 1, playerTeam: 0, townPos: { x: 0, y: 0 }, townRadius: 900 })).toHaveLength(0);
  });

  it('fires The Coil That Closed the Game when Puck coils 2+ enemies with an escape-action proxy', () => {
    const puck: FakeUnit = { uid: 1, team: 0, heroId: 'puck', pos: { x: 0, y: 0 }, alive: true, hp: 500, stats: { maxHp: 500 }, ctrl: { kind: 'gambit' } };
    const enemies = enemyRing(2, { x: 100, y: 0 }, 50);
    (enemies[0] as FakeUnit & { order: { kind: string; point: { x: number; y: number } } }).order = { kind: 'move', point: { x: 500, y: 0 } };
    const sim = fakeSim([puck, ...enemies]);
    const out = new StoryDetector().observe([castEvent(1, 'puck-dream-coil')], { sim, nowSec: 1, playerTeam: 0 });
    expect(out).toContainEqual({ kind: 'legend', legendId: 'coil-closed-game' });
  });

  it('does NOT fire The Coil That Closed the Game on two idle enemies', () => {
    const puck: FakeUnit = { uid: 1, team: 0, heroId: 'puck', pos: { x: 0, y: 0 }, alive: true, hp: 500, stats: { maxHp: 500 }, ctrl: { kind: 'gambit' } };
    const sim = fakeSim([puck, ...enemyRing(2, { x: 100, y: 0 }, 50)]);
    expect(new StoryDetector().observe([castEvent(1, 'puck-dream-coil')], { sim, nowSec: 1, playerTeam: 0 })).toHaveLength(0);
  });

  it('fires The Call That Paid Out when Axe dies after a decisive call', () => {
    const axe: FakeUnit = { uid: 1, team: 0, heroId: 'axe', pos: { x: 0, y: 0 }, alive: false, hp: 0, stats: { maxHp: 500 }, ctrl: { kind: 'player' } };
    const enemy: FakeUnit = { uid: 2, team: 1, pos: { x: 100, y: 0 }, alive: false, hp: 0, stats: { maxHp: 100 }, ctrl: { kind: 'gambit' } };
    const det = new StoryDetector();
    const out = det.observe([castEvent(1, 'axe-berserkers-call'), { t: 'death', uid: 1, killer: 2 }], { sim: fakeSim([axe, enemy]), nowSec: 1, playerTeam: 0 });
    expect(out).toContainEqual({ kind: 'legend', legendId: 'call-paid-out' });
  });

  it('fires Rampage on five player kills in the streak window', () => {
    const carry: FakeUnit = { uid: 1, team: 0, pos: { x: 0, y: 0 }, alive: true, hp: 500, stats: { maxHp: 500 }, ctrl: { kind: 'player' } };
    const enemies = enemyRing(5, { x: 100, y: 0 }, 50).map((e) => ({ ...e, alive: false, hp: 0 }));
    const det = new StoryDetector();
    const events = enemies.map((e) => ({ t: 'death' as const, uid: e.uid, killer: 1 }));
    const out = det.observe(events, { sim: fakeSim([carry, ...enemies]), nowSec: 1, playerTeam: 0 });
    expect(out).toContainEqual({ kind: 'legend', legendId: 'rampage' });
  });

  it('does NOT fire Rampage if the killer dies before reaching five kills', () => {
    const carry: FakeUnit = { uid: 1, team: 0, pos: { x: 0, y: 0 }, alive: false, hp: 0, stats: { maxHp: 500 }, ctrl: { kind: 'player' } };
    const enemies = enemyRing(5, { x: 100, y: 0 }, 50).map((e) => ({ ...e, alive: false, hp: 0 }));
    const det = new StoryDetector();
    const events: SimEvent[] = [
      ...enemies.slice(0, 4).map((e) => ({ t: 'death' as const, uid: e.uid, killer: 1 })),
      { t: 'death', uid: 1, killer: 100 },
      { t: 'death', uid: enemies[4].uid, killer: 1 }
    ];
    const out = det.observe(events, { sim: fakeSim([carry, ...enemies]), nowSec: 1, playerTeam: 0 });
    expect(out).not.toContainEqual({ kind: 'legend', legendId: 'rampage' });
  });

  it('fires the first resonance story trigger from reaction events', () => {
    const det = new StoryDetector();
    const out = det.observe([
      { t: 'reaction', uid: 2, from: 1, reaction: 'vaporize', elements: ['hydro', 'pyro'] }
    ], { sim: fakeSim([]), nowSec: 1, playerTeam: 0 });
    expect(out).toContainEqual({ kind: 'resonance', reaction: 'vaporize' });
  });
});

// ----------------------------------------------------------------
// STORY §6.6 — boss phase-break detector
// ----------------------------------------------------------------
describe('STORY §6.6 boss phase detector', () => {
  it('fires authored phase thresholds one at a time, not just the generic midpoint', () => {
    const boss: FakeUnit = { uid: 9, team: 1, pos: { x: 0, y: 0 }, alive: true, hp: 70, stats: { maxHp: 100 }, ctrl: { kind: 'boss' } };
    const sim = fakeSim([boss]);
    const det = new StoryDetector();
    det.beginEncounter();
    expect(det.observe([], { sim, nowSec: 1, playerTeam: 0, raidId: 'last-eldwurm', bossHeroId: 'dragon-knight', bossPhaseHpPct: [66, 33] })).toHaveLength(0);
    boss.hp = 60;
    const first = det.observe([], { sim, nowSec: 2, playerTeam: 0, raidId: 'last-eldwurm', bossHeroId: 'dragon-knight', bossPhaseHpPct: [66, 33] });
    expect(first).toContainEqual({ kind: 'boss-phase', bossHeroId: 'dragon-knight', raidId: 'last-eldwurm' });
    expect(det.observe([], { sim, nowSec: 3, playerTeam: 0, raidId: 'last-eldwurm', bossHeroId: 'dragon-knight', bossPhaseHpPct: [66, 33] })).toHaveLength(0);
    boss.hp = 20;
    expect(det.observe([], { sim, nowSec: 4, playerTeam: 0, raidId: 'last-eldwurm', bossHeroId: 'dragon-knight', bossPhaseHpPct: [66, 33] })).toContainEqual({ kind: 'boss-phase', bossHeroId: 'dragon-knight', raidId: 'last-eldwurm' });
  });

  it('marks a non-marquee boss without a marquee raid id', () => {
    const boss: FakeUnit = { uid: 9, team: 1, pos: { x: 0, y: 0 }, alive: true, hp: 10, stats: { maxHp: 100 }, ctrl: { kind: 'boss' } };
    const det = new StoryDetector();
    det.beginEncounter();
    const out = det.observe([], { sim: fakeSim([boss]), nowSec: 1, playerTeam: 0, raidId: 'roshan-pit', bossHeroId: 'sven' });
    expect(out).toContainEqual({ kind: 'boss-phase', bossHeroId: 'sven', raidId: 'roshan-pit' });
  });
});

// ----------------------------------------------------------------
// STORY §3.4 — cut-scene controls & degrade matrix
// ----------------------------------------------------------------
describe('STORY §3.4 cut-scene controls', () => {
  const setpiece: CutsceneDef = {
    id: 'test-setpiece', title: 'T', tier: 'setpiece', trigger: { kind: 'new-game' }, skippable: true,
    beats: [
      { shot: { angle: 'wide', move: 'hold', palette: 'p', mood: 'm' }, line: { speaker: 'N', text: 'Beat one line of text.' }, hold: 3 },
      { shot: { angle: 'wide', move: 'hold', palette: 'p', mood: 'm' }, hold: 3 },
      { shot: { angle: 'wide', move: 'hold', palette: 'p', mood: 'm' }, hold: 3 }
    ]
  };

  it('alwaysSkip / length:off route a beat to a toast instead of staging it', () => {
    const d = new CinematicDirector();
    d.setSettings({ alwaysSkip: true });
    expect(d.routesToToast(setpiece)).toBe(true);
    d.setSettings({ alwaysSkip: false, length: 'off' });
    expect(d.routesToToast(setpiece)).toBe(true);
    d.setSettings({ length: 'full' });
    expect(d.routesToToast(setpiece)).toBe(false);
  });

  it('required-staging climax scenes shorten instead of routing to toast', () => {
    const d = new CinematicDirector();
    d.setSettings({ length: 'off', alwaysSkip: true });
    const climax = { ...setpiece, id: 'champion-clear', requiredStaging: true };
    expect(d.routesToToast(climax)).toBe(false);
    d.play(climax, {}, false);
    expect(d.view()?.beatCount).toBe(2);
    expect(d.view()?.speed).toBe(4);
  });

  it('length:short degrades a setpiece to its stinger (fewer beats)', () => {
    const d = new CinematicDirector();
    d.setSettings({ length: 'short' });
    d.play(setpiece, {}, false);
    expect(d.view()?.beatCount).toBe(2);
  });

  it('default speed and fast-forward stepping (4x/8x/2x) work', () => {
    const d = new CinematicDirector();
    d.setSettings({ defaultSpeed: 2 });
    d.play(setpiece, {}, false);
    expect(d.view()?.speed).toBe(2);
    d.setFastForward(true); expect(d.view()?.speed).toBe(4);
    d.setFastForward(true); expect(d.view()?.speed).toBe(8);
    d.setFastForward(true); expect(d.view()?.speed).toBe(2);
    d.setFastForward(false); expect(d.view()?.speed).toBe(2);
  });

  it('repeat set-pieces auto-fast-forward instead of collapsing to a toast', () => {
    const d = new CinematicDirector();
    d.play(setpiece, {}, true);
    expect(d.view()?.speed).toBeGreaterThan(1);

    const g = freshGame();
    while (g.cinematic.active) g.cinematicSkip();
    const toastCount = g.toasts.length;
    expect(g.playCutscene('prologue-moon-breaks')).toBe(true);
    expect(g.cinematic.active).toBe(true);
    expect(g.cinematic.view()?.speed).toBeGreaterThan(1);
    expect(g.toasts.length).toBe(toastCount);
  });

  it('exposes reduced-motion and photosensitivity caps to presentation', () => {
    const d = new CinematicDirector();
    d.setSettings({ reducedMotion: true, photosensitive: true });
    d.play(setpiece, {}, false);
    expect(d.view()?.reducedMotion).toBe(true);
    expect(d.view()?.photosensitive).toBe(true);
  });

  it('typewriter: a tap completes the line before the next tap advances', () => {
    const d = new CinematicDirector();
    d.play(setpiece, {}, false);
    expect(d.view()?.revealedText.length).toBeLessThan(d.view()!.text!.length);
    d.advance();
    expect(d.view()?.revealedText).toBe(d.view()?.text);
    expect(d.view()?.beatIndex).toBe(0);
    d.advance();
    expect(d.view()?.beatIndex).toBe(1);
  });

  it('skip is hold-to-confirm on a first view, instant on a seen one', () => {
    const d = new CinematicDirector();
    d.play(setpiece, {}, false);
    d.requestSkip();
    expect(d.active).toBe(true);
    d.update(0.2); expect(d.active).toBe(true);
    d.update(0.3); expect(d.active).toBe(false);

    d.play(setpiece, {}, true);
    d.requestSkip();
    expect(d.active).toBe(false);
  });

  it('replay ignores degrade and runs at 1x full length', () => {
    const d = new CinematicDirector();
    d.setSettings({ length: 'short', defaultSpeed: 4, alwaysSkip: true });
    d.replay(setpiece, {});
    expect(d.view()?.beatCount).toBe(3);
    expect(d.view()?.speed).toBe(1);
  });
});

// ----------------------------------------------------------------
// STORY §5 — cut-scene authoring DSL
// ----------------------------------------------------------------
describe('STORY §5 cut-scene DSL', () => {
  it('compiles authored beats into CutsceneDef data', () => {
    const def = compileCutsceneDsl(`
      BEAT {
        SHOT: low/push-in/Bluescale/Ominous
        STAGE: {DevelopCharacter(target="boss", gesture="ground-slam")}
        LINE: The Last Eldwurm : "The last of my brothers fell. I did not."
        HOLD: 2.4
        SOUND: raid-clear
      }
    `, {
      id: 'dsl-last-eldwurm',
      title: 'The Last Eldwurm',
      tier: 'setpiece',
      trigger: { kind: 'raid-intro', raidId: 'last-eldwurm' },
      category: 'Raids',
      replayable: true
    });
    expect(def.skippable).toBe(true);
    expect(def.beats[0].shot).toEqual({ angle: 'low', move: 'push-in', palette: 'Bluescale', mood: 'Ominous' });
    expect(def.beats[0].stage).toContainEqual({ kind: 'focus', target: 'boss' });
    expect(def.beats[0].stage).toContainEqual({ kind: 'gesture', target: 'boss', gesture: 'ground-slam' });
    expect(def.beats[0].line?.text).toContain('brothers fell');
    expect(def.beats[0].sound).toBe('raid-clear');
  });

  it('resolves ref: dialogue without duplicating shipped strings', () => {
    const def = compileCutsceneDsl(`
      BEAT {
        SHOT: through-objects/rack-focus/voidlight/withheld
        STAGE: {RevealMystery(mystery="the claimant", target="boss")}
        LINE: Claimant : "ref:last-eldwurm.dialogue[0]"
        HOLD: 2.0
      }
    `, {
      id: 'dsl-ref-last-eldwurm',
      title: 'Ref',
      tier: 'stinger',
      trigger: { kind: 'raid-intro', raidId: 'last-eldwurm' }
    });
    expect(def.beats[0].shot.angle).toBe('through-objects');
    expect(def.beats[0].shot.move).toBe('rack-focus');
    expect(def.beats[0].line?.text).toBe(REG.raid('last-eldwurm').dialogue[0]);
  });
});

// ----------------------------------------------------------------
// STORY §8 — cinematics gallery + §7.4 titles + §2.6/§7.4 content
// ----------------------------------------------------------------
describe('STORY gallery, titles & content', () => {
  it('passes the active cinematic view into the scene update path', () => {
    let lastCinematicId: string | null = null;
    const scene = {
      selectedUid: -1,
      terrain: { obstacles: [] },
      pushEvent: () => {},
      update: (_sim: unknown, _follow: unknown, _dt: number, _day: number, cinematic: { id?: string } | null = null) => {
        lastCinematicId = cinematic?.id ?? null;
      },
      resetUnitViews: () => {},
      setDungeonRoom: () => {}
    };
    const g = new Game(null, newGameSave('juggernaut'), { scene, audio: new HeadlessAudio() });
    g.update(0.016);
    expect(lastCinematicId).toBe('prologue-moon-breaks');
  });

  it('does not advance overworld combat while the prologue is active', () => {
    const g = freshGame();
    const startSimTime = g.sim.time;
    const startPlaytime = g.playtime;
    const startHp = g.activeUnit()?.hp;

    g.update(1);

    expect(g.cinematic.active).toBe(true);
    expect(g.sim.time).toBe(startSimTime);
    expect(g.playtime).toBe(startPlaytime);
    expect(g.activeUnit()?.hp).toBe(startHp);
  });

  it('gallery hides unseen replayable scenes spoiler-safe and replays only seen ones', () => {
    const g = freshGame();
    while (g.cinematic.active) g.cinematicSkip();
    const groups = g.cinematicGallery();
    const all = groups.flatMap((gr) => gr.entries);
    expect(all.length).toBeGreaterThan(0);
    // The prologue auto-plays on a fresh game, so it is seen + replayable.
    const prologue = all.find((e) => e.id === 'prologue-moon-breaks');
    expect(prologue?.seen).toBe(true);
    expect(prologue?.caption).toContain('Director note:');
    expect(prologue?.caption).toContain('Mad Moon');
    expect(g.replayCutscene('prologue-moon-breaks')).toBe(true);
    while (g.cinematic.active) g.cinematicSkip();
    // An unseen replayable scene is locked and cannot be replayed.
    const unseen = all.find((e) => !e.seen);
    expect(unseen?.title.startsWith('???')).toBe(true);
    if (unseen) expect(g.replayCutscene(unseen.id)).toBe(false);
  });

  it('True Champion title unlocks from a Hell-tier Roshan clear and shows in the journal', () => {
    const g = freshGame();
    expect(g.journalSections().titles).toHaveLength(0);
    g.codexUnlock('title:true-champion');
    expect(g.journalSections().titles.map((t) => t.id)).toContain('true-champion');
  });

  it('the Aegis carries its Champions inscription, and every hero Echo carries a Loop turn note', () => {
    expect(REG.item('aegis-of-the-immortal').lore.toLowerCase()).toContain('inscribed');
    for (const hero of REG.heroes.values()) {
      expect(hero.lore, hero.id).toMatch(/turn [\d,]+ of the Loop/);
    }
    expect(REG.creep('kobold').lore).toContain('Moon-stone');
    expect([...REG.bosses.values()].every((b) => b.dialogue.length >= 2)).toBe(true);
  });

  it('tie-in setting suppresses festivals and legend callouts independently', () => {
    const g = freshGame();
    while (g.cinematic.active) g.cinematicSkip();
    g.settings.cutscene!.tieIns = false;
    expect(g.runSeasonalEvent('wraith-night-altar')).toBe(false);
    expect(g.triggerLegendCallout('pit-remembers')).toBe(false);
    expect(g.codexUnlocks.has('festival:wraith-night-altar')).toBe(false);
    expect(g.codexUnlocks.has('legend:pit-remembers')).toBe(false);
  });

  it('a festival that cannot launch its mode is remembered without paying its clear reward', () => {
    const g = freshGame();
    while (g.cinematic.active) g.cinematicSkip();
    expect(g.festivalLaunchable('diretide-roshan-candy')).toBe(false); // fresh game has no full party
    const goldBefore = g.gold;
    expect(g.runSeasonalEvent('wraith-night-altar')).toBe(true);
    expect(g.gold).toBe(goldBefore);
    expect(g.codexUnlocks.has('festival:wraith-night-altar')).toBe(true);
  });

  it('maps every seasonal event to a concrete playable raid or dungeon target', () => {
    const g = freshGame();
    for (const event of REG.seasonalEvents.values()) {
      const status = g.seasonalEventStatus(event.id);
      expect(status.target, event.id).not.toBe('Unknown');
      expect(status.target, event.id).toMatch(/Raid|Dungeon|Endless dungeon/);
      if (status.launchable) expect(status.detail, event.id).toContain('Mechanics:');
    }
  });

  it('surfaces bespoke mechanics for the flagship seasonal modes', () => {
    const diretide = fullPartyGame('mad-moon-crater').seasonalEventStatus('diretide-roshan-candy');
    expect(diretide.detail).toContain('candy tribute');
    expect(diretide.detail).toContain('Roshling-style add waves');

    const wraithNight = fullPartyGame('icewrack').seasonalEventStatus('wraith-night-altar');
    expect(wraithNight.detail).toContain('altar defense');
    expect(wraithNight.detail).toContain('packed waves');

    const continuum = fullPartyGame('quoidge').seasonalEventStatus('continuum-descent');
    expect(continuum.target).toContain('Endless dungeon');
    expect(continuum.detail).toContain('choice exits');
  });

  it('starts a raid-backed festival when launch requirements are met', () => {
    const g = fullPartyGame('shadeshore');
    const goldBefore = g.gold;
    expect(g.festivalLaunchable('dark-reef-crawl')).toBe(true);
    expect(g.runSeasonalEvent('dark-reef-crawl')).toBe(true);
    expect(g.liveRaid?.def.id).toBe('renegade-marshal');
    expect(g.gold).toBe(goldBefore);
  });

  it('runs flagship raid-backed festival mechanics as live pressure, not just copy', () => {
    const g = fullPartyGame('mad-moon-crater');
    expect(g.festivalLaunchable('diretide-roshan-candy')).toBe(true);
    expect(g.runSeasonalEvent('diretide-roshan-candy')).toBe(true);
    expect(g.liveRaid?.festivalObjective()?.mode).toBe('roshan-candy');

    // Sample in fine steps: the Roshling adds are real sim units, but a maxed
    // party clears them within a second or two of each spawn, so checking only
    // at the end is racy. Detect a live enemy summon at any point near a wave.
    let sawSummon = false;
    for (let i = 0; i < 250 && !g.liveRaid!.done && !sawSummon; i++) {
      g.liveRaid!.step(0.1);
      if (g.liveRaid!.sim.unitsArr.some((u) => u.kind === 'summon' && u.team === 1)) sawSummon = true;
    }
    const objective = g.liveRaid!.festivalObjective();
    expect(objective?.tributeTicks).toBeGreaterThan(0);
    expect(objective?.wavesSpawned).toBeGreaterThan(0);
    expect(sawSummon).toBe(true);
  });

  it('runs the remaining raid-backed festival modes with live objective pressure', () => {
    const cycle = fullPartyGame('mad-moon-crater');
    expect(cycle.runSeasonalEvent('cycle-beast')).toBe(true);
    const dmgBefore = cycle.liveRaid!.boss.externalMods.damagePct ?? 0;
    cycle.liveRaid!.step(16);
    expect(cycle.liveRaid!.festivalObjective()?.mode).toBe('damage-race');
    expect(cycle.liveRaid!.festivalObjective()?.tributeTicks).toBeGreaterThan(0);
    expect(cycle.liveRaid!.boss.externalMods.damagePct ?? 0).toBeGreaterThan(dmgBefore);

    const reef = fullPartyGame('shadeshore');
    expect(reef.runSeasonalEvent('dark-reef-crawl')).toBe(true);
    reef.liveRaid!.step(22);
    expect(reef.liveRaid!.festivalObjective()?.mode).toBe('linear-crawl');
    expect(reef.liveRaid!.festivalObjective()?.wavesSpawned).toBeGreaterThan(0);
  });

  it('starts a dungeon-backed festival in its target region with event modifiers', () => {
    const g = fullPartyGame('vile-reaches');
    expect(g.festivalLaunchable('crowns-fall')).toBe(true);
    expect(g.runSeasonalEvent('crowns-fall')).toBe(true);
    expect(g.liveDungeon?.def.id).toBe('worldstone-vault');
    expect(g.liveDungeon?.selectedModifiers()).toEqual(['champion-sigil', 'deep-map']);
  });

  it('runs dungeon-backed festival modes with live pulse objectives', () => {
    const hollow = fullPartyGame('mad-moon-crater');
    expect(hollow.runSeasonalEvent('collapsing-hollow')).toBe(true);
    hollow.liveDungeon!.step(15);
    expect(hollow.liveDungeon!.festivalObjective()?.mode).toBe('hazard-survival');
    expect(hollow.liveDungeon!.festivalObjective()?.pulses).toBeGreaterThan(0);

    const crown = fullPartyGame('vile-reaches');
    expect(crown.runSeasonalEvent('crowns-fall')).toBe(true);
    crown.liveDungeon!.step(19);
    expect(crown.liveDungeon!.festivalObjective()?.mode).toBe('act-trials');
    expect(crown.liveDungeon!.festivalObjective()?.actRooms).toBeGreaterThan(0);

    const continuum = fullPartyGame('quoidge');
    expect(continuum.runSeasonalEvent('continuum-descent')).toBe(true);
    continuum.liveDungeon!.step(21);
    expect(continuum.liveDungeon!.festivalObjective()?.mode).toBe('endless-descent');
    expect(continuum.liveDungeon!.festivalObjective()?.pulses).toBeGreaterThan(0);
  });

  it('registers the full STORY §7 festival and legend roster', () => {
    expect(REG.seasonalEvents.size).toBeGreaterThanOrEqual(9);
    expect(REG.legends.size).toBeGreaterThanOrEqual(5);
    for (const event of REG.seasonalEvents.values()) expect(REG.cutscenes.has(event.cutsceneId)).toBe(true);
    for (const legend of REG.legends.values()) expect(REG.cutscenes.has(legend.cutsceneId)).toBe(true);
  });

  it('ships the Sundered Betrayer as an Outworld Claimant with a raid intro', () => {
    const raid = REG.raid('sundered-betrayer');
    expect(raid.boss.heroId).toBe('terrorblade');
    expect(raid.dialogue.length).toBeGreaterThanOrEqual(2);
    expect(REG.quests.has(raid.unlockQuest)).toBe(true);
    expect(REG.cutscenes.has('raid-intro-sundered-betrayer')).toBe(true);
  });

  it('upgrades region arrivals from caption cards into directed two-beat establishes', () => {
    const icewrack = REG.cutscene('arrival-icewrack');
    expect(icewrack.beats.length).toBeGreaterThanOrEqual(2);
    expect(icewrack.beats[0].stage?.some((s) => s.kind === 'describe-environment')).toBe(true);
    expect(icewrack.beats[1].stage?.some((s) => s.kind === 'reveal-mystery')).toBe(true);

    const crater = REG.cutscene('arrival-mad-moon-crater');
    expect(crater.tier).toBe('setpiece');
    expect(crater.beats[1].stage).toContainEqual({ kind: 'focus', target: 'tower' });
  });

  it('authors production raid intros through ref-resolved dialogue and registers directed clear/phase beats', () => {
    expect(REG.cutscene('prologue-moon-breaks').galleryCaption).toContain('Director note');
    expect(REG.cutscene('bind-first').beats[1].stage?.some((s) => s.kind === 'advance-plot')).toBe(true);

    const intro = REG.cutscene('raid-intro-last-eldwurm');
    expect(intro.music).toBe('duck');
    expect(intro.beats[1].line?.text).toBe(REG.raid('last-eldwurm').dialogue[0]);
    expect(intro.beats[2].line?.text).toBe(REG.raid('last-eldwurm').dialogue[1]);

    const phase = REG.cutscene('raid-phase-renegade-marshal');
    expect(phase.beats[0].line?.text).toContain('wreck');
    const clear = REG.cutscene('raid-clear-renegade-marshal');
    expect(clear.beats[0].line?.text).toContain('fleet');
  });

  it('gives every marquee and claimant raid a bespoke, world-keyed intro instead of a shared template', () => {
    const ids = [...new Set([...OUTWORLD_CLAIMANT_RAID_IDS, 'last-eldwurm', 'roshan-pit', 'lich-king'])];
    const openerFramings = new Set<string>();
    const revealFramings = new Set<string>();
    for (const raidId of ids) {
      const raid = REG.raid(raidId);
      const intro = REG.cutscene(`raid-intro-${raidId}`);
      expect(intro.tier, raidId).toBe('setpiece');
      expect(intro.music, raidId).toBe('duck');
      expect(intro.beats.length, raidId).toBe(3);

      // Withheld opener: the silhouette must not be focused yet, and the beat
      // sets the scene with an establishing/withholding verb.
      const opener = intro.beats[0];
      expect(opener.stage?.some((s) => s.kind === 'focus' && s.target === 'boss'), raidId).toBe(false);
      expect(
        opener.stage?.some((s) => ['describe-environment', 'reveal-mystery', 'set-tone', 'establish-history'].includes(s.kind)),
        raidId
      ).toBe(true);

      // Reveal + claim land the two shipped raid lines and the claim stings.
      expect(intro.beats[1].line?.text, raidId).toBe(raid.dialogue[0]);
      expect(intro.beats[1].stage?.some((s) => s.kind === 'focus' && s.target === 'boss'), raidId).toBe(true);
      expect(intro.beats[2].line?.text, raidId).toBe(raid.dialogue[1]);
      expect(intro.beats[2].sound, raidId).toBe('raid-clear');

      // Bespoke gallery commentary names the homage register/silhouette read.
      expect(intro.galleryCaption, raidId).toContain('Director note');

      openerFramings.add(`${opener.shot.angle}/${opener.shot.move}/${opener.shot.palette}`);
      revealFramings.add(`${intro.beats[1].shot.angle}/${intro.beats[1].shot.move}`);
    }
    // Not one shared template: opener palettes/framings and reveal moves vary widely.
    expect(openerFramings.size).toBeGreaterThanOrEqual(6);
    expect(revealFramings.size).toBeGreaterThanOrEqual(3);
  });

  it('plays Crownfall as a multi-act recruitment visual novel, not a single caption card', () => {
    const vn = REG.cutscene('seasonal-crowns-fall');
    expect(vn.tier).toBe('setpiece');
    expect(vn.beats.length).toBeGreaterThanOrEqual(5);

    // Three act title-cards structure the arc.
    const actCards = vn.beats.filter((b) => b.stage?.some((s) => s.kind === 'title'));
    expect(actCards.length).toBeGreaterThanOrEqual(3);

    // Dialogue cards alternate between the narrator and the named roles.
    const speakers = new Set(vn.beats.map((b) => b.line?.speaker).filter(Boolean));
    expect(speakers.has('Crownfall')).toBe(true);
    expect(speakers.size).toBeGreaterThanOrEqual(3);
    expect(vn.galleryCaption?.toLowerCase()).toContain('visual novel');
  });

  it('stages major badge act breaks as Loop flashbacks before opening the road', () => {
    const lunar = REG.cutscene('badge-lunar-badge');
    expect(lunar.tier).toBe('setpiece');
    expect(lunar.galleryCaption).toContain('desaturated Loop flashback');
    expect(lunar.beats.some((beat) => beat.stage?.some((s) => s.kind === 'establish-history'))).toBe(true);
    expect(lunar.beats.some((beat) => beat.stage?.some((s) => s.kind === 'explore-theme'))).toBe(true);
  });

  it('stages owned-Echo story only for the first facet unlock, not surplus/repeat kills', () => {
    const g = freshGame();
    while (g.cinematic.active) g.cinematicSkip();

    expect(g.unlockOwnedHeroEcho('juggernaut')).toBe(true);
    expect(g.cinematic.view()?.id).toBe('echo-milestone-stinger');
    while (g.cinematic.active) g.cinematicSkip();

    expect(g.unlockOwnedHeroEcho('juggernaut')).toBe(true);
    expect(g.cinematic.active).toBe(false);
  });

  it('degrades repeated Elite persona openings to barks instead of replaying the stinger', () => {
    const g = freshGame();
    while (g.cinematic.active) g.cinematicSkip();
    g.eliteFive.defeated = 1;
    g.journalSeen.add('cinematic:elite-persona-1');
    const before = g.toasts.length;
    const team = ['juggernaut', 'axe', 'sven', 'sniper', 'crystal-maiden'].map((heroId) => ({ heroId, level: 80, items: ['heart-of-tarrasque', 'divine-rapier'] }));
    g.runEliteMatch({ seed: 1, playerTeam: team });
    expect(g.cinematic.active).toBe(false);
    expect(g.toasts.length).toBeGreaterThan(before);
    expect(g.toasts.some((t) => t.kind === 'bark')).toBe(true);
  });
});

// ----------------------------------------------------------------
// STORY §3.2 / §4.4 / §6.12 — cinematic audio + climax flavor
// ----------------------------------------------------------------
describe('STORY cinematic presentation routing', () => {
  it('applies cut-scene music directives and dialogue blips from the active view', () => {
    const { game, audio } = recordedGame();
    game.update(0.016);
    expect(audio.mixes).toContain('silence');
    game.cinematicAdvance();
    game.update(0.016);
    expect(audio.dialogue).toContain('Narration');
    while (game.cinematic.active) game.cinematicSkip();
    game.update(0.016);
    expect(audio.mixes[audio.mixes.length - 1]).toBe('normal');
  });

  it('suppresses gameplay stingers while a cinematic owns the impact peak', () => {
    const save = newGameSave('juggernaut');
    save.playtimeSec = 0; // prologue active
    const { game, audio } = recordedGame(save);
    game.eliteFive.defeated = 5;
    const playerTeam = ['juggernaut', 'axe', 'sven', 'sniper', 'crystal-maiden'].map((heroId) => ({ heroId, level: 80, items: ['heart-of-tarrasque', 'divine-rapier'] }));
    const result = game.runChampion({ seed: 1, playerTeam });
    expect(result.won).toBe(true);
    expect(audio.stingers).not.toContain('raid-clear');
  });

  it('colors the champion closing line by reputation and faction choice', () => {
    const g = freshGame();
    g.reputation = 8;
    expect(g.championClosingLine()).toContain('mercy');
    g.reputation = -8;
    expect(g.championClosingLine()).toContain('fear');
    g.reputation = 0;
    g.factionChoices['shadeshore'] = 'kunkka';
    expect(g.championClosingLine()).toContain('fleet');
    g.factionChoices['shadeshore'] = 'tidehunter';
    expect(g.championClosingLine()).toContain('reef');
  });
});
