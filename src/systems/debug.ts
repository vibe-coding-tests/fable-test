import { REG } from '../core/registry';
import type { Game } from './game';
import type { DifficultyTier } from '../core/types';
import { getAssetCacheStats } from '../engine/asset-loaders';

// ------------------------------------------------------------------
// Dev/QA harness, enabled only via ?debug in the URL. Buttons for the
// grindy parts of phase acceptance testing (gold/XP/heal). Not part
// of the player-facing game.
// ------------------------------------------------------------------

export function debugEnabled(): boolean {
  return new URLSearchParams(location.search).has('debug');
}

export function mountDebugPanel(game: Game): () => void {
  const el = document.createElement('div');
  el.id = 'debug-panel';
  el.style.cssText =
    'position:absolute;top:64px;right:10px;z-index:50;display:flex;flex-direction:column;gap:4px;' +
    'background:rgba(13,17,26,.92);border:1px solid #6b2e6b;border-radius:8px;padding:8px;pointer-events:auto;';
  el.innerHTML = `
    <b style="font-size:11px;color:#df7adf">DEBUG (?debug)</b>
    <div data-d-stats style="font:11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;color:#bfc7d5;min-width:230px"></div>
    <button data-d="gold">+5000 gold</button>
    <button data-d="xp">+1200 XP (active)</button>
    <button data-d="heal">Heal party</button>
    <button data-d="hurt-creeps">Hurt nearby creeps to 20%</button>
    <hr style="border:none;border-top:1px solid #3a2a4a;width:100%;margin:4px 0">
    <b style="font-size:11px;color:#df7adf">Dungeon (QA)</b>
    <select data-d-dungeon style="font-size:11px;padding:2px"></select>
    <label style="font-size:11px;color:#bfc7d5;display:flex;gap:4px;align-items:center">tier
      <select data-d-tier style="font-size:11px;padding:2px;flex:1"></select>
    </label>
    <div data-d-mods style="display:flex;flex-direction:column;gap:2px;font-size:11px;color:#bfc7d5"></div>
    <button data-d="warp">Warp to its region</button>
    <button data-d="enter">Enter dungeon</button>
    <button data-d="clear">Clear hostiles (force room)</button>
    <button data-d="exit">Take next exit</button>
  `;
  document.getElementById('ui-root')!.appendChild(el);

  // Dungeon QA controls: pick a dungeon, warp to its region, then launch it at a
  // chosen tier + modifier set. "Clear hostiles" force-completes the current
  // pack via killUnit (so kill-credit/loot/room-completion fire normally) and
  // "Take next exit" descends once exits unlock — enough to drive the whole
  // D5/D6 flow without grinding through region progression.
  const dungeonSel = el.querySelector('[data-d-dungeon]') as HTMLSelectElement;
  const tierSel = el.querySelector('[data-d-tier]') as HTMLSelectElement;
  const modsBox = el.querySelector('[data-d-mods]') as HTMLElement;
  for (const d of REG.dungeons.values()) {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = `${d.name} (${d.regionId})`;
    dungeonSel.appendChild(opt);
  }
  const refreshDungeonControls = (): void => {
    const def = REG.dungeons.get(dungeonSel.value);
    if (!def) return;
    tierSel.innerHTML = def.tiers.map((t) => `<option value="${t}">${t}</option>`).join('');
    modsBox.innerHTML =
      (def.modifiers ?? [])
        .map(
          (m) =>
            `<label style="display:flex;gap:4px;align-items:flex-start"><input type="checkbox" data-mod="${m.id}"> ${m.name}</label>`
        )
        .join('') || '<i style="color:#8a93a5">no modifiers</i>';
  };
  dungeonSel.addEventListener('change', refreshDungeonControls);
  refreshDungeonControls();
  const selectedMods = (): string[] =>
    [...modsBox.querySelectorAll('input[data-mod]:checked')]
      .map((i) => (i as HTMLElement).dataset.mod ?? '')
      .filter((id) => id.length > 0);

  const statsEl = el.querySelector('[data-d-stats]') as HTMLElement;
  const bytes = (n: number): string => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`;
  const renderStats = (): void => {
    const gfx = (game.scene as unknown as { graphicsStats?: () => {
      frameMsAvg: number;
      frameMsP95: number;
      drawCalls: number;
      triangles: number;
      geometries: number;
      textures: number;
      programs: number | null;
      qualityTier: string;
      dpr: number;
      adaptiveScale: number;
    } }).graphicsStats?.();
    const assets = getAssetCacheStats();
    statsEl.innerHTML = gfx ? `
      frame ${gfx.frameMsAvg.toFixed(1)} avg / ${gfx.frameMsP95.toFixed(1)} p95 ms<br>
      draw ${gfx.drawCalls} · tri ${Math.round(gfx.triangles / 1000)}k · prog ${gfx.programs ?? '?'}<br>
      geo ${gfx.geometries} · tex ${gfx.textures} · dpr ${gfx.dpr.toFixed(2)} (${gfx.qualityTier})<br>
      assets ${bytes(assets.loadedBytes)} / ${bytes(assets.manifestBytes)} · gpu tex ${bytes(assets.gpuTextureBytes)}<br>
      cache m/t/h ${assets.modelCacheSize}/${assets.textureCacheSize}/${assets.hdrCacheSize} · hit ${assets.model.hits + assets.texture.hits + assets.hdr.hits}
    ` : `
      assets ${bytes(assets.loadedBytes)} / ${bytes(assets.manifestBytes)}<br>
      cache m/t/h ${assets.modelCacheSize}/${assets.textureCacheSize}/${assets.hdrCacheSize}
    `;
  };
  renderStats();
  const statsTimer = window.setInterval(renderStats, 500);

  el.addEventListener('click', (e) => {
    const d = (e.target as HTMLElement).dataset.d;
    const u = game.activeUnit();
    switch (d) {
      case 'gold':
        game.gold += 5000;
        game.msg('[debug] +5000 gold', 'info');
        break;
      case 'xp': {
        if (!u) break;
        const rec = game.party[game.activeIdx];
        const gained = u.addXp(1200);
        if (gained > 0) {
          u.refresh(game.sim.time);
        }
        rec.level = u.level;
        rec.xp = u.xp;
        rec.abilityLevels = u.abilities.map((a) => a.level);
        game.msg(`[debug] +1200 XP -> level ${u.level}`, 'info');
        break;
      }
      case 'heal':
        if (u) {
          u.hp = u.stats.maxHp;
          u.mana = u.stats.maxMana;
        }
        game.msg('[debug] healed', 'info');
        break;
      case 'hurt-creeps': {
        if (!u) break;
        let n = 0;
        for (const c of game.sim.unitsArr) {
          if (!c.alive || c.team !== 1 || !c.capturable) continue;
          const dx = c.pos.x - u.pos.x;
          const dy = c.pos.y - u.pos.y;
          if (Math.hypot(dx, dy) < 1200) {
            c.hp = c.stats.maxHp * 0.2;
            n++;
          }
        }
        game.msg(`[debug] ${n} creeps weakened`, 'info');
        break;
      }
      case 'warp': {
        const def = REG.dungeons.get(dungeonSel.value);
        if (!def) break;
        const target = REG.region(def.regionId);
        const save = game.buildSave();
        save.regionId = target.id;
        save.worldSeed = target.seed;
        save.playerPos = { x: target.town.pos.x, y: target.town.pos.y + 500 };
        save.campRespawn = {};
        save.echoRespawn = {};
        save.savedAt = Date.now();
        game.msg(`[debug] warping to ${target.name}`, 'info');
        window.dispatchEvent(new CustomEvent('ancients:load', { detail: save }));
        break;
      }
      case 'enter': {
        const ok = game.startDungeon(dungeonSel.value, tierSel.value as DifficultyTier, {
          modifiers: selectedMods()
        });
        if (!ok) game.msg('[debug] could not start dungeon (wrong region or run already active?)', 'bad');
        break;
      }
      case 'clear': {
        // Use the sim currently receiving input (live dungeon/gym/raid sub-sim,
        // or the overworld) so this works inside a dungeon, not just outside it.
        const sim = game.inputSim();
        const killer = game.controlledUnit();
        const allyTeam = killer ? killer.team : 0;
        let n = 0;
        for (const c of [...sim.unitsArr]) {
          if (c.alive && c.team !== allyTeam) {
            sim.killUnit(c, killer);
            n++;
          }
        }
        game.msg(`[debug] cleared ${n} hostiles`, 'info');
        break;
      }
      case 'exit': {
        const dungeon = game.liveDungeon;
        if (!dungeon || !dungeon.exitsUnlocked()) {
          game.msg('[debug] no exit available yet', 'bad');
          break;
        }
        const exits = dungeon.availableExits();
        if (exits.length === 0) break;
        game.chooseDungeonExit(exits[0].index);
        break;
      }
    }
  });

  return () => {
    window.clearInterval(statsTimer);
    el.remove();
  };
}
