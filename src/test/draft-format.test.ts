import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { ALL_GYMS } from '../data/gyms';
import { ELITE_DRAFT } from '../data/drafts';
import {
  buildLegalTeam,
  chooseDraft,
  counterDraft,
  describeRule,
  formatSatisfiable,
  isLegalDraft,
  pickEnemyBans,
  repicksAllowed,
  runPickBan,
  validateDraft
} from '../core/draft';
import { TUNING } from '../data/tuning';
import { defaultFormation, reachProfile } from '../core/board';
import { LiveGymFight, runGymMatch, type GymMatchHero } from '../systems/macro-session';
import { Game, newGameSave } from '../systems/game';
import type { DraftFormat, GambitRule, MacroHeroSetup } from '../core/types';

beforeAll(() => registerAllContent());

const ALL_IDS = (): string[] => [...REG.heroes.keys()].sort();
const withRole = (role: string): string[] => ALL_IDS().filter((id) => REG.hero(id).roles.includes(role));
const withoutRole = (role: string): string[] => ALL_IDS().filter((id) => !REG.hero(id).roles.includes(role));
const withAttr = (a: string): string[] => ALL_IDS().filter((id) => REG.hero(id).attribute === a);
const team = (ids: string[], level = 20, items?: string[]): MacroHeroSetup[] => ids.map((heroId) => ({ heroId, level, items }));

describe('AUTOBATTLER §5.1 — the constraint vocabulary validates per rule kind', () => {
  it('ban-hero: rejects a banned pick, accepts a clean five', () => {
    const banned = ALL_IDS()[0];
    const fmt: DraftFormat = { rules: [{ kind: 'ban-hero', heroIds: [banned] }] };
    expect(isLegalDraft(fmt, team([banned, ...ALL_IDS().slice(1, 5)]))).toBe(false);
    expect(isLegalDraft(fmt, team(ALL_IDS().slice(1, 6)))).toBe(true);
  });

  it('ban-role: rejects any hero of the banned role', () => {
    const fmt: DraftFormat = { rules: [{ kind: 'ban-role', roles: ['escape'] }] };
    const escapee = withRole('escape')[0];
    const clean = withoutRole('escape').slice(0, 5);
    expect(escapee).toBeTruthy();
    expect(isLegalDraft(fmt, team([escapee, ...clean.slice(0, 4)]))).toBe(false);
    expect(isLegalDraft(fmt, team(clean))).toBe(true);
  });

  it('require-role: needs the minimum count', () => {
    const fmt: DraftFormat = { rules: [{ kind: 'require-role', role: 'support', min: 2 }] };
    const sup = withRole('support');
    const non = withoutRole('support');
    expect(isLegalDraft(fmt, team([sup[0], ...non.slice(0, 4)]))).toBe(false); // only 1 support
    expect(isLegalDraft(fmt, team([sup[0], sup[1], ...non.slice(0, 3)]))).toBe(true);
  });

  it('cap-role: rejects more than the max', () => {
    const fmt: DraftFormat = { rules: [{ kind: 'cap-role', role: 'durable', max: 1 }] };
    const dur = withRole('durable');
    const non = withoutRole('durable');
    expect(isLegalDraft(fmt, team([dur[0], dur[1], ...non.slice(0, 3)]))).toBe(false);
    expect(isLegalDraft(fmt, team([dur[0], ...non.slice(0, 4)]))).toBe(true);
  });

  it('cap-attribute: rejects too many of an attribute', () => {
    const fmt: DraftFormat = { rules: [{ kind: 'cap-attribute', attribute: 'str', max: 1 }] };
    const str = withAttr('str');
    const non = ALL_IDS().filter((id) => REG.hero(id).attribute !== 'str');
    expect(isLegalDraft(fmt, team([str[0], str[1], ...non.slice(0, 3)]))).toBe(false);
    expect(isLegalDraft(fmt, team([str[0], ...non.slice(0, 4)]))).toBe(true);
  });

  it('unique-attribute: rejects a duplicate primary attribute', () => {
    const fmt: DraftFormat = { rules: [{ kind: 'unique-attribute' }] };
    const str = withAttr('str');
    const agi = withAttr('agi')[0];
    const int = withAttr('int')[0];
    expect(isLegalDraft(fmt, team([str[0], str[1]]))).toBe(false);
    expect(isLegalDraft(fmt, team([str[0], agi, int]))).toBe(true);
  });

  it('level-cap: clamps overleveled heroes rather than locking them out', () => {
    // A cap normalizes overleveled heroes down to it (clamped at field time), so an
    // overleveled five is still a legal draft — never a "can't play" wall.
    const fmt: DraftFormat = { rules: [{ kind: 'level-cap', max: 20 }] };
    expect(isLegalDraft(fmt, team(ALL_IDS().slice(0, 5), 25))).toBe(true);
    expect(isLegalDraft(fmt, team(ALL_IDS().slice(0, 5), 20))).toBe(true);
  });

  it('item-tier-cap: rejects a luxury item over the tier rank', () => {
    const fmt: DraftFormat = { rules: [{ kind: 'item-tier-cap', max: 2 }] };
    // find a high-tier (t3/t4) item and a low one
    const luxury = [...REG.items.values()].find((i) => i.tier === 't3' || i.tier === 't4');
    const cheap = [...REG.items.values()].find((i) => i.tier === 'basic' || i.tier === 't1');
    expect(luxury && cheap).toBeTruthy();
    expect(isLegalDraft(fmt, team(ALL_IDS().slice(0, 5), 20, [luxury!.id]))).toBe(false);
    expect(isLegalDraft(fmt, team(ALL_IDS().slice(0, 5), 20, [cheap!.id]))).toBe(true);
  });

  it('point-budget: rejects a team that overspends', () => {
    const fmt: DraftFormat = { rules: [{ kind: 'point-budget', total: 8, costByRole: { carry: 3 } }] };
    const carry = withRole('carry');
    const non = withoutRole('carry');
    // 3 carries = 9 > 8
    expect(isLegalDraft(fmt, team([carry[0], carry[1], carry[2], ...non.slice(0, 2)]))).toBe(false);
    // 1 carry (3) + 4 non (4) = 7 <= 8
    expect(isLegalDraft(fmt, team([carry[0], ...non.slice(0, 4)]))).toBe(true);
  });

  it('reports a per-rule status for the draft screen', () => {
    const fmt: DraftFormat = { rules: [{ kind: 'require-role', role: 'support', min: 2 }] };
    const v = validateDraft(fmt, team([withRole('support')[0], ...withoutRole('support').slice(0, 4)]));
    expect(v.ok).toBe(false);
    expect(v.statuses[0].detail).toBe('1/2');
    expect(v.statuses[0].label).toContain('Support');
  });
});

