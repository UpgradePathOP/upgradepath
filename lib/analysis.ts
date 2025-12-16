import cpus from '@/data/cpus.json';
import gpus from '@/data/gpus.json';
import games from '@/data/games.json';
import { AnalysisInput, AnalysisResult, BudgetBucket, Cpu, GameProfile, Gpu } from './types';

const CPU_MAP: Record<string, Cpu> = Object.fromEntries((cpus as Cpu[]).map(c => [c.id, c]));
const GPU_MAP: Record<string, Gpu> = Object.fromEntries((gpus as Gpu[]).map(g => [g.id, g]));
const GAME_MAP: Record<string, GameProfile> = Object.fromEntries((games as GameProfile[]).map(g => [g.id, g]));

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const getGpuScore = (gpu: Gpu, resolution: AnalysisInput['resolution']) => {
  if (resolution === '4K') return gpu.score4k;
  if (resolution === '1440p') return gpu.score1440;
  return gpu.score1080;
};

const ramScore = (amount: number, speed: string) => {
  const base = amount >= 64 ? 95 : amount >= 32 ? 88 : amount >= 16 ? 72 : amount >= 12 ? 55 : 35;
  const speedBonus = speed.includes('DDR5')
    ? 10
    : speed.includes('6000')
    ? 8
    : speed.includes('5200')
    ? 6
    : speed.includes('3600')
    ? 4
    : speed.includes('3200')
    ? 2
    : 0;
  return clamp(base + speedBonus, 0, 100);
};

const storageScore = (storage: AnalysisInput['storageType']) =>
  storage === 'NVMe' ? 92 : storage === 'SATA SSD' ? 70 : 25;

const requiredGpuScore = (resolution: AnalysisInput['resolution']) =>
  resolution === '4K' ? 85 : resolution === '1440p' ? 70 : 55;

const resolutionBoost = (resolution: AnalysisInput['resolution']) =>
  resolution === '4K' ? 0.22 : resolution === '1440p' ? 0.12 : 0;

const refreshBoost = (refresh: number) => (refresh >= 240 ? 0.18 : refresh >= 165 ? 0.14 : refresh >= 144 ? 0.1 : refresh >= 120 ? 0.06 : 0);

const budgetLimit: Record<BudgetBucket, number> = {
  '$0-100': 100,
  '$100-250': 250,
  '$250-400': 400,
  '$400-700': 700,
  '$700-1200': 1200,
  '$1200+': 2400
};

const relevantGpuScore = (gpu: Gpu, res: AnalysisInput['resolution']) =>
  res === '4K' ? gpu.score4k : res === '1440p' ? gpu.score1440 : gpu.score1080;

const formatPrice = (value: number) => `$${value}`;

function suggestParts(category: 'CPU' | 'GPU', input: AnalysisInput, cpu: Cpu, gpu: Gpu) {
  const limit = budgetLimit[input.budgetBucket];
  const targetGain = category === 'CPU' ? 12 : 15;

  if (category === 'CPU') {
    const currentScore = cpu.score;
    const candidates = (cpus as Cpu[])
      .filter(c => c.score > currentScore + targetGain)
      .sort((a, b) => (b.score - currentScore) / b.price - (a.score - currentScore) / a.price);

    const withinBudget = candidates.filter(c => c.price <= limit);
    const shortlist = (withinBudget.length > 0 ? withinBudget : candidates).slice(0, 3);
    return shortlist.map(c => ({
      id: c.id,
      name: c.name,
      score: c.score,
      price: c.price,
      reason: `~+${c.score - currentScore} CPU score for ${formatPrice(c.price)}`,
      compatibilityNote:
        c.socket !== cpu.socket
          ? `Requires ${c.socket} motherboard (current: ${cpu.socket})`
          : c.memoryType !== cpu.memoryType
          ? `New board likely needed (DDR type: ${c.memoryType})`
          : undefined
    }));
  }

  const currentGpuScore = relevantGpuScore(gpu, input.resolution);
  const candidates = (gpus as Gpu[])
    .filter(g => relevantGpuScore(g, input.resolution) > currentGpuScore + targetGain)
    .sort((a, b) => (relevantGpuScore(b, input.resolution) - currentGpuScore) / b.price - (relevantGpuScore(a, input.resolution) - currentGpuScore) / a.price);

  const withinBudget = candidates.filter(g => g.price <= limit);
  const shortlist = (withinBudget.length > 0 ? withinBudget : candidates).slice(0, 3);
  return shortlist.map(g => ({
    id: g.id,
    name: g.name,
    score: relevantGpuScore(g, input.resolution),
    price: g.price,
    reason: `~+${relevantGpuScore(g, input.resolution) - currentGpuScore} GPU score for ${formatPrice(g.price)}`,
    compatibilityNote: undefined
  }));
}

