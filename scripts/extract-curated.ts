import fs from 'fs';
import path from 'path';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';

type CuratedBucket = Record<string, Record<string, number>>;

type DatasetEntry = {
  Name?: string;
  Variant?: { Value?: string } | string;
  Series?: { Value?: string } | string;
  Settings?: Record<string, { Resolution?: Record<string, { Games?: Array<Record<string, string>> }> }>;
};

const DEFAULT_DATASET_PATH = 'C:\\Custom Programs\\PC upgrade optimizer\\data\\GPUdataset.json';
const OUTPUT_PATH = path.resolve(process.cwd(), 'data', 'gpu_fps_curated.generated.json');
const LEGACY_PATH = path.resolve(process.cwd(), 'data', 'gpu_fps_curated.json');
const GPUS_PATH = path.resolve(process.cwd(), 'data', 'gpus.json');

const TARGET_GPU_IDS = new Set(['rx7900xtx', 'rx8800xt', 'rx6900xt', 'rx6800xt']);

const RESOLUTION_MAP: Record<string, string> = {
  '1920x1080': '1080p',
  '2560x1440': '1440p',
  '3840x2160': '4k'
};

const GAME_MAP: Record<string, string> = {
  eldenring: 'eldenring',
  overwatch2: 'overwatch2',
  valorant: 'valorant',
  cyberpunk2077: 'cyberpunk',
  apexlegends: 'apex',
  warzone: 'warzone',
  callofdutywarzone: 'warzone',
  reddeadredemption2: 'rdr2',
  playerunknownsbattlegrounds: 'pubg',
  pubg: 'pubg',
  fortnitebattleroyale: 'fortnite',
  fortnite: 'fortnite',
  grandtheftautov: 'gta5',
  gtav: 'gta5',
  rainbowsixsiege: 'r6',
  counterstrikeglobaloffensive: 'csgo',
  leagueoflegends: 'league'
};

const CURATED_GAME_KEYS = new Set(Object.values(GAME_MAP));
const BUCKET_KEYS = [
  '1080p_ultra',
  '1440p_ultra',
  '4k_ultra',
  '1080p_low',
  '1440p_low',
  '4k_low'
];

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const normalizeGpuName = (value: string) => {
  const tokens = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const ignore = new Set(['amd', 'nvidia', 'geforce', 'radeon', 'graphics', 'gpu', 'series']);
  return tokens.filter(token => !ignore.has(token)).join('');
};

const parseNumber = (raw: string | undefined) => {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, '').trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
};

const ensureBuckets = (target: Record<string, CuratedBucket>, gpuId: string) => {
  if (!target[gpuId]) {
    target[gpuId] = Object.fromEntries(BUCKET_KEYS.map(key => [key, {}]));
  }
  return target[gpuId];
};

const mapGameName = (raw: string | undefined) => {
  if (!raw) return null;
  const key = GAME_MAP[normalize(raw)];
  return key ?? null;
};

const readJson = <T>(filePath: string) => {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const cleaned = raw.replace(/^\uFEFF/, '');
  return JSON.parse(cleaned) as T;
};

const createGpuNameMap = () => {
  const gpus = readJson<Array<{ id: string; name: string }>>(GPUS_PATH);
  const entries = gpus.filter(gpu => TARGET_GPU_IDS.has(gpu.id));
  const map = new Map<string, string>();
  entries.forEach(gpu => {
    map.set(normalizeGpuName(gpu.name), gpu.id);
    map.set(normalize(gpu.id), gpu.id);
  });
  return map;
};

const gpuNameMap = createGpuNameMap();

const mapResolutionToLegacy = (value: string) => (value === '4k' ? '4K' : value);

const mergeIntoLegacy = (
  legacy: Record<string, any>,
  extracted: Record<string, CuratedBucket>,
  gpuNames: Record<string, string>
) => {
  if (!legacy.fps) return legacy;
  const next = { ...legacy };
  next.fps = { ...legacy.fps };
  next.gpus = { ...(legacy.gpus ?? {}) };
  const ensure = (preset: string, resolution: string) => {
    if (!next.fps[preset]) next.fps[preset] = {};
    if (!next.fps[preset][resolution]) next.fps[preset][resolution] = {};
  };

  Object.entries(extracted).forEach(([gpuId, buckets]) => {
    Object.entries(buckets).forEach(([bucketKey, games]) => {
      const [resolutionKey, presetKey] = bucketKey.split('_');
      if (!resolutionKey || !presetKey) return;
      const resolution = mapResolutionToLegacy(resolutionKey);
      ensure(presetKey, resolution);
      next.fps[presetKey][resolution][gpuId] = {
        ...(next.fps[presetKey][resolution][gpuId] ?? {}),
        ...games
      };
    });

    if (!next.gpus[gpuId] && gpuNames[gpuId]) {
      next.gpus[gpuId] = gpuNames[gpuId];
    }
  });

  return next;
};

