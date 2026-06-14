// Asset build pipeline (GRAPHICS_SPEC §13.5 Phase 0).
//
// Turns raw, downloaded CC0/CC-BY packs (kept out of git under tmp/asset_src/)
// into small, shipping files under public/assets/. Only the optimized output is
// committed; the raw packs never are. This mirrors the proven gltf-transform +
// meshopt + sharp flow and keeps the repo light enough to boot instantly.
//
// Usage:
//   npm i -D @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   node scripts/assets/build_assets.mjs scripts/assets/specs/<pack>.json [...more]
//
// Spec format (one JSON file per pack, kept beside this script under specs/):
//   { "items": [ {
//     "src":  "tmp/asset_src/Quaternius/Nature/Oak_1.glb", // .glb / .gltf (+ .bin/png)
//     "out":  "models/props/oak_1.glb",                    // relative to public/assets/
//     "type": "model" | "copy",                            // "copy" = byte-for-byte (HDRI/JPG)
//     "keepClips":   ["Idle", "Walk", "Attack"],           // optional: drop other animations
//     "renameClips": { "Armature|Idle": "Idle" },          // optional: applied after '|' strip
//     "maxTex": 512                                        // optional: clamp embedded texture px
//   } ] }
//
// Notes:
// - Clip names like "AnimalArmature|Idle" are stripped to the segment after the
//   last '|', then deduped. keepClips/renameClips run against the stripped name.
// - "model" runs resample + prune + dedup + optional texture webp resize +
//   meshopt(high). It never joins/flattens/simplifies (that corrupts low-poly
//   rigs and hard edges).
// - "copy" is a straight file copy for HDRIs and standalone PBR/normal JPGs that
//   are loaded directly (terrain splats, sky maps, water normals).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PUBLIC_ASSETS = path.join(ROOT, 'public', 'assets');
const MANIFEST_PATH = path.join(PUBLIC_ASSETS, 'manifest.json');
const DEFAULT_BUDGETS = {
  maxTotalBytes: 90 * 1024 * 1024,
  maxGroupBytes: {
    creep: 35 * 1024 * 1024,
    terrain: 28 * 1024 * 1024,
    town: 18 * 1024 * 1024,
    hero: 45 * 1024 * 1024,
    env: 32 * 1024 * 1024,
    ui: 5 * 1024 * 1024
  },
  maxFileBytesByGroup: {
    creep: 8 * 1024 * 1024,
    terrain: 10 * 1024 * 1024,
    town: 8 * 1024 * 1024,
    hero: 15 * 1024 * 1024,
    env: 20 * 1024 * 1024,
    ui: 4 * 1024 * 1024
  }
};

function resolveSrc(src) {
  return path.isAbsolute(src) ? src : path.join(ROOT, src);
}

function relAssetPath(filePath) {
  return path.relative(PUBLIC_ASSETS, filePath).split(path.sep).join('/');
}

function assetUrl(rel) {
  return `/assets/${rel}`;
}

function assetGroup(rel) {
  if (rel.startsWith('creeps/')) return 'creep';
  if (rel.startsWith('heroes/')) return 'hero';
  if (rel.startsWith('env/')) return 'env';
  if (rel.startsWith('ui/')) return 'ui';
  if (rel.startsWith('vfx/')) return 'vfx';
  if (rel.startsWith('props/town/')) return 'town';
  if (rel.startsWith('props/') || rel.startsWith('textures/terrain/')) return 'terrain';
  if (rel.startsWith('textures/')) return 'terrain';
  return 'ui';
}

function assetType(rel) {
  const ext = path.extname(rel).slice(1).toLowerCase();
  if (ext === 'glb' || ext === 'gltf') return 'model';
  if (ext === 'hdr') return 'hdr';
  if (['jpg', 'jpeg', 'png', 'webp', 'ktx2'].includes(ext)) return 'texture';
  if (['woff', 'woff2'].includes(ext)) return 'font';
  if (['json'].includes(ext)) return 'data';
  return ext || 'file';
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  return `${(bytes / 1024).toFixed(0)}KB`;
}

