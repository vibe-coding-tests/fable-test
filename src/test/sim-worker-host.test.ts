import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { TUNING } from '../data/tuning';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { handleSimWorkerRequest, SimWorkerHost } from '../core/sim-worker-host';
import { SimWorkerClient, type SimWorkerPort, type SimWorkerRequest, type SimWorkerResponse } from '../core/sim-worker-protocol';
import type { EffectCtx } from '../core/effects';
import type { SummonSpec } from '../core/types';

beforeAll(() => registerAllContent());

function buildDuel(seed = 4242): Sim {
  const sim = new Sim({ seed, bounds: { w: 6000, h: 4000 } });
  sim.spawnHero(REG.hero('juggernaut'), {
    team: 0,
    pos: { x: 2200, y: 2000 },
    level: 16,
    ctrl: { kind: 'creep', homePos: { x: 2200, y: 2000 } }
  });
  sim.spawnHero(REG.hero('axe'), {
    team: 1,
    pos: { x: 2800, y: 2000 },
    level: 16,
    ctrl: { kind: 'creep', homePos: { x: 2800, y: 2000 } }
  });
  return sim;
}

const SUMMON_CTX: EffectCtx = { defId: 'test-summon', level: 1, vfx: { archetype: 'summon-pop', color: '#88ccff' } };
const SUMMON_SPEC: SummonSpec = {
  id: 'test-summon',
  name: 'Test Summon',
  lifetime: 60,
  stats: { maxHp: 100, damage: 10, armor: 0, moveSpeed: 320, attackRange: 120, baseAttackTime: 1.6 },
  silhouette: { build: 'biped', scale: 0.6, weapon: 'sword', head: 'bare' },
  palette: ['#88ccff', '#223355', '#ffffff']
};
const ILLUSION_SPEC: SummonSpec = {
  ...SUMMON_SPEC,
  id: 'test-illusion',
  name: 'Test Illusion'
};

class LoopbackSimPort implements SimWorkerPort {
  private listeners = new Set<(event: MessageEvent<SimWorkerResponse>) => void>();
  private host: SimWorkerHost | null = null;

  postMessage(message: SimWorkerRequest): void {
    const request = structuredClone(message);
    let response: SimWorkerResponse;
    if (request.kind === 'init') {
      this.host = new SimWorkerHost(buildDuel(request.bootstrap.seed ?? 4242));
      response = { id: request.id, ok: true, snapshot: this.host.stepTicks(0) };
    } else if (this.host) {
      response = handleSimWorkerRequest(this.host, request);
    } else {
      response = { id: request.id, ok: false, error: 'not initialized' };
    }
    const event = { data: structuredClone(response) } as MessageEvent<SimWorkerResponse>;
    queueMicrotask(() => {
      for (const listener of this.listeners) listener(event);
    });
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent<SimWorkerResponse>) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent<SimWorkerResponse>) => void): void {
    this.listeners.delete(listener);
  }
}