describe('AUTOBATTLER §5.1 — describeRule labels every rule kind for the draft screen', () => {
  it('renders a stable human label per kind', () => {
    expect(describeRule({ kind: 'ban-role', roles: ['escape'] })).toBe('No escape');
    expect(describeRule({ kind: 'require-role', role: 'support', min: 2 })).toBe('Support ≥ 2');
    expect(describeRule({ kind: 'cap-role', role: 'durable', max: 1 })).toBe('Durable ≤ 1');
    expect(describeRule({ kind: 'cap-attribute', attribute: 'str', max: 1 })).toBe('STR heroes ≤ 1');
    expect(describeRule({ kind: 'unique-attribute' })).toBe('One per attribute');
    expect(describeRule({ kind: 'level-cap', max: 20 })).toBe('Level ≤ 20');
    expect(describeRule({ kind: 'item-tier-cap', max: 2 })).toBe('Item tier ≤ 2');
    expect(describeRule({ kind: 'point-budget', total: 8 })).toBe('Point budget 8');
  });

  it('ban-hero resolves the banned ids to hero names', () => {
    const label = describeRule({ kind: 'ban-hero', heroIds: ['juggernaut'] });
    expect(label.startsWith('Banned: ')).toBe(true);
    expect(label).toContain(REG.hero('juggernaut').name);
  });
});

describe('AUTOBATTLER §4.2 — chooseDraft picks one deterministic legal hero', () => {
  it('is deterministic for a seed and returns a legal, available hero', () => {
    const pool = ALL_IDS();
    const a = chooseDraft({ pool, team: [], banned: [], seed: 31337 });
    const b = chooseDraft({ pool, team: [], banned: [], seed: 31337 });
    expect(a).toBe(b);
    expect(a).toBeTruthy();
    expect(REG.heroes.has(a!)).toBe(true);
  });

  it('prefers a hero that fills an unmet require-role goal', () => {
    const fmt: DraftFormat = { rules: [{ kind: 'require-role', role: 'support', min: 1 }] };
    const pick = chooseDraft({ pool: ALL_IDS(), team: [], banned: [], format: fmt, seed: 7 });
    expect(pick).toBeTruthy();
    expect(REG.hero(pick!).roles.includes('support')).toBe(true);
  });

  it('never returns a banned hero or one already on the team', () => {
    const onTeam = withRole('carry')[0];
    const banned = withRole('carry')[1];
    const pick = chooseDraft({
      pool: ALL_IDS(),
      team: team([onTeam]),
      banned: [banned],
      seed: 99
    });
    expect(pick).not.toBe(onTeam);
    expect(pick).not.toBe(banned);
  });

  it('returns null when nothing legal remains', () => {
    expect(chooseDraft({ pool: [], team: [], banned: [], seed: 1 })).toBeNull();
    // a cap-role of 0 means no durable hero is ever a legal pick from a durable-only pool
    const fmt: DraftFormat = { rules: [{ kind: 'cap-role', role: 'durable', max: 0 }] };
    expect(chooseDraft({ pool: withRole('durable'), team: [], banned: [], format: fmt, seed: 2 })).toBeNull();
  });
});