function walkAssets(dir = PUBLIC_ASSETS, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkAssets(p, out);
      continue;
    }
    const rel = relAssetPath(p);
    if (rel === 'manifest.json' || path.basename(rel).startsWith('.')) continue;
    out.push(rel);
  }
  return out.sort();
}

function sourceKey(specFile) {
  return path.relative(ROOT, path.resolve(specFile)).split(path.sep).join('/');
}

function complexityForRoot(root) {
  const textures = root.listTextures().map((tex) => {
    let size = null;
    try {
      const s = typeof tex.getSize === 'function' ? tex.getSize() : null;
      if (Array.isArray(s)) size = { width: s[0], height: s[1] };
    } catch {
      size = null;
    }
    return { name: tex.getName() || '', ...size };
  });
  return {
    meshes: root.listMeshes().length,
    materials: root.listMaterials().length,
    materialNames: root.listMaterials().map((m) => m.getName() || '(unnamed)'),
    textures: textures.length,
    textureDimensions: textures.filter((t) => t.width && t.height),
    animations: root.listAnimations().length
  };
}

function stripClipName(name) {
  const i = name.lastIndexOf('|');
  return i >= 0 ? name.slice(i + 1) : name;
}

// sRGB hex -> linear RGB triplet (glTF baseColorFactor is linear).
function hexToLinear(hex) {
  const h = hex.replace('#', '');
  const to = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [to(parseInt(h.slice(0, 2), 16)), to(parseInt(h.slice(2, 4), 16)), to(parseInt(h.slice(4, 6), 16))];
}

function luminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Retexture a base mesh to a hero's three-color palette (GRAPHICS_SPEC §13 Phase 5):
 * primary reads as cloth/skin, secondary as worked metal/armour, accent as trim/gem.
 * Each material is mapped to a role by an explicit `materialMap` keyword match on its
 * name, else bucketed by the luminance of its current base color. The factor tints any
 * base-color texture, so atlas detail/AO survives while the hue swings to the palette.
 */
function recolorToPalette(root, palette, materialMap) {
  const [primary, secondary, accent] = palette.map(hexToLinear);
  const roleColor = { primary, secondary, accent };
  const keywords = Object.entries(materialMap ?? {});
  for (const mat of root.listMaterials()) {
    const name = (mat.getName() || '').toLowerCase();
    let role = null;
    for (const [kw, r] of keywords) {
      if (name.includes(kw.toLowerCase())) { role = r; break; }
    }
    if (!role) {
      const cur = mat.getBaseColorFactor();
      const l = luminance([cur[0], cur[1], cur[2]]);
      role = l < 0.18 ? 'secondary' : l > 0.62 ? 'accent' : 'primary';
    }
    const [r, g, b] = roleColor[role] ?? primary;
    const alpha = mat.getBaseColorFactor()[3] ?? 1;
    mat.setBaseColorFactor([r, g, b, alpha]);
  }
}

async function processModel(io, fns, item) {
  const { dedup, meshopt, prune, resample, textureCompress } = fns.functions;
  const { MeshoptEncoder } = fns.meshopt;
  const sharp = fns.sharp;

  const srcPath = resolveSrc(item.src);
  const outPath = path.join(PUBLIC_ASSETS, item.out);
  const doc = await io.read(srcPath);
  const root = doc.getRoot();

  // Normalize + filter animation clips so we ship only what the animator drives.
  const seen = new Set();
  for (const anim of root.listAnimations()) {
    let name = stripClipName(anim.getName());
    if (item.renameClips && item.renameClips[name]) name = item.renameClips[name];
    const drop = (item.keepClips && !item.keepClips.includes(name)) || seen.has(name);
    if (drop) {
      anim.dispose();
      continue;
    }
    seen.add(name);
    anim.setName(name);
  }
  if (item.keepClips) {
    const missing = item.keepClips.filter((c) => !seen.has(c));
    if (missing.length) console.warn(`  WARN ${item.out}: missing clips ${missing.join(', ')}`);
  }

  if (process.env.ASSET_DEBUG_MATERIALS) {
    console.log(`  [materials] ${item.out}: ${root.listMaterials().map((m) => m.getName() || '(unnamed)').join(', ') || '(none)'}`);
  }

  // Retexture to a hero palette before compression (Phase 5). Runs on the raw
  // materials so the keyword/luminance mapping sees their original names + colors.
  if (item.recolor) {
    recolorToPalette(root, item.recolor, item.materialMap);
  }

  const transforms = [resample(), prune(), dedup()];
  if (item.maxTex) {
    transforms.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [item.maxTex, item.maxTex] }));
  }
  transforms.push(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  await doc.transform(...transforms);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await io.write(outPath, doc);
  const bytes = fs.statSync(outPath).size;
  const complexity = complexityForRoot(root);
  console.log(
    `  ${item.out}  ${formatBytes(bytes)}` +
    ` (${complexity.meshes} meshes, ${complexity.materials} materials` +
    `${complexity.animations ? `, ${complexity.animations} clips` : ''})`
  );
  return { rel: item.out, bytes, type: 'model', complexity };
}

