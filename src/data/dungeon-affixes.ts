import type { AffixDef } from '../core/types';

export const DUNGEON_AFFIXES: AffixDef[] = [
  {
    id: 'jailer',
    name: 'Jailer',
    excludes: ['vortex'],
    apply: [
      {
        kind: 'status',
        status: 'root',
        duration: 1.4,
        target: 'enemies-in-radius',
        radius: 4200,
        params: { tag: 'affix-jailer' }
      }
    ]
  },
  {
    id: 'frozen',
    name: 'Frozen',
    apply: [
      {
        kind: 'zone',
        at: 'self',
        zone: {
          shape: 'circle',
          radius: 280,
          duration: 5,
          auraMods: { affects: 'enemies', mods: { moveSpeedPct: -35, attackSpeed: -25 } },
          tick: {
            interval: 1,
            affects: 'enemies',
            effects: [{ kind: 'damage', dtype: 'magical', amount: 12, target: 'target' }]
          }
        }
      }
    ]
  },
  {
    id: 'vortex',
    name: 'Vortex',
    minTier: 'nightmare',
    excludes: ['jailer'],
    apply: [
      {
        kind: 'displace',
        mode: 'pull',
        target: 'enemies-in-radius',
        radius: 4200,
        distance: 420,
        speed: 1100,
        toward: 'caster'
      }
    ]
  },
  {
    id: 'fast',
    name: 'Fast',
    apply: [
      {
        kind: 'statmod',
        target: 'self',
        duration: 9999,
        mods: { moveSpeedPct: 22, attackSpeed: 35 }
      }
    ]
  }
];

export function dungeonAffixes(ids: string[]): AffixDef[] {
  return ids
    .map((id) => DUNGEON_AFFIXES.find((affix) => affix.id === id))
    .filter((affix): affix is AffixDef => !!affix);
}