describe('AUTOBATTLER §5.2 — every gym format is satisfiable from the roster', () => {
  it('builds a legal five for each gym', () => {
    for (const gym of ALL_GYMS) {
      const pool = ALL_IDS();
      expect(formatSatisfiable(gym.format, pool), `${gym.id} should be satisfiable`).toBe(true);
      const built = buildLegalTeam(gym.format, pool, 99, { level: gymLevelCap(gym.format) });
      expect(built.length, gym.id).toBe(5);
      expect(isLegalDraft(gym.format, built), gym.id).toBe(true);
    }
  });

  it('every gym carries a format', () => {
    for (const gym of ALL_GYMS) expect(gym.format, gym.id).toBeTruthy();
  });
});

describe('AUTOBATTLER §7 — board reach/footprint readout is pure and sane', () => {
  it('reports a non-negative reach, footprint, and archetype tags for every hero', () => {
    for (const id of ALL_IDS()) {
      const rp = reachProfile(REG.hero(id));
      expect(rp.reach, id).toBeGreaterThan(0);
      expect(rp.footprint, id).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(rp.tags), id).toBe(true);
    }
  });

  it('an AoE caster reports a footprint; tags are deterministic and sorted', () => {
    const lina = reachProfile(REG.hero('lina'));
    expect(lina.footprint).toBeGreaterThan(0); // Light Strike Array / Dragon Slave
    const a = reachProfile(REG.hero('earthshaker')).tags;
    const b = reachProfile(REG.hero('earthshaker')).tags;
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(a); // already sorted
  });
});

describe('AUTOBATTLER §5.4 — counter-draft answers your shape', () => {
  const frost = ALL_GYMS.find((g) => g.id === 'frost-gym')!;

  it('last-pick deterministically counters a double-carry', () => {
    const carries = withRole('carry').slice(0, 2);
    const rest = withoutRole('carry').slice(0, 3);
    const player = team([...carries, ...rest], 24);
    const a = counterDraft(frost.format, player, frost.enemyTeam, ALL_IDS(), 1234);
    const b = counterDraft(frost.format, player, frost.enemyTeam, ALL_IDS(), 1234);
    expect(a.swappedIn.length).toBeGreaterThanOrEqual(1);
    expect(a.enemy.map((h) => h.heroId)).not.toEqual(frost.enemyTeam.map((h) => h.heroId));
    expect(a.enemy.map((h) => h.heroId)).toEqual(b.enemy.map((h) => h.heroId)); // deterministic
    expect(a.enemy.length).toBe(frost.enemyTeam.length);
  });

  it('none leaves the lineup fixed', () => {
    const player = team(ALL_IDS().slice(0, 5), 24);
    const r = counterDraft({ rules: [] }, player, frost.enemyTeam, ALL_IDS(), 7);
    expect(r.enemy).toBe(frost.enemyTeam);
    expect(r.swappedIn.length).toBe(0);
  });

  it('mirror-shape fills a legal five from a pool, varying by seed', () => {
    const fmt: DraftFormat = { rules: [{ kind: 'cap-role', role: 'durable', max: 1 }], counterDraft: 'mirror-shape' };
    const pool = ALL_IDS();
    const player = team(pool.slice(0, 5), 24);
    const base = team(pool.slice(10, 15), 24);
    const r1 = counterDraft(fmt, player, base, pool, 11);
    const r2 = counterDraft(fmt, player, base, pool, 99);
    expect(r1.enemy.length).toBe(5);
    expect(isLegalDraft(fmt, r1.enemy)).toBe(true);
    expect(r1.enemy.map((h) => h.heroId)).not.toEqual(r2.enemy.map((h) => h.heroId));
  });
});

