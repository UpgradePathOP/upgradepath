export type Resolution = '1080p' | '1440p' | '4K';
export type BudgetBucket =
  | '$0-100'
  | '$100-250'
  | '$250-400'
  | '$400-700'
  | '$700-1200'
  | '$1200-1600'
  | '$1600-2000'
  | '$2000-2500'
  | '$2500+';
export type StorageType = 'HDD' | 'SATA SSD' | 'NVMe';
export type GameCategory = 'ESPORTS' | 'AAA' | 'UE5_AAA' | 'SIM' | 'INDIE';
export type TypicalBound = 'CPU_HEAVY' | 'GPU_HEAVY' | 'MIXED';
export type Heaviness = 'LOW' | 'MED' | 'HIGH';
export type BottleneckType = 'CPU_BOUND' | 'GPU_BOUND' | 'MIXED';

export interface Cpu {
  id: string;
  name: string;
  brand: string;
  score: number; // 0-100 gaming score
  price: number;
  socket: string;
  memoryType: 'DDR4' | 'DDR5';
}

export interface Gpu {
  id: string;
  name: string;
  vram: number;
  score1080: number;
  score1440: number;
  score4k: number;
  price: number;
}

export interface Monitor {
  id: string;
  name: string;
  resolution: Resolution;
  refresh: number;
  price: number;
  notes?: string;
}

export interface GameProfile {
  id: string;
  name: string;
  type: 'esports' | 'aaa';
  category?: GameCategory;
  typicalBound?: TypicalBound;
  cpuWeight: number; // base 0-1
  gpuWeight: number; // base 0-1
  targetFPS: 'low' | 'medium' | 'high';
  vramHeaviness?: Heaviness;
  streamingHeaviness?: Heaviness;
  vramHeavy?: boolean;
  notes?: string;
}

export interface AnalysisInput {
  cpuId: string;
  gpuId: string;
  ramAmount: number;
  ramSpeed: string;
  storageType: StorageType;
  resolution: Resolution;
  refreshRate: number;
  games: string[];
  budgetBucket: BudgetBucket;
}

export interface BottleneckResult {
  boundType: BottleneckType;
  confidence: number; // 0..1
  headroomRatio: number;
  reasons: string[];
  games?: Array<{ name: string; boundType: BottleneckType; headroomRatio: number }>;
}

export interface UpgradeImpact {
  avgFpsGainPct?: number;
  avgFpsGainRangePct?: { min: number; max: number };
  qualitativeImpact: string[];
  warnings: string[];
  reasons: string[];
  compatibilityNotes?: string[];
}

export interface PartPick {
  id: string;
  partType: 'GPU' | 'CPU' | 'RAM' | 'STORAGE' | 'MONITOR';
  name: string;
  price: number;
  avgFpsGainPct?: number;
  avgFpsGainRangePct?: { min: number; max: number };
  label?: string;
  estimated?: boolean;
  qualitativeBullets: string[];
  notes: string[];
}

export interface AnalysisResult {
  verdict: BottleneckResult;
  bestValue: {
    category: string;
    impactSummary: string;
    reasons: string[];
    options?: Array<{
      label: string;
      name: string;
      price: number;
      impactSummary: string;
      estimated?: boolean;
    }>;
  };
  upgradePath: Array<{
    category: string;
    impactSummary: string;
    reasons: string[];
  }>;
  recommendedParts: Array<{
    category: 'CPU' | 'GPU' | 'RAM' | 'Storage' | 'Monitor';
    items: PartPick[];
  }>;
  warnings: string[];
}
