import cpus from '@/data/cpus.json';
import gpus from '@/data/gpus.json';
import games from '@/data/games.json';
import monitors from '@/data/monitors.json';
import { AnalysisInput, AnalysisResult, BudgetBucket, Cpu, GameProfile, Gpu, Monitor } from './types';

const CPU_MAP: Record<string, Cpu> = Object.fromEntries((cpus as Cpu[]).map(c => [c.id, c]));
const GPU_MAP: Record<string, Gpu> = Object.fromEntries((gpus as Gpu[]).map(g => [g.id, g]));
const GAME_MAP: Record<string, GameProfile> = Object.fromEntries((games as GameProfile[]).map(g => [g.id, g]));
const MONITOR_MAP: Record<string, Monitor> = Object.fromEntries((monitors as Monitor[]).map(m => [m.id, m]));

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

const refreshBoost = (refresh: number) =>
  refresh >= 720
    ? 0.36
    : refresh >= 540
    ? 0.3
    : refresh >= 480
    ? 0.25
    : refresh >= 360
    ? 0.2
    : refresh >= 240
    ? 0.18
    : refresh >= 165
    ? 0.14
    : refresh >= 144
    ? 0.1
    : refresh >= 120
    ? 0.06
    : 0;

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
const clampGain = (v: number) => Math.max(0, Math.min(95, Math.round(v)));

const fpsGainFromScores = (current: number, next: number, weight = 1) => {
  const delta = next - current;
  if (delta <= 0) return 0;
  const ratio = delta / Math.max(40, current);
  const base = ratio * 100 * weight;
  return clampGain(base);
};

const resolutionFpsScale: Record<AnalysisInput['resolution'], number> = {
  '1080p': 1,
  '1440p': 0.72,
  '4K': 0.52
};

function estimateFps(cpuScore: number, gpuScore: number, input: AnalysisInput, gameProfiles: GameProfile[]) {
  const resScale = resolutionFpsScale[input.resolution];
  const refBoost = refreshBoost(input.refreshRate);
  const resBoostVal = resolutionBoost(input.resolution);

  if (gameProfiles.length === 0) return 0;

  const perGame = gameProfiles.map(game => {
    const baseTarget = game.type === 'esports' ? 280 : 140;
    let cpuW = game.cpuWeight + refBoost;
    let gpuW = game.gpuWeight + resBoostVal;
    const total = cpuW + gpuW;
    cpuW /= total;
    gpuW /= total;

    const cpuPerf = cpuScore * cpuW;
    const gpuPerf = gpuScore * gpuW * resScale;
    const bottleneckPerf = Math.min(cpuPerf, gpuPerf);
    const fps = (bottleneckPerf / 80) * baseTarget;
    return fps;
  });

  const avgFps = perGame.reduce((a, b) => a + b, 0) / perGame.length;
  const effective = Math.min(avgFps, input.refreshRate + 10);
  return { raw: avgFps, effective };
}

