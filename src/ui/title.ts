import { REG } from '../core/registry';
import { heroPortrait } from '../engine/icons';
import { Game, newGameSave } from '../systems/game';
import type { GameSave } from '../core/types';

// ------------------------------------------------------------------
// Title screen: new game (starter pick), load slots, import.
// ------------------------------------------------------------------

const STARTERS = ['juggernaut', 'crystal-maiden', 'sniper'];

export function showTitle(onStart: (save: GameSave) => void): void {
  const root = document.getElementById('ui-root')!;
  const renderMain = (): void => {
    const slots = [0, 1, 2, 'auto' as const].map((s) => {
      const info = Game.slotInfo(s);
      const label = s === 'auto' ? 'Autosave' : `Slot ${(s as number) + 1}`;
      if (!info) return `<div class="title-slot dim">${label} — empty</div>`;
      return `<button class="title-slot" data-load="${s}">${label} — <b>${info.name}</b> Lv ${info.level} · ${Math.floor(info.playtime / 60)}m</button>`;
    }).join('');

    root.innerHTML = `
      <div id="title-screen">
        <div class="title-card">
          <h1>ANCIENTS</h1>
          <p class="tagline">The Mad Moon broke. Its shards remember every war.</p>
          <div class="title-actions">
            <button class="btn big" id="new-game">New Game</button>
          </div>
          <h3>Continue</h3>
          <div class="title-slots">${slots}</div>
          <label class="btn dim-btn" for="title-import">Import save JSON<input type="file" id="title-import" accept=".json" hidden></label>
        </div>
      </div>`;

    root.querySelector('#new-game')!.addEventListener('click', renderStarterPick);
    root.querySelectorAll('[data-load]').forEach((el) => {
      el.addEventListener('click', () => {
        const v = (el as HTMLElement).dataset.load!;
        const save = Game.loadSlot(v === 'auto' ? 'auto' : Number(v));
        if (save) onStart(save);
      });
    });
    root.querySelector('#title-import')?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      file.text().then((txt) => {
        try {
          const save = JSON.parse(txt) as unknown;
          if (!Game.validateSave(save)) throw new Error('bad save');
          onStart(save);
        } catch {
          alert('Invalid save file');
        }
      });
    });
  };

  const renderStarterPick = (): void => {
    const cards = STARTERS.map((id) => {
      const def = REG.hero(id);
      return `
        <button class="starter-card" data-pick="${id}">
          <img src="${heroPortrait(def.palette, def.name[0], 96, def.silhouette)}" alt="">
          <b>${def.name}</b>
          <span class="attr ${def.attribute}">${def.attribute.toUpperCase()}</span>
          <p>${def.roles.join(' · ')}</p>
          <em>"${def.barks[0] ?? ''}"</em>
        </button>`;
    }).join('');

    root.innerHTML = `
      <div id="title-screen">
        <div class="title-card wide">
          <h2>Choose your starter</h2>
          <p class="tagline">Three more wait in the Vale. Five march together.</p>
          <div class="starter-row">${cards}</div>
          <button class="btn dim-btn" id="back-title">Back</button>
        </div>
      </div>`;

    root.querySelector('#back-title')!.addEventListener('click', renderMain);
    root.querySelectorAll('[data-pick]').forEach((el) => {
      el.addEventListener('click', () => {
        const heroId = (el as HTMLElement).dataset.pick!;
        onStart(newGameSave(heroId));
      });
    });
  };

  renderMain();
}
