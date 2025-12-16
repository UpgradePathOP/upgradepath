import { analyzeSystem } from '@/lib/analysis';
import { AnalysisInput } from '@/lib/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  cpuId: z.string(),
  gpuId: z.string(),
  ramAmount: z.number().int().positive(),
  ramSpeed: z.string(),
  storageType: z.enum(['HDD', 'SATA SSD', 'NVMe']),
  resolution: z.enum(['1080p', '1440p', '4K']),
  refreshRate: z.number().int(),
  games: z.array(z.string()).min(1),
  budgetBucket: z.enum(['$0-100', '$100-250', '$250-400', '$400-700', '$700-1200', '$1200+'])
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = schema.parse(json) as AnalysisInput;
    const result = analyzeSystem(parsed);
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    const message = err?.issues?.[0]?.message ?? err?.message ?? 'Invalid request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
