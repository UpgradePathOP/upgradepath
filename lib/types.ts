export type Resolution = '1080p' | '1440p' | '4K';
export type BudgetBucket = '$0-100' | '$100-250' | '$250-400' | '$400-700' | '$700-1200' | '$1200+';
export type StorageType = 'HDD' | 'SATA SSD' | 'NVMe';

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
  cpuWeight: number; // base 0-1
  gpuWeight: number; // base 0-1
  targetFPS: 'low' | 'medium' | 'high';
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

export interface AnalysisResult {
  verdict: {
    type: 'CPU' | 'GPU' | 'MIXED';
    confidence: number;
    reasons: string[];
  };
  bestValue: {
    category: string;
    estimatedImpact: string;
    reasons: string[];
  };
  upgradePath: Array<{
    category: string;
    priority: number;
    estimatedImpact: string;
    reasons: string[];
  }>;
  recommendedParts: Array<{
    category: 'CPU' | 'GPU' | 'RAM' | 'Storage' | 'Monitor';
    items: Array<{ id: string; name: string; score?: number; price: number; reason: string; compatibilityNote?: string }>;
  }>;
  warnings: string[];
}