describe('PROGRESSION §3 — the leader drafts against you (asymmetric Captains Series)', () => {
  const FILLER = (): string[] => withoutRole('support').filter((id) => !REG.hero(id).roles.includes('carry'));

  it('pickEnemyBans is deterministic for a seed', () => {
    const roster = ALL_IDS().slice(0, 12);
    const a = pickEnemyBans(undefined, roster, [], 3, roster.slice(0, 5), 4242);
    const b = pickEnemyBans(undefined, roster, [], 3, roster.slice(0, 5), 4242);
    expect(a).toEqual(b);
    expect(a.length).toBe(3);
  });

  it('prefers high-value heroes (a low-value support is banned last)', () => {
    const carries = withRole('carry').slice(0, 6);
    const roster = ['crystal-maiden', ...carries];
    const banned = pickEnemyBans(undefined, roster, [], 2, [], 7);
    expect(banned.length).toBe(2);
    // the lone support is the least valuable, so it is never banned before the carries
    expect(banned.includes('crystal-maiden')).toBe(false);
  });

  it('weights the last winning five up (bans your MVP)', () => {
    // Two equal-value carries; only one was in the last five → it gets banned first.
    const roster = ['juggernaut', 'sven', ...FILLER().slice(0, 5)];
    const banned = pickEnemyBans(undefined, roster, [], 1, ['sven'], 11);
    expect(banned).toEqual(['sven']);
  });

  it('never bans below a formatSatisfiable five (the floor)', () => {
    const fmt: DraftFormat = { rules: [{ kind: 'require-role', role: 'support', min: 2 }] };
    const sup = withRole('support').slice(0, 2);
    const carries = withRole('carry').slice(0, 5);
    const roster = [...sup, ...carries];
    const banned = pickEnemyBans(fmt, roster, [], 4, [], 99);
    // a support is never banned (would drop below 2 → unsatisfiable)
    for (const id of banned) expect(REG.hero(id).roles.includes('support')).toBe(false);
    const remaining = roster.filter((id) => !banned.includes(id));
    expect(remaining.length).toBeGreaterThanOrEqual(TUNING.captainsSeries.minLegalRosterAfterBans);
    expect(formatSatisfiable(fmt, remaining)).toBe(true);
  });

  it('clamps to keep at least minLegalRosterAfterBans heroes', () => {
    const roster = ALL_IDS().slice(0, 7);
    const banned = pickEnemyBans(undefined, roster, [], 99, [], 3);
    expect(roster.length - banned.length).toBe(TUNING.captainsSeries.minLegalRosterAfterBans);
  });

  it('repicksAllowed matches the tuning table per tier', () => {
    expect(repicksAllowed('normal')).toBe(TUNING.captainsSeries.repicksByDifficulty.normal);
    expect(repicksAllowed('nightmare')).toBe(TUNING.captainsSeries.repicksByDifficulty.nightmare);
    expect(repicksAllowed('hell')).toBe(TUNING.captainsSeries.repicksByDifficulty.hell);
    expect(repicksAllowed('hell')).toBe(0); // your draft is locked on hell
  });

  it('rising difficulty pre-bans more of the player roster', () => {
    const gym = ALL_GYMS.find((g) => g.id === 'lunar-gym')!;
    const roster = STRONG_POOL;
    const five = roster.slice(0, 5).map((heroId) => ({ heroId, level: 14, items: STRONG_ITEMS, gambits: AGGRO }));
    const normal = new LiveGymFight(gym, five, 5, { playerRoster: roster, tier: 'normal' });
    const hell = new LiveGymFight(gym, five, 5, { playerRoster: roster, tier: 'hell' });
    expect(hell.bannedHeroes.size).toBeGreaterThan(normal.bannedHeroes.size);
    expect(normal.bannedHeroes.size).toBe(TUNING.captainsSeries.enemyPreBansByDifficulty.normal);
    expect(hell.bannedHeroes.size).toBe(TUNING.captainsSeries.enemyPreBansByDifficulty.hell);
  });

  it('a deep roster completes a Bo3 under escalating bans and stays re-fightable', () => {
    const gym = ALL_GYMS.find((g) => g.id === 'frost-gym')!;
    const roster = STRONG_POOL;
    const five = buildLegalTeam(gym.format, roster, 5, { level: 17, items: () => STRONG_ITEMS })
      .map((h) => ({ heroId: h.heroId, level: 17, items: STRONG_ITEMS, gambits: AGGRO }));
    const fight = new LiveGymFight(gym, five, 5, { playerRoster: roster, tier: 'hell' });
    const result = fight.runHeadless();
    expect(result).toBeTruthy();
    // the leader actually banned the player's heroes over the series
    expect(fight.bannedHeroes.size).toBeGreaterThanOrEqual(TUNING.captainsSeries.enemyPreBansByDifficulty.hell);
    // a loss is never a wall: the remaining legal pool can still field a legal five
    const remaining = roster.filter((id) => !fight.bannedHeroes.has(id));
    expect(formatSatisfiable(gym.format, remaining)).toBe(true);
  }, 60000);

  it('a deep roster can win a banned series (depth is the answer)', () => {
    const gym = ALL_GYMS.find((g) => g.id === 'lunar-gym')!;
    const roster = STRONG_POOL;
    let won = false;
    for (let seed = 1; seed <= 16 && !won; seed++) {
      const five = buildLegalTeam(gym.format, roster, seed, { level: 14, items: () => STRONG_ITEMS })
        .map((h) => ({ heroId: h.heroId, level: 14, items: STRONG_ITEMS, gambits: AGGRO }));
      const fight = new LiveGymFight(gym, five, seed * 13, { playerRoster: roster, tier: 'normal' });
      if (fight.runHeadless().winner === 0) won = true;
    }
    expect(won, 'a deep roster beats the asymmetric series on normal').toBe(true);
  }, 60000);

  it('a thin hell roster with no repicks is locked into its bad five and loses', () => {
    const gym = ALL_GYMS.find((g) => g.id === 'frost-gym')!;
    const thin = withRole('support').filter((id) => id !== 'crystal-maiden').slice(0, 5);
    const passive: GambitRule[] = [{ if: [{ k: 'always' }], then: { k: 'hold' } }];
    const five = thin.map((heroId) => ({ heroId, level: 17, items: [], gambits: passive }));
    expect(isLegalDraft(gym.format, five)).toBe(true);
    const fight = new LiveGymFight(gym, five, 17, { playerRoster: thin, tier: 'hell' });
    expect(fight.repickBudget).toBe(0);
    expect(fight.requestRepick(0, STRONG_POOL.find((id) => !thin.includes(id))!)).toBe(false);
    const result = fight.runHeadless();
    expect(result.winner).toBe(1);
  }, 60000);

  it('an Elite-style Bo5 needs three round wins and never exceeds five rounds (§3.1)', () => {
    const gym = ALL_GYMS.find((g) => g.id === 'frost-gym')!;
    const five = buildLegalTeam(gym.format, STRONG_POOL, 5, { level: 17, items: () => STRONG_ITEMS })
      .map((h) => ({ heroId: h.heroId, level: 17, items: STRONG_ITEMS, gambits: AGGRO }));
    const bestOf = TUNING.captainsSeries.series.eliteBestOf;
    const clinch = Math.ceil(bestOf / 2);
    const fight = new LiveGymFight(gym, five, 7, { autoPlayer: true, bestOf });
    const result = fight.runHeadless();
    expect(result.rounds.length).toBeLessThanOrEqual(bestOf);
    expect(Math.max(result.playerWins, result.enemyWins)).toBeLessThanOrEqual(clinch);
    // A series that ended before the full distance must have been clinched at `clinch` wins.
    if (result.rounds.length < bestOf) expect(Math.max(result.playerWins, result.enemyWins)).toBe(clinch);
    const lead = result.playerWins > result.enemyWins ? 0 : result.enemyWins > result.playerWins ? 1 : -1;
    expect(result.winner).toBe(lead);
  }, 60000);
});

