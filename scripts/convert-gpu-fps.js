/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/,/g, '').trim();
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function deriveGpuId(name) {
  const n = String(name ?? '').toLowerCase();
  const mRtx = n.match(/rtx\s*(\d{3,4})\s*(ti)?\s*(super)?/);
  if (mRtx) {
    let id = `rtx${mRtx[1]}`;
    if (mRtx[2]) id += 'ti';
    if (mRtx[3]) id += 'super';
    return id;
  }

  const mGtx = n.match(/gtx\s*(\d{3,4})\s*(ti)?\s*(super)?/);
  if (mGtx) {
    let id = `gtx${mGtx[1]}`;
    if (mGtx[2]) id += 'ti';
    if (mGtx[3]) id += 'super';
    return id;
  }

  const mRx = n.match(/rx\s*(\d{3,4})\s*(xtx|xt)?/);
  if (mRx) {
    let id = `rx${mRx[1]}`;
    if (mRx[2]) id += mRx[2].toLowerCase();
    return id;
  }

  return null;
}

function gpuNameQuality(name) {
  const n = String(name ?? '').toLowerCase();
  // Prefer desktop variants over mobile/max-q.
  let score = 100;
  if (n.includes('mobile')) score -= 60;
  if (n.includes('laptop')) score -= 60;
  if (n.includes('notebook')) score -= 60;
  if (n.includes('max-q')) score -= 50;
  if (n.includes('maxq')) score -= 50;
  if (n.includes('integrated')) score -= 80;
  if (n.includes('m ')) score -= 40;
  // Prefer exact "GeForce RTX 3060" vs weird suffixes.
  if (n.includes('ti')) score += 1;
  if (n.includes('super')) score += 1;
  return score;
}

const RES_MAP = {
  '1920x1080': '1080p',
  '2560x1440': '1440p',
  '3840x2160': '4K'
};

// Map raw dataset game names to our internal ids.
// For a few titles we intentionally reuse close equivalents (e.g., CS2 -> CS:GO).
const GAME_NAME_TO_IDS = {
  'Valorant': ['valorant'],
  'Counter-Strike: Global Offensive': ['csgo', 'cs2'],
  'Fortnite Battle Royale': ['fortnite'],
  "PlayerUnknown's Battlegrounds": ['pubg'],
  'Apex Legends': ['apex'],
  'Overwatch 2': ['overwatch2'],
  'Overwatch': ['overwatch2'],
  'Rainbow Six Siege': ['r6'],
  'League of Legends': ['league'],
  'Cyberpunk 2077': ['cyberpunk'],
  'Elden Ring': ['eldenring'],
  'Red Dead Redemption 2': ['rdr2'],
  'Grand Theft Auto V': ['gta5'],
  'Call of Duty Modern Warfare': ['warzone']
};

function main() {
  const root = process.cwd();
  const inputPath = path.join(root, 'data', 'gpu_fps.json');
  const outputPath = path.join(root, 'data', 'gpu_fps_curated.json');
  const gpusPath = path.join(root, 'data', 'gpus.json');

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const ourGpus = JSON.parse(fs.readFileSync(gpusPath, 'utf8'));
  const ourGpuIds = new Set(ourGpus.map(g => g.id));

  // Pick the best source entry for each of our GPU ids.
  const bestById = new Map();
  for (const entry of raw) {
    const derived = deriveGpuId(entry?.Name);
    if (!derived || !ourGpuIds.has(derived)) continue;
    const quality = gpuNameQuality(entry?.Name);
    const existing = bestById.get(derived);
    if (!existing || quality > existing.quality) {
      bestById.set(derived, { entry, quality });
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: 'gpu_fps.json',
    settings: ['ultra', 'low'],
    resolutions: ['1080p', '1440p', '4K'],
    gpus: {},
    games: {},
    fps: {
      ultra: { '1080p': {}, '1440p': {}, '4K': {} },
      low: { '1080p': {}, '1440p': {}, '4K': {} }
    }
  };

  // Track which games we successfully map at least once.
  const mappedGameIds = new Set();

  for (const [gpuId, { entry }] of bestById.entries()) {
    output.gpus[gpuId] = entry.Name;
    for (const setting of output.settings) {
      const settingBlock = entry.Settings?.[setting]?.Resolution;
      if (!settingBlock) continue;

      for (const [rawRes, appRes] of Object.entries(RES_MAP)) {
        const gamesArr = settingBlock?.[rawRes]?.Games ?? [];
        if (!Array.isArray(gamesArr)) continue;

        const bucket = {};
        for (const game of gamesArr) {
          const name = game?.Game_Name;
          const ids = GAME_NAME_TO_IDS[name];
          if (!ids) continue;

          const fps = parseNumber(game?.Avg_FPS);
          if (fps === null) continue;

          for (const id of ids) {
            bucket[id] = fps;
            mappedGameIds.add(id);
            output.games[id] = name;
          }
        }

        if (Object.keys(bucket).length > 0) {
          output.fps[setting][appRes][gpuId] = bucket;
        }
      }
    }
  }

  output.mappedGpuCount = Object.keys(output.gpus).length;
  output.mappedGameCount = mappedGameIds.size;

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Wrote ${outputPath}`);
  console.log(`GPUs mapped: ${output.mappedGpuCount}`);
  console.log(`Games mapped: ${output.mappedGameCount}`);
  console.log('Mapped games:', Object.keys(output.games).sort().join(', '));
}

main();

