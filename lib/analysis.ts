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

const resolveWeights = (game: GameProfile) => {
  const cpu = clamp(game.cpuWeight ?? 0.5, 0.2, 0.8);
  const gpu = clamp(game.gpuWeight ?? 0.5, 0.2, 0.8);
  return { cpu, gpu };
};

const refreshInfluence = (
  refreshRate: number,
  gpuFps: number,
  category: GameCategory,
  targetFps: GameProfile['targetFPS']
) => {
  if (!Number.isFinite(gpuFps) || refreshRate <= 60) return 0;
  const ratio = gpuFps / Math.max(refreshRate, 1);
  const normalized = clamp((ratio - 0.7) / 0.5, 0, 1);
  const focus = category === 'ESPORTS' || targetFps === 'high' ? 1 : targetFps === 'medium' ? 0.5 : 0.25;
  return normalized * focus;
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

function lookupCuratedFps(gpuId: string, gameId: string, resolution: Resolution, quality: QualitySetting) {
  const fps = CURATED_FPS?.fps?.[quality]?.[resolution]?.[gpuId]?.[gameId];
  return typeof fps === 'number' ? fps : null;
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
  fpsTypical: number;
  effectiveFps: number;
  stutterRisk: number;
  vramPressure: number;
  hasBenchmark: boolean;
  gpuIndexValue: number;
};

type FpsReference = {
  fpsTypical: number;
  gpuIndexValue: number;
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
  const gpuIndexValue =
    gpuIndex(gpuScore) /
    (RES_DEMAND[input.resolution] * (0.6 + weights.gpu) * (typicalBound === 'GPU_HEAVY' ? 1.08 : 1));

  const quality: QualitySetting = category === 'ESPORTS' ? 'low' : 'ultra';
  const curated = lookupCuratedFps(gpu.id, game.id, input.resolution, quality);
  const baseFps = CATEGORY_BASE_FPS[category] * RES_SCALE[input.resolution];
  let gpuFps = curated ?? baseFps * gpuIndex(getGpuScore(gpu, input.resolution));

  if (curated === null && reference && reference.gpuIndexValue > 0) {
    const ratio = gpuIndex(getGpuScore(gpu, input.resolution)) / reference.gpuIndexValue;
    gpuFps = reference.fpsTypical * ratio;
  }

  const refreshScale = refreshDemand(input.refreshRate);
  const refreshWeight = refreshInfluence(input.refreshRate, gpuFps, category, game.targetFPS);
  const refreshPenalty = 1 + (refreshScale - 1) * refreshWeight;

  const cpuThroughputBase =
    (cpuIndex(cpu.score) * CPU_CAP_TUNE[category]) /
    ((0.6 + weights.cpu) * (typicalBound === 'CPU_HEAVY' ? 1.08 : 1));
  const cpuThroughput = cpuThroughputBase / refreshPenalty;
  const headroomRatio = cpuThroughput / gpuIndexValue;
  const boundType = classifyHeadroom(headroomRatio);
  const confidence = bottleneckConfidence(headroomRatio, typicalBound, boundType);

  const fpsTypical = headroomRatio < 1 ? gpuFps * headroomRatio : gpuFps;
  const refreshCap = input.refreshRate > 0 ? input.refreshRate * 1.05 : Infinity;
  const effectiveFps = Math.min(fpsTypical, refreshCap);

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
    fpsTypical,
    effectiveFps,
    stutterRisk,
    vramPressure,
    hasBenchmark: curated !== null,
    gpuIndexValue: gpuIndex(getGpuScore(gpu, input.resolution))
  };
}

type AggregateMetrics = {
  perGame: GameMetrics[];
  headroomRatio: number;
  boundType: BottleneckType;
  confidence: number;
  fpsTypicalAvg: number;
  effectiveFpsAvg: number;
  stutterRiskAvg: number;
  vramPressureAvg: number;
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

  const fpsTypicalAvg = perGame.reduce((s, g) => s + g.fpsTypical, 0) / perGame.length;
  const effectiveFpsAvg = perGame.reduce((s, g) => s + g.effectiveFps, 0) / perGame.length;
  const stutterRiskAvg = perGame.reduce((s, g) => s + g.stutterRisk, 0) / perGame.length;
  const vramPressureAvg = perGame.reduce((s, g) => s + g.vramPressure, 0) / perGame.length;
  const benchmarkCoverage =
    perGame.length > 0 ? perGame.filter(g => g.hasBenchmark).length / perGame.length : 0;

  return {
    perGame,
    headroomRatio,
    boundType,
    confidence,
    fpsTypicalAvg,
    effectiveFpsAvg,
    stutterRiskAvg,
    vramPressureAvg,
    benchmarkCoverage
  };
}