describe('AUTOBATTLER §4.2 — the pick/ban engine yields two legal teams', () => {
  it('drafts a full legal five for each side from two pools', () => {
    const member = ELITE_DRAFT.members[0];
    const out = runPickBan({
      playerPool: ALL_IDS(),
      enemyPool: [...new Set(member.pool)],
      order: ['ban', 'ban', 'pick', 'pick', 'pick', 'pick', 'pick', 'pick', 'pick', 'pick'],
      seed: 4242,
      level: 30
    });
    expect(out.player.length).toBe(5);
    expect(out.enemy.length).toBe(5);
    expect(new Set(out.player.map((h) => h.heroId)).size).toBe(5);
    expect(new Set(out.enemy.map((h) => h.heroId)).size).toBe(5);
    // no banned hero appears on either roster
    for (const ban of out.bans) {
      expect(out.player.some((h) => h.heroId === ban)).toBe(false);
      expect(out.enemy.some((h) => h.heroId === ban)).toBe(false);
    }
  });

  it('honors a format for each side', () => {
    const fmt: DraftFormat = { rules: [{ kind: 'cap-role', role: 'carry', max: 2 }] };
    const out = runPickBan({
      playerPool: ALL_IDS(),
      enemyPool: ALL_IDS(),
      order: ['pick', 'pick', 'pick', 'pick', 'pick', 'pick', 'pick', 'pick', 'pick', 'pick'],
      seed: 7,
      playerFormat: fmt,
      enemyFormat: fmt,
      level: 30
    });
    expect(isLegalDraft(fmt, out.player)).toBe(true);
    expect(isLegalDraft(fmt, out.enemy)).toBe(true);
  });
});