describe('sim worker host boundary', () => {
  it('steps to the same deterministic hash as the in-process sim', () => {
    const direct = buildDuel();
    const hosted = new SimWorkerHost(buildDuel());

    for (let i = 0; i < 180; i++) direct.tick();
    const snapshot = hosted.stepTicks(180);

    expect(snapshot.tickCount).toBe(direct.tickCount);
    expect(snapshot.hash).toBe(direct.hash());
    expect(snapshot.units.length).toBe(direct.unitsArr.length);
  });

  it('applies queued orders through the host before stepping', () => {
    const direct = buildDuel(5151);
    const hostedSim = buildDuel(5151);
    const hosted = new SimWorkerHost(hostedSim);
    const uid = direct.unitsArr[0].uid;
    const order = { kind: 'move' as const, point: { x: 1800, y: 1800 } };

    direct.order(uid, order);
    hosted.order(uid, order);
    for (let i = 0; i < 45; i++) direct.tick();
    const snapshot = hosted.stepTicks(45);

    expect(snapshot.hash).toBe(direct.hash());
  });

  it('matches direct simulation when render frames batch uneven worker steps', () => {
    const direct = buildDuel(7171);
    const hosted = new SimWorkerHost(buildDuel(7171));
    const batches = [1, 2, 0, 4, 3, 6, 1, 8, 5];
    for (const batch of batches) {
      for (let i = 0; i < batch; i++) direct.tick();
      const snapshot = hosted.stepTicks(batch);
      expect(snapshot.hash).toBe(direct.hash());
    }
  });

  it('applies a mid-frame order on the next hosted tick', () => {
    const hostedSim = buildDuel(8181);
    const hosted = new SimWorkerHost(hostedSim);
    const uid = hostedSim.unitsArr[0].uid;
    hostedSim.unitsArr[0].ctrl = { kind: 'player' };
    hosted.stepTicks(3);
    hosted.order(uid, { kind: 'move', point: { x: 1800, y: 1800 } });
    const before = hostedSim.unit(uid)!.pos.x;
    hosted.stepTicks(1);
    expect(hostedSim.unit(uid)!.order).toEqual({ kind: 'move', point: { x: 1800, y: 1800 } });
    const snapshot = hosted.stepTicks(10);
    const after = snapshot.units.find((u) => u.uid === uid)!.pos.x;
    expect(after).toBeLessThan(before);
  });

  it('round-trips through the async worker message protocol', async () => {
    const direct = buildDuel(9191);
    const client = new SimWorkerClient(new LoopbackSimPort());
    const initial = await client.init({ kind: 'duel', seed: 9191 });
    expect(initial.hash).toBe(direct.hash());

    for (let i = 0; i < 30; i++) direct.tick();
    const stepped = await client.stepTicks(30);
    expect(stepped.hash).toBe(direct.hash());

    const events = await client.drainEvents();
    expect(Array.isArray(events)).toBe(true);
    client.dispose();
  });

  it('documents the 2.0 scale envelope in tuning', () => {
    expect(TUNING.scaleCeilings.overworldUnits).toBeGreaterThanOrEqual(100);
    expect(TUNING.scaleCeilings.raidUnits).toBeGreaterThanOrEqual(TUNING.scaleCeilings.overworldUnits);
    expect(TUNING.scaleCeilings.summons).toBeGreaterThan(0);
    expect(TUNING.scaleCeilings.illusions).toBeGreaterThan(0);
  });

  it('enforces owner summon and illusion ceilings at spawn time', () => {
    const sim = buildDuel(6161);
    const owner = sim.unitsArr[0];
    for (let i = 0; i < TUNING.scaleCeilings.summons + 3; i++) {
      sim.spawnSummon(SUMMON_SPEC, owner, { x: owner.pos.x + i, y: owner.pos.y }, SUMMON_CTX);
    }
    const summons = sim.unitsArr.filter((u) => u.alive && u.ownerUid === owner.uid && u.name === SUMMON_SPEC.name);
    expect(summons).toHaveLength(TUNING.scaleCeilings.summons);

    for (let i = 0; i < TUNING.scaleCeilings.illusions + 3; i++) {
      sim.spawnSummon(ILLUSION_SPEC, owner, { x: owner.pos.x - i, y: owner.pos.y }, SUMMON_CTX);
    }
    const illusions = sim.unitsArr.filter((u) => u.alive && u.ownerUid === owner.uid && u.name === ILLUSION_SPEC.name);
    expect(illusions).toHaveLength(TUNING.scaleCeilings.illusions);
  });

  it('scales the summon ceiling by the overworld battle-scale dial (§F.2)', () => {
    const sim = buildDuel(6262);
    // The dial defaults to 1 (no change) so macro sims that never set it are unaffected.
    expect(sim.summonCapScale).toBe(1);
    sim.summonCapScale = 0.5; // overworld "lower for perf"
    const owner = sim.unitsArr[0];
    for (let i = 0; i < TUNING.scaleCeilings.summons + 3; i++) {
      sim.spawnSummon(SUMMON_SPEC, owner, { x: owner.pos.x + i, y: owner.pos.y }, SUMMON_CTX);
    }
    const summons = sim.unitsArr.filter((u) => u.alive && u.ownerUid === owner.uid && u.name === SUMMON_SPEC.name);
    expect(summons).toHaveLength(Math.round(TUNING.scaleCeilings.summons * 0.5));
  });
});