export function analyzeSystem(input: AnalysisInput): AnalysisResult {
  const cpu = CPU_MAP[input.cpuId];
  const gpu = GPU_MAP[input.gpuId];
  if (!cpu || !gpu) {
    throw new Error('Invalid CPU or GPU selection.');
  }
  const selectedGames = input.games.map(id => GAME_MAP[id]).filter(Boolean);
  if (selectedGames.length === 0) {
    throw new Error('Select at least one game.');
  }

  const gpuScore = getGpuScore(gpu, input.resolution);
  const ram = ramScore(input.ramAmount, input.ramSpeed);
  const storage = storageScore(input.storageType);
  const resBoost = resolutionBoost(input.resolution);
  const refBoost = refreshBoost(input.refreshRate);

  const perGame = selectedGames.map(game => {
    let cpuW = game.cpuWeight + (game.targetFPS === 'high' ? refBoost : refBoost * 0.6);
    let gpuW = game.gpuWeight + resBoost;
    if (game.type === 'esports' && input.refreshRate >= 144) cpuW += 0.05;
    if (game.type === 'aaa' && input.resolution !== '1080p') gpuW += 0.05;

    const total = cpuW + gpuW;
    cpuW /= total;
    gpuW /= total;

    const reqCpu = game.type === 'esports'
      ? (input.refreshRate >= 144 ? 78 : 68)
      : input.refreshRate >= 144
      ? 72
      : 66;
    const reqGpu = requiredGpuScore(input.resolution) + (game.vramHeavy ? 5 : 0);

    const cpuDeficitRaw = clamp(reqCpu - cpu.score, 0, 100);
    const gpuDeficitRaw = clamp(reqGpu - gpuScore, 0, 100);
    const weightedCpuDef = cpuDeficitRaw * cpuW;
    const weightedGpuDef = gpuDeficitRaw * gpuW;

    let limitation: 'CPU' | 'GPU' | 'MIXED' = 'MIXED';
    if (weightedCpuDef > weightedGpuDef * 1.2) limitation = 'CPU';
    else if (weightedGpuDef > weightedCpuDef * 1.2) limitation = 'GPU';

    const confidence = clamp(Math.abs(weightedCpuDef - weightedGpuDef) * 1.8 + 40, 50, 95);

    return {
      game,
      limitation,
      cpuW,
      gpuW,
      cpuDeficit: weightedCpuDef,
      gpuDeficit: weightedGpuDef,
      confidence
    };
  });

  const cpuLimited = perGame.filter(g => g.limitation === 'CPU').length;
  const gpuLimited = perGame.filter(g => g.limitation === 'GPU').length;
  const mixed = perGame.length - cpuLimited - gpuLimited;

  let verdictType: 'CPU' | 'GPU' | 'MIXED' = 'MIXED';
  if (cpuLimited > gpuLimited && cpuLimited > mixed) verdictType = 'CPU';
  else if (gpuLimited > cpuLimited && gpuLimited > mixed) verdictType = 'GPU';

  const dominance = Math.max(cpuLimited, gpuLimited, mixed);
  const confidence = verdictType === 'MIXED'
    ? 60
    : clamp(55 + (dominance / perGame.length) * 40, 55, 95);

  const reasons: string[] = [];
  if (verdictType === 'CPU') {
    reasons.push(`${cpuLimited}/${perGame.length} games show CPU headroom issues`);
    if (input.refreshRate >= 144) reasons.push(`High refresh (${input.refreshRate}Hz) amplifies CPU demand`);
    if (cpu.score < 70) reasons.push(`CPU score ${cpu.score} below recommended ${Math.round(perGame.length > 0 ? 70 : 0)}`);
  } else if (verdictType === 'GPU') {
    reasons.push(`${gpuLimited}/${perGame.length} games stress the GPU first`);
    if (input.resolution !== '1080p') reasons.push(`${input.resolution} shifts load toward GPU`);
    if (gpuScore < requiredGpuScore(input.resolution)) reasons.push(`GPU score ${gpuScore} trails target ${requiredGpuScore(input.resolution)}`);
  } else {
    reasons.push('Workload varies by title; neither component dominates');
    reasons.push('Resolution and refresh tradeoffs balance CPU/GPU demand');
    reasons.push('Fine-tuning settings may yield better returns than hardware');
  }

  const cpuDeficitAvg = perGame.reduce((s, g) => s + g.cpuDeficit, 0) / perGame.length;
  const gpuDeficitAvg = perGame.reduce((s, g) => s + g.gpuDeficit, 0) / perGame.length;
  const ramDeficit = clamp(72 - ram, 0, 60);
  const storageDeficit = clamp(70 - storage, 0, 60);

  const upgrades = [
    { category: 'CPU', priority: cpuDeficitAvg, reasonHint: cpuDeficitAvg > gpuDeficitAvg },
    { category: 'GPU', priority: gpuDeficitAvg, reasonHint: gpuDeficitAvg > cpuDeficitAvg },
    { category: 'RAM', priority: ramDeficit * (input.ramAmount < 16 ? 1.4 : 1) },
    { category: 'Storage', priority: storageDeficit * 0.6 }
  ];

  // Budget realism scaling
  const budgetScale =
    input.budgetBucket === '$0-100'
      ? 0.6
      : input.budgetBucket === '$100-250'
      ? 0.8
      : input.budgetBucket === '$250-400'
      ? 1
      : input.budgetBucket === '$400-700'
      ? 1.1
      : 1.2;
  upgrades.forEach(u => {
    if (u.category === 'GPU' && input.resolution !== '1080p') u.priority *= 1.15;
    if (u.category === 'CPU' && input.refreshRate >= 144) u.priority *= 1.1;
    u.priority *= budgetScale;
  });

  upgrades.sort((a, b) => b.priority - a.priority);
  const upgradePath = upgrades
    .filter(u => u.priority > 8)
    .map(u => {
      const reasons: string[] = [];
      let estimatedImpact = '';
      if (u.category === 'CPU') {
        estimatedImpact = cpu.score < 65 ? '+25-45% FPS (CPU-bound titles)' : '+10-20% FPS';
        reasons.push('CPU deficits dominate several selected games');
        if (input.refreshRate >= 144) reasons.push(`High refresh targets require faster CPU (${input.refreshRate}Hz)`);
        reasons.push(`Aim for CPU score ~${Math.min(98, cpu.score + 20)}+`);
      } else if (u.category === 'GPU') {
        estimatedImpact = gpuScore < 60 ? '+35-60% FPS (GPU-bound)' : '+15-35% FPS';
        reasons.push(`${input.resolution} pushes GPU harder than CPU`);
        if (selectedGames.some(g => g.vramHeavy) && gpu.vram < 12)
          reasons.push('Several titles prefer 12GB+ VRAM');
        reasons.push(`Aim for GPU tier built for ${input.resolution}`);
      } else if (u.category === 'RAM') {
        estimatedImpact = input.ramAmount < 12 ? '+10-20% stability' : '+5-10% 1% lows';
        if (input.ramAmount < 16) reasons.push('16GB is modern baseline; under-provisioned today');
        if (!input.ramSpeed.includes('DDR5') && !input.ramSpeed.includes('3600'))
          reasons.push('Faster RAM helps CPU-limited scenarios');
      } else if (u.category === 'Storage') {
        estimatedImpact = 'Faster loads + snappier feel';
        if (input.storageType === 'HDD') reasons.push('HDD is slow for modern titles; NVMe is 5-10x faster');
        reasons.push('Minimal FPS uplift; quality-of-life upgrade');
      }
      return {
        category: u.category,
        priority: Math.round(u.priority),
        estimatedImpact,
        reasons
      };
    });

  const best = upgradePath[0] ?? {
    category: 'No major upgrade needed',
    priority: 0,
    estimatedImpact: 'System balanced for chosen titles',
    reasons: ['Tweaking settings may be higher ROI than hardware changes']
  };

  const warnings: string[] = [];
  if (gpu.vram < 8 && selectedGames.some(g => g.vramHeavy)) {
    warnings.push('VRAM under 8GB may force lower textures in VRAM-heavy games.');
  }
  if (gpuScore > 88 && input.resolution === '1080p' && input.refreshRate <= 120) {
    warnings.push('GPU headroom unused at 1080p/120Hz; consider higher refresh or 1440p.');
  }
  if (cpu.score > 85 && gpuScore < 60) {
    warnings.push('Strong CPU + modest GPU; GPU upgrade is best value.');
  }
  if (gpuScore > 85 && cpu.score < 65) {
    warnings.push('GPU outpaces CPU; CPU upgrade unlocks more frames.');
  }
  if (input.ramAmount === 8) {
    warnings.push('8GB RAM is below recommended; expect stutter in modern titles.');
  }
  if (input.storageType === 'HDD') {
    warnings.push('HDD bottlenecks load times; SSD recommended.');
  }
  if (input.budgetBucket === '$0-100') {
    warnings.push('Under $100: focus on RAM/SSD or save for a larger jump.');
  }
  if (input.resolution === '4K' && gpuScore < 80) {
    warnings.push('4K gaming wants top-tier GPUs; consider 1440p for better smoothness.');
  }

  const recommendedParts: AnalysisResult['recommendedParts'] = [
    { category: 'CPU', items: suggestParts('CPU', input, cpu, gpu) },
    { category: 'GPU', items: suggestParts('GPU', input, cpu, gpu) }
  ];

  // Motherboard/RAM warning if any CPU recommendation changes socket or memory type
  const cpuRecs = recommendedParts[0]?.items ?? [];
  const needsBoard = cpuRecs.some(item => {
    const note = (item as any).compatibilityNote as string | undefined;
    return typeof note === 'string' ? note.toLowerCase().includes('motherboard') : false;
  });
  const needsRam = cpuRecs.some(item => {
    const note = (item as any).compatibilityNote as string | undefined;
    return typeof note === 'string' ? note.toLowerCase().includes('ddr') : false;
  });
  if (needsBoard) warnings.push('CPU upgrade picks require a new motherboard (socket change).');
  if (needsRam) warnings.push('CPU upgrade picks may need DDR5 RAM and a matching board.');

  return {
    verdict: {
      type: verdictType,
      confidence: Math.round(confidence),
      reasons: reasons.slice(0, 3)
    },
    bestValue: {
      category: best.category,
      estimatedImpact: best.estimatedImpact,
      reasons: best.reasons.slice(0, 3)
    },
    upgradePath,
    recommendedParts,
    warnings
  };
}