describe('AUTOBATTLER §5 — game integration: validate on commit, counter-draft on fight', () => {
  function fullSave(ids: string[]) {
    const save = newGameSave(ids[0]);
    const template = structuredClone(save.roster[0]);
    save.party = ids.slice(0, 5);
    save.recruited = [...new Set([...ids, ...save.recruited])];
    save.roster = ids.map((heroId) => ({ ...structuredClone(template), heroId, level: 22 }));
    return save;
  }

  it('validateGymDraft mirrors the gym format', () => {
    const game = Game.headless(fullSave(ALL_IDS().slice(0, 6)));
    // Titan caps carries at 2 + needs an initiator
    const carries = withRole('carry').slice(0, 3);
    const illegal = team([...carries, ...withoutRole('carry').slice(0, 2)], 20);
    expect(game.validateGymDraft('titan-gym', illegal).ok).toBe(false);

    const initiator = withRole('initiator')[0];
    const legal = team([initiator, ...withoutRole('carry').filter((id) => id !== initiator).slice(0, 4)], 20);
    expect(game.validateGymDraft('titan-gym', legal).ok).toBe(true);
  });

  it('the Elite Five interactive pick/ban yields two legal full teams, deterministically', () => {
    const ids = ALL_IDS().slice(0, 12); // a deep enough recruited roster
    const run = () => {
      const game = Game.headless(fullSave(ids));
      expect(game.beginEliteDraft()).toBe(true);
      let guard = 0;
      while (guard++ < 40) {
        const turn = game.eliteDraftTurn()!;
        if (turn.done) break;
        if (turn.side === 0) {
          const pool = turn.action === 'ban' ? game.eliteDraft!.enemyPool : game.eliteDraft!.playerPool;
          const taken = new Set([...game.eliteDraft!.bans, ...game.eliteDraft!.player.map((h) => h.heroId), ...game.eliteDraft!.enemy.map((h) => h.heroId)]);
          const choice = pool.find((id) => !taken.has(id))!;
          expect(game.eliteDraftChoose(choice)).toBe(true);
        }
      }
      const s = game.eliteDraft!;
      return { player: s.player.map((h) => h.heroId), enemy: s.enemy.map((h) => h.heroId), bans: [...s.bans] };
    };
    const a = run();
    const b = run();
    expect(a.player.length).toBe(5);
    expect(a.enemy.length).toBe(5);
    expect(new Set(a.player).size).toBe(5);
    expect(new Set(a.enemy).size).toBe(5);
    for (const ban of a.bans) {
      expect(a.player.includes(ban)).toBe(false);
      expect(a.enemy.includes(ban)).toBe(false);
    }
    expect(a).toEqual(b); // deterministic (player makes the same legal choices)
  });

  it('a live gym surfaces formation cues in the combat readout', () => {
    const ids = ['juggernaut', 'sven', 'sniper', 'lich', 'earthshaker'];
    const game = Game.headless(fullSave(ids));
    expect(game.startLiveGym('lunar-gym')).toBe(true);
    game.liveGym!.step(3);
    const r = game.combatReadout();
    expect(r.formation).not.toBeNull();
    expect(['holding', 'committed']).toContain(r.formation!.posture);
  });

  it('a last-pick gym changes its enemy in the game path, deterministically', () => {
    const carries = withRole('carry').slice(0, 2);
    const rest = withoutRole('carry').slice(0, 3);
    const ids = [...carries, ...rest];
    const draftHeroes: MacroHeroSetup[] = team(ids, 22);

    const g1 = Game.headless(fullSave(ids));
    g1.commitGymDraft('frost-gym', { heroes: draftHeroes, formation: { placements: {} } });
    g1.startLiveGym('frost-gym');
    const enemy1 = g1.lastCounterDraft!.enemy.map((h) => h.heroId);

    const g2 = Game.headless(fullSave(ids));
    g2.commitGymDraft('frost-gym', { heroes: draftHeroes, formation: { placements: {} } });
    g2.startLiveGym('frost-gym');
    const enemy2 = g2.lastCounterDraft!.enemy.map((h) => h.heroId);

    const frost = ALL_GYMS.find((g) => g.id === 'frost-gym')!;
    expect(g1.lastCounterDraft).not.toBeNull();
    expect(g1.lastCounterDraft!.swappedIn.length).toBeGreaterThanOrEqual(1);
    expect(enemy1).toEqual(enemy2); // deterministic
    expect(enemy1.slice().sort()).not.toEqual(frost.enemyTeam.map((h) => h.heroId).slice().sort());
  });

  it('every gym authors a valid counter pool instead of falling back to the whole registry', () => {
    for (const gym of ALL_GYMS) {
      expect(gym.counterPool?.length, `${gym.id}: counterPool`).toBeGreaterThanOrEqual(5);
      for (const id of gym.counterPool ?? []) expect(REG.heroes.has(id), `${gym.id}: ${id}`).toBe(true);
      expect(formatSatisfiable(gym.format, gym.counterPool ?? []), `${gym.id}: counterPool should satisfy its format`).toBe(true);
    }
  });

  it('a rematch after a gym loss switches the leader to mirror-shape', () => {
    const ids = STRONG_POOL;
    const cap = gymLevelCap(ALL_GYMS.find((g) => g.id === 'frost-gym')!.format);
    const heroes = buildLegalTeam(ALL_GYMS.find((g) => g.id === 'frost-gym')!.format, ids, 9, { level: cap, items: () => STRONG_ITEMS });
    const game = Game.headless(fullSave(ids));
    game.commitGymDraft('frost-gym', { heroes, formation: { placements: {} } });
    (game as unknown as { gymLosses: Map<string, number> }).gymLosses.set('frost-gym', 1);
    expect(game.startLiveGym('frost-gym')).toBe(true);
    expect(game.lastCounterDraft?.reason).toBe('drafts a fresh five to a fixed shape');
    expect(game.liveGym!.currentEnemyFive().slice().sort()).not.toEqual(ALL_GYMS.find((g) => g.id === 'frost-gym')!.enemyTeam.map((h) => h.heroId).slice().sort());
  });
});

