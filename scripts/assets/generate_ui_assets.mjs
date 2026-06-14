// Generate original UI texture assets for the HUD shell. These SVGs are small,
// theme-owned, and optional at runtime: CSS keeps color/gradient fallbacks if a
// file is absent, while medium/high asset preloads include them through the
// manifest like every other public asset.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'ui', 'frames');

function svg(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${body}
</svg>
`;
}

const ASSETS = {
  'carved-frame.svg': svg(96, 96, `
  <defs>
    <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a2d34"/>
      <stop offset=".55" stop-color="#151820"/>
      <stop offset="1" stop-color="#090b10"/>
    </linearGradient>
    <linearGradient id="brass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f1d184"/>
      <stop offset=".45" stop-color="#b88f3a"/>
      <stop offset="1" stop-color="#5f4519"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="88" height="88" rx="12" fill="url(#stone)"/>
  <path d="M16 7h64l9 9v64l-9 9H16l-9-9V16z" fill="none" stroke="#3a2a12" stroke-width="7"/>
  <path d="M17 9h62l8 8v62l-8 8H17l-8-8V17z" fill="none" stroke="url(#brass)" stroke-width="3"/>
  <path d="M19 17h58M19 79h58M17 19v58M79 19v58" stroke="#f6dda0" stroke-opacity=".24" stroke-width="1"/>
  <path d="M18 18l10 5-5-10M78 18l-10 5 5-10M18 78l10-5-5 10M78 78l-10-5 5 10" fill="#d6aa50" fill-opacity=".55"/>
  <path d="M28 12h40M28 84h40M12 28v40M84 28v40" stroke="#07080b" stroke-opacity=".55" stroke-width="2"/>
`),
  'parchment-panel.svg': svg(128, 128, `
  <defs>
    <radialGradient id="paper" cx=".45" cy=".35" r=".85">
      <stop offset="0" stop-color="#3b3327"/>
      <stop offset=".55" stop-color="#211c18"/>
      <stop offset="1" stop-color="#0f1015"/>
    </radialGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="17"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 .18"/>
      </feComponentTransfer>
    </filter>
  </defs>
  <rect width="128" height="128" rx="14" fill="url(#paper)"/>
  <rect x="6" y="6" width="116" height="116" rx="10" fill="none" stroke="#d4ad60" stroke-opacity=".18" stroke-width="2"/>
  <path d="M14 22c24-8 41 6 62-3 13-5 25-4 38 1M14 104c26 7 39-5 61 3 14 5 25 4 39-1" stroke="#efd48a" stroke-opacity=".08" stroke-width="3" fill="none"/>
  <rect width="128" height="128" rx="14" filter="url(#grain)" opacity=".32"/>
`),
  'gem-slot.svg': svg(72, 72, `
  <defs>
    <radialGradient id="well" cx=".5" cy=".42" r=".6">
      <stop offset="0" stop-color="#27344a"/>
      <stop offset=".7" stop-color="#10131b"/>
      <stop offset="1" stop-color="#05070c"/>
    </radialGradient>
    <linearGradient id="bevel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f5d889"/>
      <stop offset=".5" stop-color="#8b6928"/>
      <stop offset="1" stop-color="#241606"/>
    </linearGradient>
  </defs>
  <path d="M12 3h48l9 9v48l-9 9H12l-9-9V12z" fill="url(#well)"/>
  <path d="M13 5h46l8 8v46l-8 8H13l-8-8V13z" fill="none" stroke="url(#bevel)" stroke-width="4"/>
  <path d="M18 11h36l7 7v36l-7 7H18l-7-7V18z" fill="none" stroke="#f6e0a2" stroke-opacity=".18" stroke-width="1"/>
  <path d="M22 17h28l5 5v28l-5 5H22l-5-5V22z" fill="#2d3a56" fill-opacity=".26"/>
  <circle cx="52" cy="18" r="3" fill="#9fe8ff" opacity=".42"/>
`),
  'portrait-frame.svg': svg(88, 88, `
  <defs>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f5dc95"/>
      <stop offset=".5" stop-color="#ad8131"/>
      <stop offset="1" stop-color="#433016"/>
    </linearGradient>
  </defs>
  <rect x="5" y="5" width="78" height="78" rx="12" fill="#0b0d12"/>
  <path d="M16 5h56l11 11v56L72 83H16L5 72V16z" fill="none" stroke="#261606" stroke-width="6"/>
  <path d="M17 8h54l9 9v54l-9 9H17l-9-9V17z" fill="none" stroke="url(#edge)" stroke-width="3"/>
  <path d="M25 12h38M25 76h38M12 25v38M76 25v38" stroke="#fff0bd" stroke-opacity=".18" stroke-width="1"/>
  <circle cx="16" cy="16" r="3" fill="#6fd5ff" opacity=".35"/>
  <circle cx="72" cy="72" r="3" fill="#ffd86a" opacity=".42"/>
`)
};

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, text] of Object.entries(ASSETS)) {
    fs.writeFileSync(path.join(OUT_DIR, name), text);
  }
  console.log(`generated ${Object.keys(ASSETS).length} UI frame assets in ${path.relative(ROOT, OUT_DIR)}`);
}

main();