const calcAvgFpsGainPct = (baseline: AggregateMetrics, candidate: AggregateMetrics) => {
  const base = baseline.fpsTypicalAvg;
  const next = candidate.fpsTypicalAvg;
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

function suggestParts(
  category: 'CPU' | 'GPU',
  input: AnalysisInput,
  cpu: Cpu,
  gpu: Gpu,
  gamesProfiles: GameProfile[],
  baseline: AggregateMetrics,
  referenceMap: Record<string, FpsReference>
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

  const rawCurrentGpuScore = getGpuScore(gpu, input.resolution);
  const currentGpuScore = Number.isFinite(rawCurrentGpuScore) ? rawCurrentGpuScore : 0;
  const gpuHeavyCount = gamesProfiles.filter(g => resolveTypicalBound(g) === 'GPU_HEAVY').length;
  const baseList = (gpus as Gpu[]).filter(g => g.price <= limit);
  let filtered = baseList.filter(g => getGpuScore(g, input.resolution) > currentGpuScore + targetGain);
  if (filtered.length === 0) {
    filtered = baseList.filter(g => g.id !== gpu.id);
  }
  const candidates = filtered.map(g => {
    const candidateAgg = aggregateMetrics(cpu, g, input, gamesProfiles, referenceMap);
    const avgGain = Math.max(0, Math.round(calcAvgFpsGainPct(baseline, candidateAgg)));
    const utilityGain = Math.max(0, Math.round(calcUtilityGainPct(baseline, candidateAgg)));
    const rawScore = getGpuScore(g, input.resolution);
    const estimated = candidateAgg.benchmarkCoverage < 0.5;
    const isCuratedGpu = CURATED_GPU_IDS.has(g.id);
    return {
      gpu: g,
      avgGain,
      utilityGain,
      rawScore,
      estimated,
      isCuratedGpu,
      effectiveFps: candidateAgg.effectiveFpsAvg,
      valueScore: utilityGain / Math.max(g.price, 1),
      balanceScore: utilityGain / Math.sqrt(Math.max(g.price, 1))
    };
  });

  if (candidates.length === 0) return [];

  const curatedCandidates = candidates.filter(c => c.isCuratedGpu);
  const curatedPool = curatedCandidates.length ? curatedCandidates : candidates;
  const validated = curatedPool.filter(c => !c.estimated);
  const valuePool = validated.length ? validated : curatedPool;
  const byValue = [...valuePool].sort((a, b) => b.valueScore - a.valueScore);
  const byPerf = [...curatedPool].sort((a, b) => b.rawScore - a.rawScore || b.avgGain - a.avgGain);
  const byBalanced = [...valuePool].sort((a, b) => b.balanceScore - a.balanceScore);

  const used = new Set<string>();
  const pickUnique = (list: typeof candidates) => list.find(item => !used.has(item.gpu.id)) ?? list[0];
  const picks: Array<{ label: string; candidate: (typeof candidates)[number] }> = [];
  const addPick = (label: string, list: typeof candidates) => {
    const pick = pickUnique(list);
    if (!pick) return;
    used.add(pick.gpu.id);
    picks.push({ label, candidate: pick });
  };

  const bestPerf = byPerf[0];
  if (bestPerf) {
    used.add(bestPerf.gpu.id);
    picks.push({ label: 'Best performance', candidate: bestPerf });
  }
  addPick('Best value', byValue);
  addPick('Balanced', byBalanced);

  const labelOrder = ['Best value', 'Best performance', 'Balanced'];
  picks.sort((a, b) => labelOrder.indexOf(a.label) - labelOrder.indexOf(b.label));

  return picks.map(({ label, candidate }): PartPick => {
    const g = candidate.gpu;
    const isUnvalidated = !candidate.isCuratedGpu;
    const avgFpsGainPct = candidate.isCuratedGpu ? candidate.avgGain : undefined;
    const bullets: string[] = [];
    if (candidate.estimated || isUnvalidated) {
      bullets.push('Estimated performance; limited benchmark coverage.');
    }
    if (baseline.boundType === 'GPU_BOUND') {
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
      estimated: candidate.estimated || isUnvalidated,
      qualitativeBullets: bullets.slice(0, 2),
      notes: []
    };
  });
}

function suggestRam(input: AnalysisInput, cpu: Cpu): PartPick[] {
  const kits = [
    { id: 'ram-16-3200', name: '16GB (2x8) DDR4-3200', price: 50, capacity: 16, type: 'DDR4' as const },
    { id: 'ram-32-3600', name: '32GB (2x16) DDR4-3600', price: 90, capacity: 32, type: 'DDR4' as const },
    { id: 'ram-32-6000', name: '32GB (2x16) DDR5-6000', price: 120, capacity: 32, type: 'DDR5' as const }
  ];
  const needMore = input.ramAmount < 16 ? 16 : input.ramAmount < 32 ? 32 : 0;
  const budgetLimitVal = budgetLimit[input.budgetBucket];
  const matches = kits
    .filter(k => (needMore ? k.capacity >= needMore : true))
    .filter(k => k.type === cpu.memoryType)
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
    baselineAgg.perGame.map(g => [g.game.id, { fpsTypical: g.fpsTypical, gpuIndexValue: g.gpuIndexValue }])
  );

  const reasons: string[] = [];
  const headroomRatio = baselineAgg.headroomRatio;
  if (baselineAgg.boundType === 'CPU_BOUND') {
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

  if (baselineAgg.benchmarkCoverage > 0 && baselineAgg.benchmarkCoverage < 1) {
    const count = Math.round(baselineAgg.benchmarkCoverage * selectedGames.length);
    reasons.push(`Benchmark coverage: ${count}/${selectedGames.length} games (others estimated)`);
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
    { category: 'CPU', items: suggestParts('CPU', input, cpu, gpu, selectedGames, baselineAgg, referenceMap) },
    { category: 'GPU', items: suggestParts('GPU', input, cpu, gpu, selectedGames, baselineAgg, referenceMap) },
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
    const top = gains[0];
    const next = gains[1];
    if (next && next !== top) {
      const min = Math.min(top, next);
      const max = Math.max(top, next);
      return `~+${min}-${max}%`;
    }
    return `~+${top}%`;
  };

  const upgradePath = upgrades
    .filter(u => u.priority > 6)
    .map(u => {
      const reasons: string[] = [];
      let impactSummary = '';
      if (u.category === 'CPU') {
        impactSummary =
          baselineAgg.boundType === 'CPU_BOUND'
            ? 'Modest avg FPS gains in CPU-limited titles'
            : 'Better high-refresh headroom; modest avg FPS change';
        reasons.push('CPU headroom trails GPU throughput.');
        if (input.refreshRate >= 144) {
          reasons.push(`High refresh targets benefit from faster CPU.`);
        }
      } else if (u.category === 'GPU') {
        const gpuRange = estimateRange(recommendedParts.find(p => p.category === 'GPU')?.items ?? []);
        impactSummary = gpuRange
          ? `Estimated avg FPS gain: ${gpuRange}`
          : 'Estimated avg FPS gain varies by title.';
        reasons.push('GPU is the dominant limiter for your selection.');
        if (selectedGames.some(g => g.vramHeaviness === 'HIGH') && gpu.vram < 8) {
          reasons.push('Some modern games can exceed 6GB VRAM at high textures; 8GB helps at 1080p.');
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
            ? `${item.estimated ? 'Estimated ' : ''}~+${item.avgFpsGainPct}% avg FPS`
            : 'Estimated impact (limited data)',
          estimated: item.estimated ?? item.avgFpsGainPct === undefined
        }))
      : null;
  const groupsWithItems = recommendedParts.filter(group => group.items.length > 0);
  const topCategory = upgradePath[0]?.category;
  const bestGroup =
    (topCategory && groupsWithItems.find(g => g.category === topCategory)) ||
    groupsWithItems.find(g => g.category === 'GPU') ||
    groupsWithItems[0];
  const bestItems = bestGroup?.items ?? [];
  let bestValue = {
    category: 'No major upgrade needed',
    impactSummary: 'System balanced for chosen titles',
    reasons: ['Adjusting settings may yield better returns than new hardware']
  };

  if (bestGroup && bestItems.length > 0) {
    const sorted =
      bestGroup.category === 'GPU'
        ? [...bestItems].sort((a, b) => (b.avgFpsGainPct ?? 0) - (a.avgFpsGainPct ?? 0))
        : [...bestItems];
    const valuePick =
      bestGroup.category === 'GPU'
        ? bestItems.find(item => (item.label ?? '').toLowerCase() === 'best value')
        : undefined;
    const top = valuePick ?? sorted[0];
    const range = bestGroup.category === 'GPU' ? estimateRange(bestItems) : null;
    const reasons: string[] = [];
    let impactSummary = '';

    if (bestGroup.category === 'GPU') {
      impactSummary = range ? `Estimated avg FPS gain: ${range}` : 'Estimated avg FPS gain varies by title.';
      reasons.push(`Best pick in budget: ${top.name} ($${top.price})`);
      reasons.push(
        baselineAgg.boundType === 'GPU_BOUND'
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

  const warnings: string[] = [];
  if (baselineAgg.vramPressureAvg >= 60) {
    warnings.push('Some modern games can exceed 6GB VRAM at high textures; 8GB helps at 1080p.');
  }
  if (baselineAgg.stutterRiskAvg > 60 && input.storageType === 'HDD') {
    warnings.push('HDDs increase traversal stutter in streaming-heavy games; SSD recommended.');
  }
  if (input.ramAmount === 8) {
    warnings.push('8GB RAM is below recommended; expect stutter in modern titles.');
  }
  if (input.resolution === '4K' && getGpuScore(gpu, input.resolution) < 70) {
    warnings.push('4K gaming is demanding; consider 1440p for more consistent frame rates.');
  }
  if (input.budgetBucket === '$0-100') {
    warnings.push('Under $100: focus on RAM/SSD or save for a larger jump.');
  }

  return {
    verdict: {
      boundType: baselineAgg.boundType,
      confidence: Number(baselineAgg.confidence.toFixed(2)),
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
    upgradePath,
    recommendedParts,
    warnings: [...fallbackWarnings, ...warnings]
  };
}