// A sane aggressive gambit (mirrors gyms.test.ts) so a drafted five plays its kit.
const AGGRO: GambitRule[] = [
  { if: [{ k: 'ability-ready', slot: 3 }, { k: 'fight-time-gt', sec: 2 }], then: { k: 'cast', slot: 3, targetMode: 'most-clustered' } },
  { if: [{ k: 'ability-ready', slot: 0 }], then: { k: 'cast', slot: 0, targetMode: 'focus' } },
  { if: [{ k: 'ability-ready', slot: 1 }, { k: 'enemies-within', radius: 700, count: 1 }], then: { k: 'cast', slot: 1, targetMode: 'most-clustered' } },
  { if: [{ k: 'ability-ready', slot: 2 }], then: { k: 'cast', slot: 2, targetMode: 'focus' } },
  { if: [{ k: 'always' }], then: { k: 'attack-focus' } }
];

// All three are tier ≤ 2 (t2/t2/t1), so this loadout is legal under every gym
// format, including Rot's item-tier-cap (§5.2) — strong AND universally legal.
const STRONG_ITEMS = ['black-king-bar', 'battlefury', 'crystalys'];

// A diverse pool of strong heroes covering every role/attribute, so buildLegalTeam
// can satisfy each gym's format (2 supports, an initiator, ≤1 str, a point-budget,
// no-escape, etc.) while still fielding heroes that can actually win.
const STRONG_POOL = [
  'juggernaut', 'sven', 'phantom-assassin', 'sniper', 'luna', 'medusa', 'wraith-king', 'lifestealer',
  'axe', 'earthshaker', 'magnus', 'tidehunter', 'centaur-warrunner',
  'lich', 'crystal-maiden', 'witch-doctor', 'jakiro', 'lina', 'zeus', 'skywrath-mage'
];

/** A gym's level-cap (§3.2), used so a drafted five is legal AND fights at-level. */
function gymLevelCap(fmt: DraftFormat | undefined): number {
  const rule = fmt?.rules.find((r) => r.kind === 'level-cap') as { max: number } | undefined;
  return rule?.max ?? 30;
}

