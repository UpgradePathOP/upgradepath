import cpus from '@/data/cpus.json';
import gpus from '@/data/gpus.json';
import games from '@/data/games.json';
import gpuFpsCurated from '@/data/gpu_fps_curated.json';
import monitors from '@/data/monitors.json';
import {
  AnalysisInput,
  AnalysisResult,
  BudgetBucket,
  BottleneckType,
  Cpu,
  GameCategory,
  GameProfile,
  Gpu,
  Heaviness,
  Monitor,
  PartPick,
  Resolution,
  StorageType,
  TypicalBound
} from './types';

const CPU_MAP: Record<string, Cpu> = Object.fromEntries((cpus as Cpu[]).map(c => [c.id, c]));
const GPU_MAP: Record<string, Gpu> = Object.fromEntries((gpus as Gpu[]).map(g => [g.id, g]));
const GAME_MAP: Record<string, GameProfile> = Object.fromEntries((games as GameProfile[]).map(g => [g.id, g]));

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const harmonicMean = (values: number[]) => {
  const valid = values.filter(v => v > 0);
  if (valid.length === 0) return 0;
  const denom = valid.reduce((sum, v) => sum + 1 / v, 0);
  return denom > 0 ? valid.length / denom : 0;
};

const CPU_GAMMA = 1.25;
const GPU_GAMMA = 2.3;

const CPU_CAP_TUNE: Record<GameCategory, number> = {
  ESPORTS: 1.12,
  AAA: 1,
  UE5_AAA: 0.95,
  SIM: 1,
  INDIE: 1.05
};

const CATEGORY_BASE_FPS: Record<GameCategory, number> = {
  ESPORTS: 420,
  AAA: 140,
  UE5_AAA: 110,
  SIM: 130,
  INDIE: 180
};

const RES_SCALE: Record<Resolution, number> = {
  '1080p': 1,
  '1440p': 0.72,
  '4K': 0.48
};

const RES_DEMAND: Record<Resolution, number> = {
  '1080p': 1,
  '1440p': 1.35,
  '4K': 2.2
};

const RELATIVE_GPU_BASELINE = 'rtx4090';
const RELATIVE_GPU_PERF: Record<string, number> = {
  rtx4090: 1.0,
  rtx5080: 1.1,
  rtx5090: 1.35,
  rx7900xtx: 0.95,
  rx8800xt: 1.2
};

const ENGINE_SOFT_CEILING: Record<GameCategory, number> = {
  ESPORTS: 600,
  AAA: 220,
  UE5_AAA: 180,
  SIM: 200,
  INDIE: 300
};

const refreshDemand = (refresh: number) =>
  refresh >= 720
    ? 2.35
    : refresh >= 540
    ? 2.05
    : refresh >= 480
    ? 1.9
    : refresh >= 360
    ? 1.7
    : refresh >= 240
    ? 1.5
    : refresh >= 165
    ? 1.28
    : refresh >= 144
    ? 1.18
    : refresh >= 120
    ? 1.1
    : 1;

const budgetLimit: Record<BudgetBucket, number> = {
  '$0-100': 100,
  '$100-250': 250,
  '$250-400': 400,
  '$400-700': 700,
  '$700-1200': 1200,
  '$1200-1600': 1600,
  '$1600-2000': 2000,
  '$2000-2500': 2500,
  '$2500+': 4000
};

const getGpuScore = (gpu: Gpu, resolution: AnalysisInput['resolution']) => {
  if (resolution === '4K') return gpu.score4k;
  if (resolution === '1440p') return gpu.score1440;
  return gpu.score1080;
};

const cpuIndex = (score: number) => Math.pow(score / 100, CPU_GAMMA);
const gpuIndex = (score: number) => Math.pow(score / 100, GPU_GAMMA);
const cpuCeilingScale = (score: number) => 0.6 + 0.5 * Math.pow(score / 100, 0.7);
const applySoftCap = (fps: number, ceiling: number) => {
  if (!Number.isFinite(fps) || !Number.isFinite(ceiling) || ceiling <= 0) return fps;
  return ceiling * (1 - Math.exp(-fps / ceiling));
};

const gpuPerfIndex = (gpu: Gpu, resolution: Resolution) => {
  const relative = RELATIVE_GPU_PERF[gpu.id];
  const baseline = RELATIVE_GPU_PERF[RELATIVE_GPU_BASELINE] ?? 1;
  const baselineGpu = GPU_MAP[RELATIVE_GPU_BASELINE];
  if (relative && baselineGpu) {
    const baseIndex = gpuIndex(getGpuScore(baselineGpu, resolution));
    if (Number.isFinite(baseIndex) && baseIndex > 0) {
      return baseIndex * (relative / baseline);
    }
  }
  return gpuIndex(getGpuScore(gpu, resolution));
};

const resolveCategory = (game: GameProfile): GameCategory => {
  if (game.category) return game.category;
  return game.type === 'esports' ? 'ESPORTS' : 'AAA';
};

const resolveTypicalBound = (game: GameProfile): TypicalBound => {
  if (game.typicalBound) return game.typicalBound;
  const delta = game.cpuWeight - game.gpuWeight;
  if (delta >= 0.12) return 'CPU_HEAVY';
  if (delta <= -0.12) return 'GPU_HEAVY';
  return 'MIXED';
};

const resolveHeaviness = (value: Heaviness | undefined, fallback: Heaviness): Heaviness =>
  value ?? fallback;

const getVramTargets = (input: AnalysisInput, selectedGames: GameProfile[]) => {
  const vramHeavySelected = selectedGames.some(
    g => resolveHeaviness(g.vramHeaviness, g.vramHeavy ? 'HIGH' : 'MED') === 'HIGH'
  );
  let warnAt = input.resolution === '4K' ? 10 : input.resolution === '1440p' ? 8 : 6;
  let okAt = input.resolution === '4K' ? 12 : input.resolution === '1440p' ? 10 : 8;
  if (vramHeavySelected) {
    warnAt += 2;
    okAt += 2;
  }
  warnAt = Math.min(warnAt, 16);
  okAt = Math.min(okAt, 16);
  return { warnAt, okAt, vramHeavySelected };
};

const resolveWeights = (game: GameProfile) => {
  const cpu = clamp(game.cpuWeight ?? 0.5, 0.2, 0.8);
  const gpu = clamp(game.gpuWeight ?? 0.5, 0.2, 0.8);
  return { cpu, gpu };
};

const resolveMemoryType = (input: AnalysisInput, cpu: Cpu) => {
  const speedLabel = input.ramSpeed.toUpperCase();
  if (speedLabel.includes('DDR5')) return 'DDR5';
  if (speedLabel.includes('DDR4')) return 'DDR4';
  return cpu.memoryType;
};

const cpuSupportsMemoryType = (cpu: Cpu, memoryType: string) => {
  if (cpu.socket === 'LGA1700') return true;
  if (cpu.socket === 'AM5') return memoryType === 'DDR5';
  if (cpu.socket === 'AM4') return memoryType === 'DDR4';
  return cpu.memoryType === memoryType;
};