function processCopy(item) {
  const srcPath = resolveSrc(item.src);
  const outPath = path.join(PUBLIC_ASSETS, item.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.copyFileSync(srcPath, outPath);
  const bytes = fs.statSync(outPath).size;
  console.log(`  ${item.out}  ${formatBytes(bytes)} (copy)`);
  return { rel: item.out, bytes, type: assetType(item.out), complexity: null };
}

function buildManifest(sourceByOut) {
  const previousByPath = new Map();
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      const previous = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
      for (const file of previous.files ?? []) previousByPath.set(file.path, file);
    } catch {
      previousByPath.clear();
    }
  }
  const files = walkAssets().map((rel) => {
    const abs = path.join(PUBLIC_ASSETS, rel);
    const meta = sourceByOut.get(rel) ?? previousByPath.get(rel) ?? {};
    const bytes = fs.statSync(abs).size;
    const group = meta.group ?? meta.preloadGroup ?? assetGroup(rel);
    return {
      path: rel,
      url: assetUrl(rel),
      bytes,
      type: meta.assetType ?? assetType(rel),
      group,
      preloadGroup: meta.preloadGroup ?? group,
      sourceSpec: meta.sourceSpec ?? null,
      source: meta.source ?? meta.src ?? null
    };
  });
  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  const groups = {};
  for (const file of files) {
    const g = groups[file.group] ?? { count: 0, bytes: 0 };
    g.count++;
    g.bytes += file.bytes;
    groups[file.group] = g;
  }
  const hash = createHash('sha256')
    .update(JSON.stringify(files.map((f) => [f.path, f.bytes, f.group, f.type])))
    .digest('hex')
    .slice(0, 12);
  return {
    version: 1,
    hash,
    generatedAt: new Date().toISOString(),
    assetRoot: '/assets/',
    totalBytes,
    groups,
    files
  };
}

function writeManifest(manifest) {
  fs.mkdirSync(PUBLIC_ASSETS, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest: ${path.relative(ROOT, MANIFEST_PATH)} (${manifest.files.length} files, ${formatBytes(manifest.totalBytes)}, hash ${manifest.hash})`);
}

function printReport(manifest, built) {
  console.log('\nasset report');
  console.log(`  total: ${formatBytes(manifest.totalBytes)} across ${manifest.files.length} files`);
  for (const [group, stats] of Object.entries(manifest.groups).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${group}: ${stats.count} files, ${formatBytes(stats.bytes)}`);
  }
  const largest = [...manifest.files].sort((a, b) => b.bytes - a.bytes).slice(0, 10);
  if (largest.length) {
    console.log('  largest:');
    for (const f of largest) console.log(`    ${formatBytes(f.bytes).padStart(8)}  ${f.path}`);
  }
  const complex = built.filter((b) => b.complexity);
  if (complex.length) {
    console.log('  model complexity:');
    for (const b of complex) {
      const c = b.complexity;
      console.log(
        `    ${b.rel}: ${c.meshes} meshes, ${c.materials} materials, ` +
        `${c.textures} textures, ${c.animations} animations`
      );
      for (const tex of c.textureDimensions.slice(0, 6)) {
        console.log(`      tex ${tex.name || '(unnamed)'} ${tex.width}x${tex.height}`);
      }
    }
  }
}

