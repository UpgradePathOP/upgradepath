import { analyzeSystem } from '@/lib/analysis';
import cpus from '@/data/cpus.json';
import gpus from '@/data/gpus.json';

const cpu = (id: string) => cpus.find(c => c.id === id)!.id;
const gpu = (id: string) => gpus.find(g => g.id === id)!.id;

describe('UpgradePath rules engine', () => {
  it('flags GPU-bound for modern AAA/UE5-like workloads', () => {
    const res = analyzeSystem({
      cpuId: cpu('i7-11700k'),
      gpuId: gpu('gtx1650'),
      ramAmount: 16,
      ramSpeed: '3200MHz',
      storageType: 'HDD',
      resolution: '1080p',
      refreshRate: 120,
      games: ['clair-obscur-expedition-33'],
      budgetBucket: '$100-250'
    });

    expect(res.verdict.boundType).toBe('GPU_BOUND');
    expect(res.verdict.confidence).toBeGreaterThanOrEqual(0.75);

    const gpuRecs = res.recommendedParts.find(p => p.category === 'GPU')?.items ?? [];
    expect(gpuRecs.length).toBeGreaterThan(0);

    const storageRecs = res.recommendedParts.find(p => p.category === 'Storage')?.items ?? [];
    expect(storageRecs[0]?.avgFpsGainPct).toBeUndefined();
    expect(storageRecs[0]?.qualitativeBullets.join(' ') ?? '').toMatch(/load|hitch/i);

    const ramRecs = res.recommendedParts.find(p => p.category === 'RAM')?.items ?? [];
    expect(ramRecs[0]?.avgFpsGainPct).toBeUndefined();
    expect(ramRecs[0]?.qualitativeBullets.length ?? 0).toBeGreaterThan(0);
    expect(ramRecs.some(r => r.name.toLowerCase().includes('ddr5'))).toBe(false);
  });

  it('detects CPU-bound for high refresh esports', () => {
    const res = analyzeSystem({
      cpuId: cpu('i3-10100'),
      gpuId: gpu('rtx4070'),
      ramAmount: 16,
      ramSpeed: '3200MHz',
      storageType: 'NVMe',
      resolution: '1080p',
      refreshRate: 240,
      games: ['valorant', 'cs2', 'overwatch2'],
      budgetBucket: '$250-400'
    });
    expect(res.verdict.boundType).toBe('CPU_BOUND');
  });

  it('detects GPU-bound at 4K with midrange GPU', () => {
    const res = analyzeSystem({
      cpuId: cpu('i7-13700k'),
      gpuId: gpu('rtx3060'),
      ramAmount: 16,
      ramSpeed: '3200MHz',
      storageType: 'SATA SSD',
      resolution: '4K',
      refreshRate: 60,
      games: ['cyberpunk', 'rdr2'],
      budgetBucket: '$400-700'
    });
    expect(res.verdict.boundType).toBe('GPU_BOUND');
  });

  it('warns about VRAM pressure in heavy titles with 6GB GPUs', () => {
    const res = analyzeSystem({
      cpuId: cpu('i5-12400'),
      gpuId: gpu('rtx2060'),
      ramAmount: 16,
      ramSpeed: '3200MHz',
      storageType: 'NVMe',
      resolution: '1080p',
      refreshRate: 120,
      games: ['cyberpunk', 'hogwarts'],
      budgetBucket: '$250-400'
    });
    expect(res.warnings.some(w => w.toLowerCase().includes('vram'))).toBe(true);
  });

  it('keeps GPU gain scaling stable across refresh changes in AAA titles', () => {
    const baseInput = {
      cpuId: cpu('i7-11700k'),
      gpuId: gpu('gtx1650'),
      ramAmount: 16,
      ramSpeed: '3200MHz',
      storageType: 'HDD' as const,
      resolution: '1080p' as const,
      games: ['cyberpunk'],
      budgetBucket: '$400-700' as const
    };

    const res120 = analyzeSystem({ ...baseInput, refreshRate: 120 });
    const res720 = analyzeSystem({ ...baseInput, refreshRate: 720 });
    const perf120 =
      res120.recommendedParts
        .find(p => p.category === 'GPU')
        ?.items.find(item => item.label === 'Best performance')
        ?.avgFpsGainPct ?? 0;
    const perf720 =
      res720.recommendedParts
        .find(p => p.category === 'GPU')
        ?.items.find(item => item.label === 'Best performance')
        ?.avgFpsGainPct ?? 0;

    expect(perf120).toBeGreaterThan(0);
    expect(perf720).toBeGreaterThanOrEqual(perf120 * 0.6);
  });

  it('shows meaningful 4K uplift from RTX 3070 to RTX 3080', () => {
    const res = analyzeSystem({
      cpuId: cpu('i7-11700k'),
      gpuId: gpu('rtx3070'),
      ramAmount: 16,
      ramSpeed: '3200MHz',
      storageType: 'NVMe',
      resolution: '4K',
      refreshRate: 60,
      games: ['cyberpunk'],
      budgetBucket: '$400-700'
    });

    const bestPerf = res.recommendedParts
      .find(p => p.category === 'GPU')
      ?.items.find(item => item.label === 'Best performance');
    expect(bestPerf?.name.toLowerCase()).toContain('3080');
    expect(bestPerf?.avgFpsGainPct ?? 0).toBeGreaterThan(10);
  });

  it('avoids extreme GPU gains at 1080p 120Hz and prefers sensible value', () => {
    const res = analyzeSystem({
      cpuId: cpu('i7-11700k'),
      gpuId: gpu('gtx1650'),
      ramAmount: 16,
      ramSpeed: '3200MHz',
      storageType: 'HDD',
      resolution: '1080p',
      refreshRate: 120,
      games: ['clair-obscur-expedition-33'],
      budgetBucket: '$2500+'
    });

    const gpuRecs = res.recommendedParts.find(p => p.category === 'GPU')?.items ?? [];
    const maxGain = Math.max(...gpuRecs.map(p => p.avgFpsGainPct ?? 0));
    expect(maxGain).toBeLessThan(300);
    const hasEstimated = gpuRecs.some(p => p.estimated);
    expect(hasEstimated).toBe(true);

    const options = res.bestValue.options ?? [];
    expect(options.length).toBeGreaterThanOrEqual(3);
    const bestValue = options.find(o => o.label === 'Best value');
    expect(bestValue).toBeTruthy();
    expect(bestValue?.price ?? 9999).toBeLessThan(800);

    const bestPerf = gpuRecs.find(p => p.label === 'Best performance');
    const maxPrice = Math.max(...gpuRecs.map(p => p.price));
    expect(bestPerf?.price).toBe(maxPrice);
  });

  it('avoids high-refresh monitor recommendations for low-FPS AAA', () => {
    const res = analyzeSystem({
      cpuId: cpu('i5-12400'),
      gpuId: gpu('gtx1650'),
      ramAmount: 16,
      ramSpeed: '3200MHz',
      storageType: 'SATA SSD',
      resolution: '1080p',
      refreshRate: 120,
      games: ['cyberpunk'],
      budgetBucket: '$250-400'
    });
    const monitors = res.recommendedParts.find(p => p.category === 'Monitor')?.items ?? [];
    expect(monitors.length).toBe(0);
  });
});