const getVramPressure = (vram: number, input: AnalysisInput, vramHeaviness: Heaviness) => {
  const tier = vram >= 16 ? 16 : vram >= 12 ? 12 : vram >= 8 ? 8 : vram >= 6 ? 6 : 4;
  const baseTable: Record<Heaviness, Record<number, number>> = {
    LOW: { 4: 55, 6: 35, 8: 18, 12: 8, 16: 5 },
    MED: { 4: 70, 6: 50, 8: 30, 12: 15, 16: 8 },
    HIGH: { 4: 85, 6: 65, 8: 40, 12: 22, 16: 12 }
  };
  const base = baseTable[vramHeaviness][tier] ?? 25;
  const resMultiplier = input.resolution === '4K' ? 1.25 : input.resolution === '1440p' ? 1.1 : 1;
  return clamp(Math.round(base * resMultiplier), 0, 100);
};

const getStutterRisk = (input: AnalysisInput, streaming: Heaviness) => {
  const storageBase = input.storageType === 'HDD' ? 72 : input.storageType === 'SATA SSD' ? 42 : 28;
  const streamFactor = streaming === 'HIGH' ? 1.25 : streaming === 'MED' ? 1 : 0.75;
  const ramPenalty = input.ramAmount < 12 ? 22 : input.ramAmount < 16 ? 12 : input.ramAmount >= 32 ? -6 : 0;
  return clamp(Math.round(storageBase * streamFactor + ramPenalty), 0, 100);
};

const classifyHeadroom = (ratio: number): BottleneckType => {
  if (ratio >= 1.12) return 'GPU_BOUND';
  if (ratio <= 0.88) return 'CPU_BOUND';
  return 'MIXED';
};

const bottleneckConfidence = (ratio: number, typicalBound: TypicalBound, classification: BottleneckType) => {
  const distance = Math.abs(Math.log(ratio || 1));
  const base = 0.55 + Math.min(0.35, distance * 0.35);
  const hintMatch =
    (classification === 'GPU_BOUND' && typicalBound === 'GPU_HEAVY') ||
    (classification === 'CPU_BOUND' && typicalBound === 'CPU_HEAVY');
  return clamp(base + (hintMatch ? 0.06 : 0), 0.55, 0.95);
};

type QualitySetting = 'ultra' | 'low';
type CuratedFps = {
  fps: Record<QualitySetting, Record<Resolution, Record<string, Record<string, number>>>>;
  gpus?: Record<string, string>;
};

const CURATED_FPS = gpuFpsCurated as unknown as CuratedFps;
const CURATED_GPU_IDS = new Set(Object.keys(CURATED_FPS?.gpus ?? {}));

type FpsSource = 'curated' | 'estimated' | 'model';
type FpsSample = { fps: number; source: FpsSource };
type AnchorEntry = { gpuId: string; fps: number; gpuIndexValue: number };

const ESTIMATE_RATIO_MAX = 2.2;
const ESTIMATE_RATIO_EXP = 0.92;
const PERF_GAIN_EXP = 0.9;
const PERF_GAIN_CAP = 1.4;

function lookupCuratedFps(gpuId: string, gameId: string, resolution: Resolution, quality: QualitySetting) {
  const fps = CURATED_FPS?.fps?.[quality]?.[resolution]?.[gpuId]?.[gameId];
  return typeof fps === 'number' ? fps : null;
}