describe('AUTOBATTLER §5/§10 — every gym is winnable with a format-legal drafted five', () => {
  it('drafts a legal five per format that wins the best-of-3 (no fixed best team beats all)', () => {
    for (const gym of ALL_GYMS) {
      let won = false;
      let checkedLegal = false;
      const cap = gymLevelCap(gym.format);
      for (let seed = 1; seed <= 16 && !won; seed++) {
        const heroes = buildLegalTeam(gym.format, STRONG_POOL, seed, { level: cap, items: () => STRONG_ITEMS });
        if (heroes.length < 5) continue;
        // the fielded five (with its items) must be legal under the gym's format
        expect(isLegalDraft(gym.format, heroes), `${gym.id}: drafted five should be legal`).toBe(true);
        checkedLegal = true;
        const team: GymMatchHero[] = heroes.map((h) => ({ heroId: h.heroId, level: h.level ?? cap, items: h.items, gambits: AGGRO }));
        const formation = defaultFormation(heroes.map((h) => REG.hero(h.heroId)));
        if (runGymMatch(gym, team, seed * 31, formation).winner === 0) won = true;
      }
      expect(checkedLegal, `${gym.id}: format must yield a legal five`).toBe(true);
      expect(won, `${gym.id}: beatable by a format-legal drafted team`).toBe(true);
    }
  }, 120000);
});

describe('AUTOBATTLER §4.2/§10 — the Elite Five is winnable via the interactive pick/ban', () => {
  function recruitSave(ids: string[]) {
    const save = newGameSave(ids[0]);
    const template = structuredClone(save.roster[0]);
    save.party = ids.slice(0, 5);
    save.recruited = [...new Set([...ids, ...save.recruited])];
    save.roster = ids.map((heroId) => ({ ...structuredClone(template), heroId, level: 30 }));
    return save;
  }

  /** Drive the player side of an interactive draft: ban a throwaway, pick the strongest available. */
  function playInteractiveDraft(game: Game): void {
    let guard = 0;
    while (guard++ < 60) {
      const turn = game.eliteDraftTurn();
      if (!turn || turn.done) break;
      if (turn.side !== 0) break; // AI resolves its own turns
      const s = game.eliteDraft!;
      const taken = new Set([...s.bans, ...s.player.map((h) => h.heroId), ...s.enemy.map((h) => h.heroId)]);
      if (turn.action === 'ban') {
        const ban = s.enemyPool.find((id) => !taken.has(id)) ?? s.playerPool.find((id) => !taken.has(id));
        if (!ban || !game.eliteDraftChoose(ban)) break;
      } else {
        const pick = STRONG_POOL.find((id) => s.playerPool.includes(id) && !taken.has(id))
          ?? s.playerPool.find((id) => !taken.has(id));
        if (!pick || !game.eliteDraftChoose(pick)) break;
      }
    }
  }

  it('a player who drafts strong picks clears the first member through the real engine', () => {
    const game = Game.headless(recruitSave(STRONG_POOL));
    let won = false;
    for (let attempt = 0; attempt < 24 && !won; attempt++) {
      game.playtime = attempt * 7; // vary the draft/match seed across re-challenges
      expect(game.beginEliteDraft()).toBe(true);
      playInteractiveDraft(game);
      const turn = game.eliteDraftTurn()!;
      expect(turn.done, 'the interactive draft completes both fives').toBe(true);
      const result = game.commitEliteDraft();
      expect(result, 'a completed draft resolves to a match').not.toBeNull();
      if (result!.won) {
        won = true;
        expect(game.eliteFive.defeated).toBe(1); // a real win advances the gauntlet
      } else {
        expect(game.eliteFive.defeated).toBe(0); // a loss leaves it for a re-draft (§3.10)
      }
    }
    expect(won, 'the first Elite member is winnable via the drafted five').toBe(true);
  }, 120000);

  it('a minimum five-hero roster still completes and commits the draft (no ban soft-lock)', () => {
    // beginEliteDraft only requires five recruited heroes, so the leader's ban
    // must never remove one the player needs — otherwise a player who challenges
    // the gauntlet with exactly five is stranded at the final pick: nothing legal
    // to choose, and commitEliteDraft refuses (the soft-lock this guards against).
    const roster = STRONG_POOL.slice(0, 5);
    const game = Game.headless(recruitSave(roster));
    expect(game.recruited.size).toBe(5);
    expect(game.beginEliteDraft()).toBe(true);
    playInteractiveDraft(game);

    const turn = game.eliteDraftTurn()!;
    expect(turn.done, 'the draft completes even at the minimum roster').toBe(true);
    const s = game.eliteDraft!;
    expect(s.player.length, 'the player fields a full five').toBe(5);
    expect(s.enemy.length, 'the leader fields a full five').toBe(5);
    // every recruited hero is fielded: the leader never banned one the player needed
    const playerIds = s.player.map((h) => h.heroId);
    for (const id of roster) expect(playerIds, `recruited ${id} must remain fieldable`).toContain(id);
    for (const banned of s.bans) expect(roster, `ban ${banned} must not strand the player`).not.toContain(banned);

    const result = game.commitEliteDraft();
    expect(result, 'the completed minimum-roster draft resolves to a match').not.toBeNull();
  });
});
