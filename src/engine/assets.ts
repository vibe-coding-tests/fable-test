import { Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface HeroAssetManifestEntry {
  heroId: string;
  modelUrl: string;
  clips: Partial<Record<'idle' | 'run' | 'attack' | 'cast' | 'channel' | 'death', string>>;
  sockets: ('weapon' | 'back' | 'shoulder')[];
  fallback: 'procedural';
}

export const PHASE5_STARTER_ASSETS: HeroAssetManifestEntry[] = [
  'juggernaut',
  'crystal-maiden',
  'pudge',
  'earthshaker',
  'sniper',
  'lich'
].map((heroId) => ({
  heroId,
  modelUrl: `/assets/heroes/${heroId}.glb`,
  clips: { idle: 'idle', run: 'run', attack: 'attack', cast: 'cast', channel: 'channel', death: 'death' },
  sockets: ['weapon', 'back', 'shoulder'],
  fallback: 'procedural'
}));

export class HeroAssetLoader {
  private loader = new GLTFLoader();
  private cache = new Map<string, Promise<Group | null>>();

  loadHero(entry: HeroAssetManifestEntry): Promise<Group | null> {
    const cached = this.cache.get(entry.heroId);
    if (cached) return cached;
    const promise = this.loader.loadAsync(entry.modelUrl)
      .then((gltf) => gltf.scene)
      .catch(() => null);
    this.cache.set(entry.heroId, promise);
    return promise;
  }
}