const matchGpuId = (entry: DatasetEntry) => {
  const candidates: Array<string | undefined> = [
    entry.Name,
    typeof entry.Variant === 'string' ? entry.Variant : entry.Variant?.Value,
    typeof entry.Series === 'string' ? entry.Series : entry.Series?.Value
  ];
  for (const name of candidates) {
    if (!name) continue;
    const normalized = normalizeGpuName(name);
    const id = gpuNameMap.get(normalized);
    if (id) return id;
  }
  return null;
};

const extractGames = (
  buckets: CuratedBucket,
  presetKey: string,
  resolutionKey: string,
  games: Array<Record<string, string>>
) => {
  const mappedRes = RESOLUTION_MAP[resolutionKey];
  if (!mappedRes) return;
  const bucketKey = `${mappedRes}_${presetKey}`;
  if (!buckets[bucketKey]) return;
  games.forEach(game => {
    const gameKey = mapGameName(game.Game_Name);
    if (!gameKey) return;
    const value = parseNumber(game.Avg_FPS);
    if (value === null) return;
    if (!buckets[bucketKey][gameKey]) {
      buckets[bucketKey][gameKey] = value;
    }
  });
};

const summarize = (results: Record<string, CuratedBucket>) => {
  const targetList = [...TARGET_GPU_IDS];
  const found = targetList.filter(id => results[id]);
  const missing = targetList.filter(id => !results[id]);
  console.log(`GPUs found: ${found.length}/${targetList.length}`, found.join(', ') || 'none');
  if (missing.length) {
    console.log(`GPUs missing: ${missing.join(', ')}`);
  }

  targetList.forEach(id => {
    const buckets = results[id];
    if (!buckets) return;
    BUCKET_KEYS.forEach(key => {
      const bucket = buckets[key] ?? {};
      const missingGames = [...CURATED_GAME_KEYS].filter(game => !(game in bucket));
      if (missingGames.length) {
        console.log(`[${id}] ${key} missing: ${missingGames.join(', ')}`);
      }
    });
  });
};

const datasetPath = process.argv[2] ?? DEFAULT_DATASET_PATH;

const run = async () => {
  if (!fs.existsSync(datasetPath)) {
    console.error(`Dataset not found: ${datasetPath}`);
    process.exit(1);
  }

  const curated: Record<string, CuratedBucket> = {};
  const pipeline = fs.createReadStream(datasetPath).pipe(parser()).pipe(streamArray());

  for await (const chunk of pipeline as AsyncIterable<{ value: DatasetEntry }>) {
    const entry = chunk.value;
    const gpuId = matchGpuId(entry);
    if (!gpuId) continue;
    const settings = entry.Settings;
    if (!settings) continue;

    const buckets = ensureBuckets(curated, gpuId);
    (['ultra', 'low'] as const).forEach(presetKey => {
      const preset = settings[presetKey];
      const resolutionData = preset?.Resolution ?? {};
      Object.entries(resolutionData).forEach(([resolutionKey, payload]) => {
        const games = payload?.Games ?? [];
        if (games.length === 0) return;
        extractGames(buckets, presetKey, resolutionKey, games);
      });
    });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(curated, null, 2));
  console.log(`Wrote curated data to ${OUTPUT_PATH}`);

  if (fs.existsSync(LEGACY_PATH)) {
    try {
      const legacyRaw = readJson<Record<string, any>>(LEGACY_PATH);
      const gpus = readJson<Array<{ id: string; name: string }>>(GPUS_PATH);
      const gpuNames = Object.fromEntries(gpus.map(gpuItem => [gpuItem.id, gpuItem.name]));
      const merged = mergeIntoLegacy(legacyRaw, curated, gpuNames);
      fs.writeFileSync(LEGACY_PATH, JSON.stringify(merged, null, 2));
      console.log(`Merged curated data into ${LEGACY_PATH}`);
    } catch (err) {
      console.warn('Could not merge into legacy curated file:', err);
    }
  }

  summarize(curated);
};

run().catch(err => {
  console.error('Extraction failed:', err);
  process.exit(1);
});
