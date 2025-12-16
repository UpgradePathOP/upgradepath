import { analyzeSystem } from '@/lib/analysis';
import cpus from '@/data/cpus.json';
import gpus from '@/data/gpus.json';

const cpu = (id: string) => cpus.find(c => c.id === id)!.id;
const gpu = (id: string) => gpus.find(g => g.id === id)!.id;

// Basic typing guard: ensure suggestParts compatibilityNote doesn't break inference
type _TestPartNote = NonNullable<ReturnType<typeof analyzeSystem>['recommendedParts'][0]['items'][number]['compatibilityNote']>;

describe('analyzeSystem', () => {
  it('detects GPU-bound at high resolution', () => {
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
    expect(res.verdict.type).toBe('GPU');
  });

  it('detects CPU-bound at high refresh esports', () => {
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
    expect(res.verdict.type).toBe('CPU');
  });

  it('mixed verdict when balanced', () => {
    const res = analyzeSystem({
      cpuId: cpu('r7-5800x3d'),
      gpuId: gpu('rtx3080'),
      ramAmount: 32,
      ramSpeed: '3600MHz',
      storageType: 'NVMe',
      resolution: '1440p',
      refreshRate: 144,
      games: ['bg3', 'warzone', 'fortnite'],
      budgetBucket: '$700-1200'
    });
    expect(res.verdict.type).toBe('MIXED');
  });

  it('prioritizes RAM when underprovisioned', () => {
    const res = analyzeSystem({
      cpuId: cpu('i5-12400'),
      gpuId: gpu('rtx3060ti'),
      ramAmount: 8,
      ramSpeed: '2666MHz',
      storageType: 'HDD',
      resolution: '1080p',
      refreshRate: 120,
      games: ['warzone'],
      budgetBucket: '$100-250'
    });
    const top = res.upgradePath[0].category;
    expect(top).toBe('RAM');
  });

  it('warns about VRAM heavy titles on low VRAM', () => {
    const res = analyzeSystem({
      cpuId: cpu('i5-13600k'),
      gpuId: gpu('gtx1650'),
      ramAmount: 16,
      ramSpeed: '3200MHz',
      storageType: 'NVMe',
      resolution: '1080p',
      refreshRate: 60,
      games: ['cyberpunk', 'warzone'],
      budgetBucket: '$250-400'
    });
    expect(res.warnings.some(w => w.toLowerCase().includes('vram'))).toBe(true);
  });
});