function suggestParts(category: 'CPU' | 'GPU', input: AnalysisInput, cpu: Cpu, gpu: Gpu, gamesProfiles: GameProfile[]) {
  const limit = budgetLimit[input.budgetBucket];
  const targetGain = category === 'CPU' ? 12 : 15;

  if (category === 'CPU') {
    const currentScore = cpu.score;
    const candidates = (cpus as Cpu[])
      .filter(c => c.score > currentScore + targetGain)
      .sort((a, b) => (b.score - currentScore) / b.price - (a.score - currentScore) / a.price);

    const withinBudget = candidates.filter(c => c.price <= limit);
    const shortlist = (withinBudget.length > 0 ? withinBudget : candidates).slice(0, 3);
    const baseline = estimateFps(cpu.score, relevantGpuScore(gpu, input.resolution), input, gamesProfiles);
    return shortlist.map(c => ({
      id: c.id,
      name: c.name,
      score: c.score,
      price: c.price,
      reason: `~+${c.score - currentScore} CPU score for ${formatPrice(c.price)}`,
      percentGain: (() => {
        const upgraded = estimateFps(c.score, relevantGpuScore(gpu, input.resolution), input, gamesProfiles);
        const gain = baseline.raw > 0 ? ((upgraded.raw - baseline.raw) / baseline.raw) * 100 : 0;
        const cappedGain = baseline.effective > 0 ? ((upgraded.effective - baseline.effective) / baseline.effective) * 100 : gain;
        return clampGain(Math.max(gain * 0.8, cappedGain));
      })(),
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
  const baseline = estimateFps(cpu.score, currentGpuScore, input, gamesProfiles);
  return shortlist.map(g => ({
    id: g.id,
    name: g.name,
    score: relevantGpuScore(g, input.resolution),
    price: g.price,
    reason: `~+${relevantGpuScore(g, input.resolution) - currentGpuScore} GPU score for ${formatPrice(g.price)}`,
    percentGain: (() => {
      const upgraded = estimateFps(cpu.score, relevantGpuScore(g, input.resolution), input, gamesProfiles);
      const gain = baseline.raw > 0 ? ((upgraded.raw - baseline.raw) / baseline.raw) * 100 : 0;
      const cappedGain = baseline.effective > 0 ? ((upgraded.effective - baseline.effective) / baseline.effective) * 100 : gain;
      return clampGain(Math.max(gain * 0.8, cappedGain));
    })(),
    compatibilityNote: undefined
  }));
}

function suggestRam(input: AnalysisInput) {
  const kits = [
    { id: 'ram-16-3200', name: '16GB (2x8) DDR4-3200', price: 50, capacity: 16, type: 'DDR4' as const },
    { id: 'ram-32-3600', name: '32GB (2x16) DDR4-3600', price: 90, capacity: 32, type: 'DDR4' as const },
    { id: 'ram-32-6000', name: '32GB (2x16) DDR5-6000', price: 120, capacity: 32, type: 'DDR5' as const }
  ];
  const needMore = input.ramAmount < 16 ? 16 : input.ramAmount < 32 ? 32 : 0;
  const matches = kits
    .filter(k => (needMore ? k.capacity >= needMore : true))
    .filter(k => input.ramSpeed.includes('DDR5') ? k.type === 'DDR5' : true);
  return (matches.length ? matches : kits).slice(0, 2).map(k => ({
    id: k.id,
    name: k.name,
    price: k.price,
    reason: needMore ? `Jump to ${k.capacity}GB for smoother modern titles` : 'Faster RAM helps 1% lows',
    percentGain: needMore ? (k.capacity >= 32 ? 12 : 8) : 4
  }));
}

function suggestStorage(input: AnalysisInput) {
  const options = [
    { id: 'ssd-sata-1tb', name: '1TB SATA SSD', price: 55, type: 'SATA SSD' },
    { id: 'ssd-nvme-1tb', name: '1TB NVMe Gen3', price: 75, type: 'NVMe' },
    { id: 'ssd-nvme4-1tb', name: '1TB NVMe Gen4', price: 95, type: 'NVMe' }
  ];
  const filtered = options.filter(o => (input.storageType === 'HDD' ? true : o.type === 'NVMe'));
  const picks = (filtered.length ? filtered : options).slice(0, 2);
  return picks.map(o => ({
    id: o.id,
    name: o.name,
    price: o.price,
    reason: o.type === 'NVMe' ? 'NVMe = best load times and responsiveness' : 'SSD removes HDD hitching',
    percentGain: o.type === 'NVMe' ? 0 : 0
  }));
}

function suggestMonitor(input: AnalysisInput, gpu: Gpu) {
  const gpuScore = relevantGpuScore(gpu, input.resolution);
  const limit = budgetLimit[input.budgetBucket];
  const catalog = monitors as Monitor[];

  // Define target tiers by GPU strength
  const target = (() => {
    if (gpuScore >= 100) return { resolution: '4K' as const, refresh: 240 };
    if (gpuScore >= 95) return { resolution: '4K' as const, refresh: 165 };
    if (gpuScore >= 90) return { resolution: '4K' as const, refresh: 144 };
    if (gpuScore >= 85) return { resolution: '1440p' as const, refresh: 360 };
    if (gpuScore >= 75) return { resolution: '1440p' as const, refresh: 240 };
    if (gpuScore >= 65) return { resolution: '1440p' as const, refresh: 165 };
    if (gpuScore >= 55) return { resolution: '1080p' as const, refresh: 240 };
    return { resolution: '1080p' as const, refresh: 144 };
  })();

  // Include premium picks even if over budget for high-end GPUs
  const premium = gpuScore >= 95;
  const candidates = catalog.filter(m => premium || m.price <= limit * 1.25);

  const scored = candidates
    .map(m => {
      const resMatch = m.resolution === target.resolution ? 1 : 0.4;
      const refreshRatio = Math.min(m.refresh / target.refresh, 1.2);
      const refreshMatch = refreshRatio >= 1 ? 1 : refreshRatio * 0.8;
      const score = resMatch * 0.6 + refreshMatch * 0.4;
      return { ...m, score };
    })
    .sort((a, b) => b.score - a.score || b.refresh - a.refresh || a.price - b.price)
    .slice(0, 3)
    .map(m => ({
      id: m.id,
      name: m.name,
      price: m.price,
      reason: `${m.resolution} @ ${m.refresh}Hz pairs well with your GPU${premium ? ' (premium match)' : ''}`
    }));

  return scored;
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
    { category: 'CPU', items: suggestParts('CPU', input, cpu, gpu, selectedGames) },
    { category: 'GPU', items: suggestParts('GPU', input, cpu, gpu, selectedGames) },
    { category: 'RAM', items: suggestRam(input) },
    { category: 'Storage', items: suggestStorage(input) },
    { category: 'Monitor', items: suggestMonitor(input, gpu) }
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
    warnings: [...fallbackWarnings, ...warnings]
  };
}
