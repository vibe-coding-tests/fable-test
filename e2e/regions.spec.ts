import { test, expect } from '@playwright/test';
import { boot, clearCinematics, fastForward, state, watchPageErrors, expectNoPageErrors } from './helpers';

// Headless sweep across every region. The bulk of recent work (Optimization 2.0
// sim scaling + crowd impostors, the item rehaul, terrain/audio changes) touches
// content that loads per region, so booting each one, clearing the arrival
// cut-scene, and stepping the sim for a few seconds is a cheap, reliable net for
// "did anything start throwing in <region>?". No WebGL — pure logic + state.
const REGIONS = [
  'tranquil-vale',
  'nightsilver-woods',
  'icewrack',
  'devarshi-desert',
  'shadeshore',
  'vile-reaches',
  'quoidge',
  'hidden-wood',
  'mount-joerlak',
  'mad-moon-crater'
] as const;

test.describe('region sweep (headless)', () => {
  for (const region of REGIONS) {
    test(`boots ${region}, steps the sim, and stays error-free`, async ({ page }) => {
      const errors = watchPageErrors(page);

      await boot(page, { region, seed: 777 });
      await clearCinematics(page);

      const s0 = await state(page);
      expect(s0.regionId).toBe(region);
      expect(s0.ready).toBe(true);
      expect(s0.party.length).toBeGreaterThan(0);
      expect(s0.party[0].alive).toBe(true);

      // Step a few seconds so camps spawn, AI ticks, day/night advances, and the
      // event stream drains — the path that would surface a runtime crash.
      await fastForward(page, 6);

      const s1 = await state(page);
      expect(s1.ready).toBe(true);
      expect(s1.regionId).toBe(region);
      // No NaN/garbage leaking into core stats after stepping.
      for (const member of s1.party) {
        expect(Number.isFinite(member.hp)).toBe(true);
        expect(Number.isFinite(member.maxHp)).toBe(true);
        expect(member.maxHp).toBeGreaterThan(0);
      }
      expect(s1.playtime).toBeGreaterThanOrEqual(s0.playtime);

      expectNoPageErrors(errors);
    });
  }
});