const getCuratedAverage = (gpuId: string, resolution: Resolution, quality: QualitySetting) => {
  const byGpu = CURATED_FPS?.fps?.[quality]?.[resolution]?.[gpuId];
  if (!byGpu) return null;
  const values = Object.values(byGpu).filter(v => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
};

const chooseQualityFallback = (gamesProfiles: GameProfile[]) => {
  const esportsCount = gamesProfiles.filter(g => resolveCategory(g) === 'ESPORTS').length;
  return esportsCount >= gamesProfiles.length / 2 ? 'low' : 'ultra';
};

const getCuratedOverlapAverage = (
  baselineGpuId: string,
  candidateGpuId: string,
  input: AnalysisInput,
  gamesProfiles: GameProfile[]
) => {
  let baselineTotal = 0;
  let candidateTotal = 0;
  let count = 0;
  for (const game of gamesProfiles) {
    const category = resolveCategory(game);
    const quality: QualitySetting = category === 'ESPORTS' ? 'low' : 'ultra';
    const baselineFps = lookupCuratedFps(baselineGpuId, game.id, input.resolution, quality);
    const candidateFps = lookupCuratedFps(candidateGpuId, game.id, input.resolution, quality);
    if (typeof baselineFps === 'number' && typeof candidateFps === 'number') {
      baselineTotal += baselineFps;
      candidateTotal += candidateFps;
      count += 1;
    }
  }
  return {
    baselineAvg: count > 0 ? baselineTotal / count : 0,
    candidateAvg: count > 0 ? candidateTotal / count : 0,
    count
  };
};

const CURATED_ANCHORS = buildCuratedAnchors();

function buildCuratedAnchors() {
  const emptyResolutionMap = (): Record<Resolution, Record<string, AnchorEntry[]>> => ({
    '1080p': {},
    '1440p': {},
    '4K': {}
  });
  const anchors: Record<QualitySetting, Record<Resolution, Record<string, AnchorEntry[]>>> = {
    ultra: emptyResolutionMap(),
    low: emptyResolutionMap()
  };

  const fpsRoot = CURATED_FPS?.fps;
  if (!fpsRoot) return anchors;

  (Object.keys(fpsRoot) as QualitySetting[]).forEach(quality => {
    const byResolution = fpsRoot[quality];
    if (!byResolution) return;
    (Object.keys(byResolution) as Resolution[]).forEach(resolution => {
      const byGpu = byResolution[resolution];
      if (!byGpu) return;
      Object.entries(byGpu).forEach(([gpuId, gamesMap]) => {
        const gpu = GPU_MAP[gpuId];
        if (!gpu || !gamesMap) return;
        const indexValue = gpuPerfIndex(gpu, resolution);
        if (!Number.isFinite(indexValue) || indexValue <= 0) return;
        Object.entries(gamesMap).forEach(([gameId, fps]) => {
          if (typeof fps !== 'number' || !Number.isFinite(fps)) return;
          const bucket = anchors[quality][resolution];
          if (!bucket[gameId]) {
            bucket[gameId] = [];
          }
          bucket[gameId].push({ gpuId, fps, gpuIndexValue: indexValue });
        });
      });
    });
  });

  (Object.keys(anchors) as QualitySetting[]).forEach(quality => {
    (Object.keys(anchors[quality]) as Resolution[]).forEach(resolution => {
      Object.values(anchors[quality][resolution]).forEach(list => {
        list.sort((a, b) => a.gpuIndexValue - b.gpuIndexValue);
      });
    });
  });

  return anchors;
}

function estimateFpsFromAnchors(
  gpuId: string,
  gameId: string,
  resolution: Resolution,
  quality: QualitySetting
) {
  const anchors = CURATED_ANCHORS?.[quality]?.[resolution]?.[gameId];
  if (!anchors || anchors.length === 0) return null;
  const gpu = GPU_MAP[gpuId];
  if (!gpu) return null;
  const targetIndex = gpuPerfIndex(gpu, resolution);
  if (!Number.isFinite(targetIndex) || targetIndex <= 0) return null;

  let best = anchors[0];
  let bestDiff = Math.abs(Math.log(targetIndex / Math.max(anchors[0].gpuIndexValue, 1e-6)));
  for (let i = 1; i < anchors.length; i += 1) {
    const anchor = anchors[i];
    if (!Number.isFinite(anchor.gpuIndexValue) || anchor.gpuIndexValue <= 0) continue;
    const diff = Math.abs(Math.log(targetIndex / anchor.gpuIndexValue));
    if (diff < bestDiff) {
      best = anchor;
      bestDiff = diff;
    }
  }

  const ratioRaw = targetIndex / Math.max(best.gpuIndexValue, 1e-6);
  const ratio = ratioRaw >= 1 ? clamp(ratioRaw, 1, ESTIMATE_RATIO_MAX) : ratioRaw;
  return best.fps * Math.pow(ratio, ESTIMATE_RATIO_EXP);
}

function lookupFpsSample(
  gpuId: string,
  gameId: string,
  resolution: Resolution,
  quality: QualitySetting
): FpsSample | null {
  const curated = lookupCuratedFps(gpuId, gameId, resolution, quality);
  if (curated !== null) {
    return { fps: curated, source: 'curated' };
  }
  const estimated = estimateFpsFromAnchors(gpuId, gameId, resolution, quality);
  if (estimated !== null) {
    return { fps: estimated, source: 'estimated' };
  }
  return null;
}

type GameMetrics = {
  game: GameProfile;
  category: GameCategory;
  typicalBound: TypicalBound;
  headroomRatio: number;
  boundType: BottleneckType;
  confidence: number;
  cpuThroughput: number;
  gpuThroughput: number;
  engineCeiling: number;
  targetLimited: boolean;
  gpuFps: number;
  fpsTypical: number;
  effectiveFps: number;
  stutterRisk: number;
  vramPressure: number;
  benchmarkSource: FpsSource;
  gpuIndexValue: number;
};

type FpsReference = {
  gpuFps: number;
  gpuIndexValue: number;
  source: FpsSource;
};

function computeGameMetrics(
  cpu: Cpu,
  gpu: Gpu,
  input: AnalysisInput,
  game: GameProfile,
  reference?: FpsReference
): GameMetrics {
  const category = resolveCategory(game);
  const typicalBound = resolveTypicalBound(game);
  const weights = resolveWeights(game);

  const gpuScore = getGpuScore(gpu, input.resolution);
  const rawGpuIndex = gpuPerfIndex(gpu, input.resolution);
  const gpuIndexValue =
    rawGpuIndex / (RES_DEMAND[input.resolution] * (0.6 + weights.gpu) * (typicalBound === 'GPU_HEAVY' ? 1.08 : 1));

  const quality: QualitySetting = category === 'ESPORTS' ? 'low' : 'ultra';
  const sample = lookupFpsSample(gpu.id, game.id, input.resolution, quality);
  const baseFps = CATEGORY_BASE_FPS[category] * RES_SCALE[input.resolution];
  let gpuFps = sample?.fps ?? baseFps * rawGpuIndex;
  let benchmarkSource: FpsSource = sample?.source ?? 'model';

  if (!sample && reference && reference.gpuIndexValue > 0 && Number.isFinite(reference.gpuFps)) {
    const ratio = rawGpuIndex / reference.gpuIndexValue;
    gpuFps = reference.gpuFps * ratio;
    benchmarkSource = 'estimated';
  }

  const cpuThroughputBase =
    (cpuIndex(cpu.score) * CPU_CAP_TUNE[category]) /
    ((0.6 + weights.cpu) * (typicalBound === 'CPU_HEAVY' ? 1.08 : 1));
  const cpuThroughput = cpuThroughputBase;
  const headroomRatio = cpuThroughput / gpuIndexValue;
  const boundType = classifyHeadroom(headroomRatio);
  const confidence = bottleneckConfidence(headroomRatio, typicalBound, boundType);

  const engineCeiling = ENGINE_SOFT_CEILING[category] * cpuCeilingScale(cpu.score);
  let fpsTypical = headroomRatio < 1 ? gpuFps * headroomRatio : gpuFps;
  fpsTypical = applySoftCap(fpsTypical, engineCeiling);
  const refreshCap = input.refreshRate > 0 ? input.refreshRate * 1.05 : Infinity;
  const effectiveFps = Math.min(fpsTypical, refreshCap);
  const targetLimited = input.refreshRate >= 144 && engineCeiling < input.refreshRate * 0.9;

  const vramHeaviness = resolveHeaviness(game.vramHeaviness, game.vramHeavy ? 'HIGH' : 'MED');
  const streamingHeaviness = resolveHeaviness(game.streamingHeaviness, category === 'ESPORTS' ? 'LOW' : 'MED');
  const vramPressure = getVramPressure(gpu.vram, input, vramHeaviness);
  const stutterRisk = getStutterRisk(input, streamingHeaviness);

  return {
    game,
    category,
    typicalBound,
    headroomRatio,
    boundType,
    confidence,
    cpuThroughput,
    gpuThroughput: gpuIndexValue,
    engineCeiling,
    targetLimited,
    gpuFps,
    fpsTypical,
    effectiveFps,
    stutterRisk,
    vramPressure,
    benchmarkSource,
    gpuIndexValue: rawGpuIndex
  };
}

type AggregateMetrics = {
  perGame: GameMetrics[];
  headroomRatio: number;
  boundType: BottleneckType;
  confidence: number;
  gpuFpsAvg: number;
  fpsTypicalAvg: number;
  effectiveFpsAvg: number;
  stutterRiskAvg: number;
  vramPressureAvg: number;
  targetLimitedShare: number;
  curatedCount: number;
  estimatedCount: number;
  modelCount: number;
  benchmarkCoverage: number;
};

function aggregateMetrics(
  cpu: Cpu,
  gpu: Gpu,
  input: AnalysisInput,
  gamesProfiles: GameProfile[],
  referenceMap?: Record<string, FpsReference>
): AggregateMetrics {
  const perGame = gamesProfiles.map(game => {
    const reference = referenceMap?.[game.id];
    return computeGameMetrics(cpu, gpu, input, game, reference);
  });

  const cpuEff = harmonicMean(perGame.map(g => g.cpuThroughput));
  const gpuEff = harmonicMean(perGame.map(g => g.gpuThroughput));
  const headroomRatio = cpuEff > 0 && gpuEff > 0 ? cpuEff / gpuEff : 1;
  const boundType = classifyHeadroom(headroomRatio);
  const matchRatio =
    perGame.length > 0 ? perGame.filter(g => g.boundType === boundType).length / perGame.length : 0;
  const confidence = clamp(0.55 + Math.abs(Math.log(headroomRatio)) * 0.35 + matchRatio * 0.08, 0.55, 0.95);

  const gpuFpsAvg = perGame.reduce((s, g) => s + g.gpuFps, 0) / perGame.length;
  const fpsTypicalAvg = perGame.reduce((s, g) => s + g.fpsTypical, 0) / perGame.length;
  const effectiveFpsAvg = perGame.reduce((s, g) => s + g.effectiveFps, 0) / perGame.length;
  const stutterRiskAvg = perGame.reduce((s, g) => s + g.stutterRisk, 0) / perGame.length;
  const vramPressureAvg = perGame.reduce((s, g) => s + g.vramPressure, 0) / perGame.length;
  const targetLimitedShare = perGame.length > 0 ? perGame.filter(g => g.targetLimited).length / perGame.length : 0;
  const curatedCount = perGame.filter(g => g.benchmarkSource === 'curated').length;
  const estimatedCount = perGame.filter(g => g.benchmarkSource === 'estimated').length;
  const modelCount = perGame.filter(g => g.benchmarkSource === 'model').length;
  const benchmarkCoverage = perGame.length > 0 ? curatedCount / perGame.length : 0;

  return {
    perGame,
    headroomRatio,
    boundType,
    confidence,
    gpuFpsAvg,
    fpsTypicalAvg,
    effectiveFpsAvg,
    stutterRiskAvg,
    vramPressureAvg,
    targetLimitedShare,
    curatedCount,
    estimatedCount,
    modelCount,
    benchmarkCoverage
  };
}

const calcAvgFpsGainPct = (baseline: AggregateMetrics, candidate: AggregateMetrics) => {
  const base = baseline.gpuFpsAvg;
  const next = candidate.gpuFpsAvg;
  if (base <= 0) return 0;
  const floor = Math.max(base, 45);
  return ((next - base) / floor) * 100;
};

const calcUtilityGainPct = (baseline: AggregateMetrics, candidate: AggregateMetrics) => {
  const base = baseline.effectiveFpsAvg;
  const next = candidate.effectiveFpsAvg;
  if (base <= 0) return 0;
  const floor = Math.max(base, 45);
  return ((next - base) / floor) * 100;
};

const describeRawUplift = (gain: number) => {
  if (!Number.isFinite(gain) || gain <= 0) return 'Raw GPU potential';
  if (gain < 12) return 'Marginal raw uplift';
  if (gain < 35) return 'Modest raw uplift';
  return 'Large raw uplift';
};

function suggestParts(
  category: 'CPU' | 'GPU',
  input: AnalysisInput,
  cpu: Cpu,
  gpu: Gpu,
  gamesProfiles: GameProfile[],
  baseline: AggregateMetrics,
  referenceMap: Record<string, FpsReference>,
  isTargetLimited: boolean,
  useRawPotentialLabel: boolean
): PartPick[] {
  const limit = budgetLimit[input.budgetBucket];
  const targetGain = category === 'CPU' ? 6 : 8;

  if (category === 'CPU') {
    const currentScore = cpu.score;
    const cpuHeavyCount = gamesProfiles.filter(g => resolveTypicalBound(g) === 'CPU_HEAVY').length;
    const candidates = (cpus as Cpu[])
      .filter(c => c.score > currentScore + targetGain)
      .filter(c => c.socket === cpu.socket && c.memoryType === cpu.memoryType)
      .sort((a, b) => (b.score - currentScore) / b.price - (a.score - currentScore) / a.price)
      .filter(c => c.price <= limit)
      .slice(0, 3);
    return candidates.map(c => {
      const bullets: string[] = [];
      if (baseline.boundType === 'CPU_BOUND') {
        bullets.push('Largest gains when CPU-limited.');
      }
      if (input.refreshRate >= 144) {
        bullets.push(`Better headroom for ${input.refreshRate}Hz targets.`);
      }
      if (cpuHeavyCount > 0) {
        bullets.push('Improves frame pacing in CPU-heavy titles.');
      }
      if (bullets.length === 0) {
        bullets.push('Balanced CPU uplift for mixed workloads.');
      }
      const notes: string[] = [];
      if (c.socket !== cpu.socket) {
        notes.push(`Requires ${c.socket} motherboard (current: ${cpu.socket})`);
      }
      if (c.memoryType !== cpu.memoryType) {
        notes.push(`Memory type change: ${c.memoryType} (current: ${cpu.memoryType})`);
      }
      return {
        id: c.id,
        partType: 'CPU',
        name: c.name,
        price: c.price,
        qualitativeBullets: bullets.slice(0, 2),
        notes
      };
    });
  }

  const gpuHeavyCount = gamesProfiles.filter(g => resolveTypicalBound(g) === 'GPU_HEAVY').length;
  const baselinePerfIndex = gpuPerfIndex(gpu, input.resolution);
  const qualityFallback = chooseQualityFallback(gamesProfiles);
  const baselineCuratedAvg = getCuratedAverage(gpu.id, input.resolution, qualityFallback);
  const baseList = (gpus as Gpu[]).filter(g => g.price <= limit && g.id !== gpu.id);
  const candidates = baseList.map(g => {
    const candidateAgg = aggregateMetrics(cpu, g, input, gamesProfiles, referenceMap);
    let rawAvgGain = calcAvgFpsGainPct(baseline, candidateAgg);
    let avgGain = Math.max(0, Math.round(rawAvgGain));
    const rawUtilityGain = calcUtilityGainPct(baseline, candidateAgg);
    const utilityGain = Math.max(0, Math.round(rawUtilityGain));
    const rawScore = candidateAgg.fpsTypicalAvg;
    const perfScore = gpuPerfIndex(g, input.resolution);
    const overlap = getCuratedOverlapAverage(gpu.id, g.id, input, gamesProfiles);
    const candidateCuratedAvg = getCuratedAverage(g.id, input.resolution, qualityFallback);
    const slowerThanBaseline =
      overlap.count >= 2
        ? overlap.candidateAvg <= overlap.baselineAvg * 1.02
        : baselineCuratedAvg && candidateCuratedAvg
        ? candidateCuratedAvg <= baselineCuratedAvg * 1.02
        : perfScore <= baselinePerfIndex * 1.02;
    const confidence: PartPick['confidence'] =
      candidateAgg.curatedCount === gamesProfiles.length
        ? 'confirmed'
        : candidateAgg.modelCount === gamesProfiles.length
        ? 'speculative'
        : 'estimated';
    const estimated = confidence !== 'confirmed';
    const perfRatio = baselinePerfIndex > 0 ? perfScore / baselinePerfIndex : 1;
    const perfGainPct = (Math.pow(perfRatio, PERF_GAIN_EXP) - 1) * 100;
    if (estimated && Number.isFinite(perfGainPct)) {
      rawAvgGain = Math.min(rawAvgGain, perfGainPct * PERF_GAIN_CAP);
      avgGain = Math.max(0, Math.round(rawAvgGain));
    }
    const isCuratedGpu = CURATED_GPU_IDS.has(g.id);
    return {
      gpu: g,
      avgGain,
      utilityGain,
      rawAvgGain,
      rawUtilityGain,
      rawScore,
      perfScore,
      slowerThanBaseline,
      estimated,
      confidence,
      isCuratedGpu,
      effectiveFps: candidateAgg.effectiveFpsAvg,
      valueScore: 0,
      balanceScore: 0
    };
  });

  const byPerfAsc = [...candidates].sort((a, b) => a.perfScore - b.perfScore);
  let floorGain = 0;
  byPerfAsc.forEach(candidate => {
    if (candidate.rawAvgGain < floorGain) {
      candidate.rawAvgGain = floorGain;
      candidate.avgGain = Math.max(0, Math.round(candidate.rawAvgGain));
    } else {
      floorGain = candidate.rawAvgGain;
    }
  });
  candidates.forEach(candidate => {
    candidate.valueScore = candidate.rawAvgGain / Math.max(candidate.gpu.price, 1);
    candidate.balanceScore = candidate.rawAvgGain / Math.sqrt(Math.max(candidate.gpu.price, 1));
  });

  const improving = candidates.filter(c => c.rawAvgGain > 1 && !c.slowerThanBaseline);
  const usable = improving.length ? improving : [];
  if (usable.length === 0) return [];

  const byValue = [...usable].sort((a, b) => b.valueScore - a.valueScore);
  const byPerf = [...usable].sort((a, b) => b.perfScore - a.perfScore || b.avgGain - a.avgGain);
  const byBalanced = [...usable].sort((a, b) => b.balanceScore - a.balanceScore);

  const used = new Set<string>();
  const pickUnique = (list: typeof candidates) => list.find(item => !used.has(item.gpu.id));
  const picks: Array<{ label: string; candidate: (typeof candidates)[number] }> = [];
  const addPick = (label: string, list: typeof candidates) => {
    const pick = pickUnique(list);
    if (!pick) return;
    used.add(pick.gpu.id);
    picks.push({ label, candidate: pick });
  };

  const addOrMergePick = (label: string, candidate: (typeof candidates)[number] | undefined) => {
    if (!candidate) return;
    const existing = picks.find(p => p.candidate.gpu.id === candidate.gpu.id);
    if (existing) {
      existing.label = `${existing.label} · ${label}`;
      return;
    }
    used.add(candidate.gpu.id);
    picks.push({ label, candidate });
  };

  const bestValueCandidate = byValue[0];
  const bestPerf = byPerf[0];
  addOrMergePick('Best value per dollar', bestValueCandidate);
  addOrMergePick('Fastest within budget', bestPerf);
  addPick('Balanced', byBalanced);

  const labelOrder = ['Best value per dollar', 'Fastest within budget', 'Balanced'];
  picks.sort((a, b) => labelOrder.indexOf(a.label) - labelOrder.indexOf(b.label));

  return picks.map(({ label, candidate }): PartPick => {
    const g = candidate.gpu;
    const isUnvalidated = !candidate.isCuratedGpu;
    const avgFpsGainPct = candidate.confidence === 'speculative' ? undefined : candidate.avgGain;
    const bullets: string[] = [];
    if (baseline.boundType === 'GPU_BOUND' && !isTargetLimited) {
      bullets.push('Largest FPS gains for your selection.');
    }
    if (g.vram > gpu.vram) {
      bullets.push('More VRAM headroom for high textures.');
    }
    if (input.resolution !== '1080p') {
      bullets.push(`Better suited for ${input.resolution} gaming.`);
    }
    if (gpuHeavyCount > 0) {
      bullets.push('Stronger GPU headroom for visually demanding titles.');
    }
    if (isTargetLimited) {
      bullets.push('Refresh target likely exceeds achievable FPS in these titles.');
    }
    const targetFps = input.refreshRate;
    if (candidate.effectiveFps >= targetFps * 0.98) {
      bullets.push('Diminishing returns at current refresh; higher resolution benefits more.');
    }
    if (bullets.length === 0) {
      bullets.push('Balanced GPU uplift for mixed workloads.');
    }
    return {
      id: g.id,
      partType: 'GPU',
      name: g.name,
      label,
      price: g.price,
      avgFpsGainPct,
      avgFpsGainLabel: useRawPotentialLabel ? 'Raw GPU potential' : 'Avg FPS',
      estimated: candidate.estimated || isUnvalidated,
      confidence: candidate.confidence,
      qualitativeBullets: bullets.slice(0, 2),
      notes: []
    };
  });
}

function suggestRam(input: AnalysisInput, cpu: Cpu): PartPick[] {
  const memoryType = resolveMemoryType(input, cpu);
  const kits = [
    { id: 'ram-16-3200', name: '16GB (2x8) DDR4-3200', price: 50, capacity: 16, type: 'DDR4' as const },
    { id: 'ram-32-3600', name: '32GB (2x16) DDR4-3600', price: 90, capacity: 32, type: 'DDR4' as const },
    { id: 'ram-32-6000', name: '32GB (2x16) DDR5-6000', price: 120, capacity: 32, type: 'DDR5' as const }
  ];
  const currentCapacity = input.ramAmount;
  const needMore = currentCapacity < 16 ? 16 : currentCapacity < 32 ? 32 : 0;
  const budgetLimitVal = budgetLimit[input.budgetBucket];
  const matches = kits
    .filter(k => (needMore ? k.capacity >= needMore : k.capacity > currentCapacity))
    .filter(k => k.type === memoryType)
    .filter(k => k.price <= budgetLimitVal)
    .slice(0, 2);
    return matches.map((k): PartPick => {
    const bullets: string[] = [];
    if (input.ramAmount < 16 && k.capacity >= 16) {
      bullets.push('Reaches the 16GB baseline for modern titles.');
    }
    if (input.ramAmount < 32 && k.capacity >= 32) {
      bullets.push('More headroom for large open-world games and multitasking.');
    }
    if (bullets.length === 0) {
      bullets.push('Small average FPS change; improves stability in heavy scenes.');
    }
    return {
      id: k.id,
      partType: 'RAM',
      name: k.name,
      price: k.price,
      qualitativeBullets: bullets.slice(0, 2),
      notes: []
    };
  });
}

function suggestStorage(input: AnalysisInput): PartPick[] {
  const options = [
    { id: 'ssd-sata-1tb', name: '1TB SATA SSD', price: 55, type: 'SATA SSD' as StorageType },
    { id: 'ssd-nvme-1tb', name: '1TB NVMe Gen3', price: 75, type: 'NVMe' as StorageType },
    { id: 'ssd-nvme4-1tb', name: '1TB NVMe Gen4', price: 95, type: 'NVMe' as StorageType }
  ];
  const budgetLimitVal = budgetLimit[input.budgetBucket];
  const baseOptions =
    input.storageType === 'HDD'
      ? options
      : input.storageType === 'SATA SSD'
      ? options.filter(o => o.type === 'NVMe')
      : [];
  const picks = baseOptions.filter(o => o.price <= budgetLimitVal).slice(0, 2);
  return picks.map((o): PartPick => {
    const fromHdd = input.storageType === 'HDD';
    const bullets: string[] = [];
    if (fromHdd) {
      bullets.push('Much faster load times in large games.');
      bullets.push('Less traversal hitching in streaming-heavy titles.');
    } else {
      bullets.push('Slightly faster loads and installs.');
      bullets.push('Average FPS usually unchanged.');
    }
    return {
      id: o.id,
      partType: 'STORAGE',
      name: o.name,
      price: o.price,
      qualitativeBullets: bullets,
      notes: []
    };
  });
}

function suggestMonitor(input: AnalysisInput, aggregate: AggregateMetrics): PartPick[] {
  const catalog = monitors as Monitor[];
  const esportsGames = aggregate.perGame.filter(g => g.category === 'ESPORTS');
  const esportsAvg = esportsGames.length
    ? esportsGames.reduce((s, g) => s + g.effectiveFps, 0) / esportsGames.length
    : 0;
  const overallAvg = aggregate.effectiveFpsAvg;
  const targetFps = esportsGames.length ? esportsAvg : overallAvg;
  const budgetLimitVal = budgetLimit[input.budgetBucket];

  const maxRefresh =
    targetFps >= 320
      ? 360
      : targetFps >= 240
      ? 240
      : targetFps >= 180
      ? 165
      : targetFps >= 135
      ? 144
      : targetFps >= 110
      ? 120
      : 60;

  const candidates = catalog
    .filter(m => m.resolution === input.resolution)
    .filter(m => m.refresh <= maxRefresh)
    .filter(m => m.price <= budgetLimitVal)
    .sort((a, b) => b.refresh - a.refresh || a.price - b.price)
    .slice(0, 3)
    .map((m): PartPick => {
      const bullets = [
        `Refresh target up to ${maxRefresh}Hz based on estimated FPS.`,
        esportsGames.length ? 'Geared for esports pacing.' : 'Balanced for your selected titles.'
      ];
      if (m.notes) {
        bullets.push(m.notes);
      }
      return {
        id: m.id,
        partType: 'MONITOR' as const,
        name: m.name,
        price: m.price,
        qualitativeBullets: bullets.slice(0, 3),
        notes: []
      };
    });

  return candidates;
}

export function analyzeSystem(input: AnalysisInput): AnalysisResult {
  const cpu = CPU_MAP[input.cpuId] ?? (cpus as Cpu[])[0];
  const gpu = GPU_MAP[input.gpuId] ?? (gpus as Gpu[])[0];
  const fallbackWarnings: string[] = [];
  if (!CPU_MAP[input.cpuId]) fallbackWarnings.push('Selected CPU not found; used nearest default.');
  if (!GPU_MAP[input.gpuId]) fallbackWarnings.push('Selected GPU not found; used nearest default.');

  const selectedGames = input.games.map(id => GAME_MAP[id]).filter(Boolean);
  if (selectedGames.length === 0) {
    throw new Error('Select at least one game.');
  }

  const baselineAgg = aggregateMetrics(cpu, gpu, input, selectedGames);
  const referenceMap: Record<string, FpsReference> = Object.fromEntries(
    baselineAgg.perGame.map(g => [
      g.game.id,
      { gpuFps: g.gpuFps, gpuIndexValue: g.gpuIndexValue, source: g.benchmarkSource }
    ])
  );

  const reachCount =
    input.refreshRate > 0
      ? baselineAgg.perGame.filter(g => g.fpsTypical >= input.refreshRate * 0.98).length
      : 0;
  const refreshLimitedShare =
    baselineAgg.perGame.length > 0 ? reachCount / baselineAgg.perGame.length : 0;

  const budgetCap = budgetLimit[input.budgetBucket];
  const bestGpuCandidate =
    (gpus as Gpu[])
      .filter(candidate => candidate.price <= budgetCap)
      .sort((a, b) => getGpuScore(b, input.resolution) - getGpuScore(a, input.resolution))[0] ?? gpu;
  const maxPotentialAgg = aggregateMetrics(cpu, bestGpuCandidate, input, selectedGames, referenceMap);
  const targetLimited =
    input.refreshRate >= 144 &&
    (baselineAgg.targetLimitedShare >= 0.6 || maxPotentialAgg.fpsTypicalAvg < input.refreshRate * 0.85);
  const verdictBoundType: BottleneckType = targetLimited ? 'TARGET_LIMITED' : baselineAgg.boundType;
  const useRawPotentialLabel = verdictBoundType === 'TARGET_LIMITED' && refreshLimitedShare < 0.5;
  const isTargetLimited = verdictBoundType === 'TARGET_LIMITED';
  const verdictConfidence = targetLimited
    ? clamp(
        0.65 +
          (1 - Math.min(maxPotentialAgg.fpsTypicalAvg / Math.max(input.refreshRate, 1), 1)) * 0.25,
        0.65,
        0.9
      )
    : baselineAgg.confidence;

  const reasons: string[] = [];
  const headroomRatio = baselineAgg.headroomRatio;
  if (verdictBoundType === 'TARGET_LIMITED') {
    reasons.push(
      `Your ${input.refreshRate}Hz target is above expected FPS for most selected titles at ${input.resolution}.`
    );
    reasons.push(`${reachCount}/${selectedGames.length} titles are likely to reach ${input.refreshRate} FPS.`);
    reasons.push('At very high refresh targets, CPU/engine limits matter as much as GPU power.');
    reasons.push('Expect diminishing returns at this display target.');
  } else if (baselineAgg.boundType === 'CPU_BOUND') {
    reasons.push('Your CPU is the limiting factor for the selected titles.');
    if (input.refreshRate >= 144) {
      reasons.push(`High refresh (${input.refreshRate}Hz) increases CPU demand.`);
    } else {
      reasons.push('Upgrading the CPU should improve FPS until the GPU becomes limiting.');
    }
  } else if (baselineAgg.boundType === 'GPU_BOUND') {
    reasons.push(`Your GPU is the limiting factor at ${input.resolution}.`);
    if (input.resolution !== '1080p') {
      reasons.push(`${input.resolution} shifts more work to the GPU.`);
    } else {
      reasons.push('Upgrading the GPU should significantly increase FPS.');
    }
  } else {
    reasons.push('CPU and GPU headroom are closely matched.');
    reasons.push('Both upgrades yield smaller, incremental gains.');
    reasons.push('Resolution and refresh tradeoffs balance the load.');
  }

  if (baselineAgg.curatedCount > 0 && baselineAgg.curatedCount < selectedGames.length) {
    reasons.push(
      `Benchmark coverage: ${baselineAgg.curatedCount}/${selectedGames.length} curated, ${baselineAgg.estimatedCount}/${selectedGames.length} estimated, ${baselineAgg.modelCount}/${selectedGames.length} modeled`
    );
  } else if (baselineAgg.curatedCount === 0 && baselineAgg.estimatedCount > 0) {
    reasons.push('Benchmark coverage: no direct benchmarks; estimates derived from similar GPUs.');
  } else if (baselineAgg.curatedCount === 0 && baselineAgg.modelCount > 0) {
    reasons.push('Benchmark coverage: no direct benchmarks; estimates derived from component scores.');
  }

  const cpuDeficit = headroomRatio < 1 ? (1 / headroomRatio - 1) * 100 : 0;
  const gpuDeficit = headroomRatio > 1 ? (headroomRatio - 1) * 100 : 0;

  const ramNeedScore = input.ramAmount < 12 ? 32 : input.ramAmount < 16 ? 22 : input.ramAmount < 32 ? 10 : 0;
  const storageNeedScore = baselineAgg.stutterRiskAvg * 0.6;

  const upgrades = [
    { category: 'CPU', priority: cpuDeficit },
    { category: 'GPU', priority: gpuDeficit },
    { category: 'RAM', priority: ramNeedScore },
    { category: 'Storage', priority: storageNeedScore }
  ];

  const budgetScale =
    input.budgetBucket === '$0-100'
      ? 0.6
      : input.budgetBucket === '$100-250'
      ? 0.8
      : input.budgetBucket === '$250-400'
      ? 1
      : input.budgetBucket === '$400-700'
      ? 1.1
      : input.budgetBucket === '$700-1200'
      ? 1.2
      : input.budgetBucket === '$1200-1600'
      ? 1.25
      : input.budgetBucket === '$1600-2000'
      ? 1.3
      : input.budgetBucket === '$2000-2500'
      ? 1.35
      : 1.4;
  upgrades.forEach(u => {
    u.priority *= budgetScale;
  });

  upgrades.sort((a, b) => b.priority - a.priority);

  const recommendedParts: AnalysisResult['recommendedParts'] = [
    {
      category: 'CPU',
      items: suggestParts(
        'CPU',
        input,
        cpu,
        gpu,
        selectedGames,
        baselineAgg,
        referenceMap,
        isTargetLimited,
        useRawPotentialLabel
      )
    },
    {
      category: 'GPU',
      items: suggestParts(
        'GPU',
        input,
        cpu,
        gpu,
        selectedGames,
        baselineAgg,
        referenceMap,
        isTargetLimited,
        useRawPotentialLabel
      )
    },
    { category: 'RAM', items: suggestRam(input, cpu) },
    { category: 'Storage', items: suggestStorage(input) },
    { category: 'Monitor', items: suggestMonitor(input, baselineAgg) }
  ];

  const estimateRange = (items: AnalysisResult['recommendedParts'][number]['items']) => {
    const gains = items
      .map(i => i.avgFpsGainPct)
      .filter((v): v is number => typeof v === 'number' && v > 0)
      .sort((a, b) => b - a);
    if (gains.length === 0) return null;
    const min = Math.min(...gains);
    const max = Math.max(...gains);
    if (min !== max) {
      return `~+${min}-${max}%`;
    }
    return `~+${max}%`;
  };

  const upgradePath = upgrades
    .filter(u => u.priority > 6 && u.category !== 'Storage')
    .map(u => {
      const reasons: string[] = [];
      let impactSummary = '';
      if (u.category === 'CPU') {
        impactSummary =
          verdictBoundType === 'CPU_BOUND'
            ? 'Modest avg FPS gains in CPU-limited titles'
            : 'Better high-refresh headroom; modest avg FPS change';
        reasons.push('CPU headroom trails GPU throughput.');
        if (input.refreshRate >= 144) {
          reasons.push(`High refresh targets benefit from faster CPU.`);
        }
      } else if (u.category === 'GPU') {
        const gpuRange = estimateRange(recommendedParts.find(p => p.category === 'GPU')?.items ?? []);
        const gainLabel = useRawPotentialLabel ? 'Raw GPU potential' : 'Estimated avg FPS gain';
        impactSummary = gpuRange
          ? `${gainLabel}: ${gpuRange}`
          : useRawPotentialLabel
          ? 'Raw GPU potential varies by title.'
          : 'Estimated avg FPS gain varies by title.';
        reasons.push(
          verdictBoundType === 'TARGET_LIMITED'
            ? 'GPU upgrades help, but refresh targets are above expected FPS.'
            : 'GPU is the dominant limiter for your selection.'
        );
        const vramTargets = getVramTargets(input, selectedGames);
        if (baselineAgg.vramPressureAvg >= 60 && gpu.vram < vramTargets.warnAt) {
          reasons.push(
            `Some VRAM-heavy titles may need ${vramTargets.warnAt}GB+ at ${input.resolution} for higher textures.`
          );
        }
      } else if (u.category === 'RAM') {
        impactSummary = 'Improves stability in modern titles; small avg FPS change';
        if (input.ramAmount < 16) {
          reasons.push('16GB is the current baseline for modern titles.');
        } else {
          reasons.push('More RAM reduces paging in heavy scenes.');
        }
      } else if (u.category === 'Storage') {
        impactSummary = 'Faster loads + less traversal hitching';
        if (input.storageType === 'HDD') {
          reasons.push('HDDs increase traversal stutter in streaming-heavy games.');
        } else {
          reasons.push('NVMe mainly improves load times and installs.');
        }
      }
      return {
        category: u.category,
        impactSummary,
        reasons
      };
    });

  const gpuPickItems = recommendedParts.find(p => p.category === 'GPU')?.items ?? [];
  const gpuChoiceOptions =
    gpuPickItems.length > 0
      ? gpuPickItems.map(item => ({
          label: item.label ?? 'Pick',
          name: item.name,
          price: item.price,
          impactSummary: item.avgFpsGainPct
            ? useRawPotentialLabel
              ? `Raw GPU potential: ~+${item.avgFpsGainPct}%`
              : `${item.estimated ? 'Estimated ' : ''}~+${item.avgFpsGainPct}% avg FPS`
            : item.confidence === 'speculative'
            ? 'Speculative performance (no benchmarks)'
            : 'Estimated impact (limited data)',
          estimated: item.estimated ?? item.avgFpsGainPct === undefined,
          confidence: item.confidence
        }))
      : null;
  const groupsWithItems = recommendedParts.filter(group => group.items.length > 0);
  const bestGpuGain = gpuPickItems.length > 0 ? Math.max(...gpuPickItems.map(p => p.avgFpsGainPct ?? 0)) : 0;
  const ramConstrained = input.ramAmount < 16;
  const storagePick = recommendedParts.find(p => p.category === 'Storage')?.items ?? [];
  const storageHelpful = input.storageType === 'HDD' && storagePick.length > 0;
  const noMeaningfulGpu = bestGpuGain > 0 ? bestGpuGain < 12 : true;
  const topCategory = upgradePath[0]?.category;
  const preferredCategory =
    verdictBoundType === 'GPU_BOUND' && !noMeaningfulGpu
      ? 'GPU'
      : verdictBoundType === 'CPU_BOUND'
      ? 'CPU'
      : null;
  const preferredGroup = preferredCategory ? groupsWithItems.find(g => g.category === preferredCategory) : null;
  const bestGroup =
    preferredGroup ||
    (topCategory && groupsWithItems.find(g => g.category === topCategory)) ||
    (upgradePath.length === 0 ? groupsWithItems.find(g => g.category === 'Storage') : null) ||
    groupsWithItems.find(g => g.category === 'GPU') ||
    groupsWithItems[0];
  const bestItems = bestGroup?.items ?? [];
  let bestValue: AnalysisResult['bestValue'] = {
    category: 'No major upgrade needed',
    impactSummary: 'System balanced for chosen titles',
    reasons: ['Adjusting settings may yield better returns than new hardware'],
    options: undefined
  };
  let bestValueLocked = false;

  if (bestGroup && bestItems.length > 0) {
    if ((bestGroup.category === 'RAM' || bestGroup.category === 'GPU') && !ramConstrained && noMeaningfulGpu) {
      if (storageHelpful) {
        bestValue = {
          category: 'Storage',
          impactSummary: 'Faster loads + less traversal hitching',
          reasons: [
            `Best pick in budget: ${storagePick[0].name} ($${storagePick[0].price})`,
            'SSD upgrades are the most noticeable quality-of-life change.',
            'FPS gains are typically small, but load times improve.'
          ],
          options: undefined
        };
      } else {
        bestValue = {
          category: 'No cost-effective upgrade',
          impactSummary: 'No meaningful FPS gains within budget',
          reasons: [
            'Current GPU tier exceeds the budget for meaningful FPS gains.',
            'Consider saving for a GPU upgrade or lowering resolution/target.'
          ],
          options: undefined
        };
      }
      bestValueLocked = true;
    }
    if (!bestValueLocked) {
      const sorted =
        bestGroup.category === 'GPU'
          ? [...bestItems].sort((a, b) => (b.avgFpsGainPct ?? 0) - (a.avgFpsGainPct ?? 0))
          : [...bestItems];
      const valuePick =
        bestGroup.category === 'GPU'
          ? bestItems.find(item => (item.label ?? '').toLowerCase().includes('best value'))
          : undefined;
      const top = valuePick ?? sorted[0];
    const range = bestGroup.category === 'GPU' ? estimateRange(bestItems) : null;
    const reasons: string[] = [];
    let impactSummary = '';
    const gainValues = bestGroup.category === 'GPU'
      ? bestItems.map(item => item.avgFpsGainPct ?? 0).filter(v => v > 0)
      : [];
    const bestGain = gainValues.length > 0 ? Math.max(...gainValues) : 0;

    if (bestGroup.category === 'GPU') {
      if (top.avgFpsGainPct) {
        if (useRawPotentialLabel) {
          impactSummary = `${describeRawUplift(top.avgFpsGainPct)} (ineffective for ${input.resolution} @ ${input.refreshRate}Hz)`;
          reasons.push(`Raw GPU potential: ~+${top.avgFpsGainPct}%`);
        } else {
          impactSummary = `Estimated avg FPS gain: ~+${top.avgFpsGainPct}%`;
        }
      } else {
        if (useRawPotentialLabel) {
          impactSummary = `${describeRawUplift(bestGain)} (ineffective for ${input.resolution} @ ${input.refreshRate}Hz)`;
          if (range) {
            reasons.push(`Raw GPU potential: ${range}`);
          }
        } else {
          impactSummary = range ? `Estimated avg FPS gain: ${range}` : 'Estimated avg FPS gain varies by title.';
        }
      }
      reasons.push(`Best pick in budget: ${top.name} ($${top.price})`);
      reasons.push(
        verdictBoundType === 'TARGET_LIMITED'
          ? refreshLimitedShare >= 0.5
              ? 'Performance is capped by your display refresh in these titles.'
              : 'Performance is below your refresh target; GPU/CPU/engine limits dominate.'
            : baselineAgg.boundType === 'GPU_BOUND'
            ? 'GPU is the main limiter for your selected games.'
            : 'GPU gains are strong while CPU headroom remains.'
        );
        if (top.qualitativeBullets[0]) reasons.push(top.qualitativeBullets[0]);
      } else if (bestGroup.category === 'CPU') {
        impactSummary =
          baselineAgg.boundType === 'CPU_BOUND'
            ? 'Modest avg FPS gains in CPU-limited titles'
            : 'Better high-refresh headroom; modest avg FPS change';
        reasons.push(`Best pick in budget: ${top.name} ($${top.price})`);
        reasons.push('CPU upgrades help most when targeting high refresh or esports titles.');
      } else if (bestGroup.category === 'RAM') {
        impactSummary = 'Improves stability in modern titles; small avg FPS change';
        reasons.push(`Best pick in budget: ${top.name} ($${top.price})`);
        reasons.push('More RAM reduces paging in memory-heavy scenes.');
      } else if (bestGroup.category === 'Storage') {
        impactSummary = 'Faster loads + less traversal hitching';
        reasons.push(`Best pick in budget: ${top.name} ($${top.price})`);
        reasons.push('SSD upgrades are the most noticeable quality-of-life change.');
      } else if (bestGroup.category === 'Monitor') {
        impactSummary = 'Matches estimated FPS ceiling for consistent output';
        reasons.push(`Best pick in budget: ${top.name} ($${top.price})`);
        reasons.push('Higher refresh only helps when FPS can sustain it.');
      }

      bestValue = {
        category: bestGroup.category,
        impactSummary,
        reasons: reasons.slice(0, 3),
        options: gpuChoiceOptions ?? undefined
      };
    }
  }

  const warnings: string[] = [];
  if (baselineAgg.vramPressureAvg >= 60) {
    const { warnAt, okAt } = getVramTargets(input, selectedGames);
    const currentVram = gpu.vram;
    const recommendedVram = Math.max(
      0,
      ...(recommendedParts.find(p => p.category === 'GPU')?.items.map(item => GPU_MAP[item.id]?.vram ?? 0) ?? [])
    );

    if (currentVram < warnAt) {
      if (recommendedVram >= okAt) {
        warnings.push(
          `Your current GPU has ${currentVram}GB VRAM; recommended picks with ${okAt}GB+ should reduce texture limits at ${input.resolution}.`
        );
      } else {
        warnings.push(
          `At ${input.resolution}, ${warnAt}GB+ VRAM is recommended for higher textures; your GPU has ${currentVram}GB.`
        );
      }
    } else if (currentVram < okAt) {
      warnings.push(
        `At ${input.resolution}, ${okAt}GB+ VRAM is safer for high textures; ${currentVram}GB may require lowering settings in some titles.`
      );
    }
  }
  if (baselineAgg.stutterRiskAvg > 60 && input.storageType === 'HDD') {
    warnings.push('HDDs increase traversal stutter in streaming-heavy games; SSD recommended.');
  }
  const inferredType = resolveMemoryType(input, cpu);
  if (!cpuSupportsMemoryType(cpu, inferredType)) {
    warnings.push(
      `Memory type mismatch: ${cpu.name} supports ${cpu.memoryType}, but your RAM selection indicates ${inferredType}.`
    );
  }
  if (input.ramAmount === 8) {
    warnings.push('8GB RAM is below recommended; expect stutter in modern titles.');
  }
  if (input.resolution === '4K' && getGpuScore(gpu, input.resolution) < 70) {
    warnings.push('4K gaming is demanding; consider 1440p for more consistent frame rates.');
  }
  if (verdictBoundType === 'TARGET_LIMITED') {
    warnings.push('Your refresh target exceeds expected FPS; consider a lower refresh or resolution for consistency.');
  }
  if (input.budgetBucket === '$0-100') {
    warnings.push('Under $100: focus on RAM/SSD or save for a larger jump.');
  }

  const orderedUpgradePath = (() => {
    const preferred = bestValue.category;
    if (!['GPU', 'CPU', 'RAM', 'Storage', 'Monitor'].includes(preferred)) {
      return upgradePath;
    }
    const idx = upgradePath.findIndex(item => item.category === preferred);
    if (idx <= 0) return upgradePath;
    return [upgradePath[idx], ...upgradePath.slice(0, idx), ...upgradePath.slice(idx + 1)];
  })();

  return {
    verdict: {
      boundType: verdictBoundType,
      confidence: Number(verdictConfidence.toFixed(2)),
      headroomRatio: Number(headroomRatio.toFixed(2)),
      reasons: reasons.slice(0, 3),
      games: baselineAgg.perGame.map(g => ({
        name: g.game.name,
        boundType: g.boundType,
        headroomRatio: Number(g.headroomRatio.toFixed(2))
      }))
    },
    bestValue: {
      category: bestValue.category,
      impactSummary: bestValue.impactSummary,
      reasons: bestValue.reasons.slice(0, 3),
      options: bestValue.options
    },
    upgradePath: orderedUpgradePath,
    recommendedParts,
    warnings: [...fallbackWarnings, ...warnings]
  };
}