function checkBudgets(manifest, budgets = DEFAULT_BUDGETS) {
  const failures = [];
  if (manifest.totalBytes > budgets.maxTotalBytes) {
    failures.push(`total ${formatBytes(manifest.totalBytes)} > ${formatBytes(budgets.maxTotalBytes)}`);
  }
  for (const [group, limit] of Object.entries(budgets.maxGroupBytes)) {
    const bytes = manifest.groups[group]?.bytes ?? 0;
    if (bytes > limit) failures.push(`${group} group ${formatBytes(bytes)} > ${formatBytes(limit)}`);
  }
  for (const file of manifest.files) {
    const limit = budgets.maxFileBytesByGroup[file.group];
    if (limit && file.bytes > limit) failures.push(`${file.path} ${formatBytes(file.bytes)} > ${formatBytes(limit)}`);
  }
  return failures;
}

async function loadDeps() {
  // Imported lazily so `node --check` and a deps-free checkout don't fail; the
  // script only needs them when actually building.
  try {
    const [{ NodeIO }, { ALL_EXTENSIONS }, functions, meshopt, sharpMod] = await Promise.all([
      import('@gltf-transform/core'),
      import('@gltf-transform/extensions'),
      import('@gltf-transform/functions'),
      import('meshoptimizer'),
      import('sharp')
    ]);
    return { NodeIO, ALL_EXTENSIONS, functions, meshopt, sharp: sharpMod.default ?? sharpMod };
  } catch (err) {
    console.error('Missing build deps. Install them with:');
    console.error('  npm i -D @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp');
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const specs = args.filter((a) => !a.startsWith('--'));
  const wantsManifest = specs.length > 0 || flags.has('--manifest');
  const wantsReport = specs.length > 0 || flags.has('--report');
  const wantsBudgetCheck = flags.has('--check-budgets') || flags.has('--check-budget');

  if (!specs.length && !wantsManifest && !wantsReport && !wantsBudgetCheck) {
    console.error('usage: node scripts/assets/build_assets.mjs [--manifest] [--report] [--check-budgets] <spec.json> [...]');
    process.exit(1);
  }

  let failures = 0;
  const built = [];
  const sourceByOut = new Map();

  if (specs.length) {
    const deps = await loadDeps();
    await deps.meshopt.MeshoptEncoder.ready;
    await deps.meshopt.MeshoptDecoder.ready;
    const io = new deps.NodeIO()
      .registerExtensions(deps.ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.encoder': deps.meshopt.MeshoptEncoder, 'meshopt.decoder': deps.meshopt.MeshoptDecoder });

    for (const specFile of specs) {
      const specPath = sourceKey(specFile);
      const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
      console.log(`spec: ${specFile} (${spec.items.length} items)`);
      for (const item of spec.items) {
        sourceByOut.set(item.out, {
          sourceSpec: specPath,
          src: item.src,
          source: item.source,
          group: item.group,
          preloadGroup: item.preloadGroup,
          assetType: item.assetType
        });
        try {
          const result = item.type === 'copy' ? processCopy(item) : await processModel(io, deps, item);
          built.push(result);
        } catch (err) {
          failures++;
          console.error(`  FAIL ${item.src}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }

  if (failures) {
    console.error(`${failures} item(s) failed`);
    process.exit(1);
  }

  if (wantsManifest || wantsReport || wantsBudgetCheck) {
    const manifest = buildManifest(sourceByOut);
    if (wantsManifest) writeManifest(manifest);
    if (wantsReport) printReport(manifest, built);
    if (wantsBudgetCheck) {
      const budgetFailures = checkBudgets(manifest);
      if (budgetFailures.length) {
        console.error('\nasset budget check failed:');
        for (const fail of budgetFailures) console.error(`  - ${fail}`);
        process.exit(1);
      }
      console.log(`asset budget check passed (${formatBytes(manifest.totalBytes)} / ${formatBytes(DEFAULT_BUDGETS.maxTotalBytes)})`);
    }
  }
  console.log('done.');
}

main();
