import { AnalysisResult } from '@/lib/types';

export function VerdictCard({ verdict }: { verdict: AnalysisResult['verdict'] }) {
  const border =
    verdict.boundType === 'CPU_BOUND'
      ? 'border-warning-500'
      : verdict.boundType === 'GPU_BOUND'
      ? 'border-danger-500'
      : verdict.boundType === 'TARGET_LIMITED'
      ? 'border-amber-500'
      : 'border-brand-500';

  const gameSummary = verdict.games ?? [];
  const cpuGames = gameSummary.filter(g => g.boundType === 'CPU_BOUND');
  const gpuGames = gameSummary.filter(g => g.boundType === 'GPU_BOUND');
  const mixedGames = gameSummary.filter(g => g.boundType === 'MIXED');

  return (
    <div className={`bg-white dark:bg-surface rounded-xl shadow-lg p-6 border-l-4 ${border}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-1">Bottleneck Verdict</h3>
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">
              {verdict.boundType === 'CPU_BOUND'
                ? 'Mostly CPU-limited'
                : verdict.boundType === 'GPU_BOUND'
                ? 'Mostly GPU-limited'
                : verdict.boundType === 'TARGET_LIMITED'
                ? 'Target-limited'
                : 'Mixed'}
            </p>
            <p className="text-sm text-slate-500 dark:text-muted">
              {verdict.boundType === 'CPU_BOUND'
                ? 'CPU is the main limiter'
                : verdict.boundType === 'GPU_BOUND'
                ? 'GPU is the main limiter'
                : verdict.boundType === 'TARGET_LIMITED'
                ? 'Refresh target above expected FPS'
                : 'CPU/GPU are closely matched'}
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Top reasons:</p>
        {verdict.reasons.map((reason, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-2" />
            <p className="text-slate-700 dark:text-slate-200">{reason}</p>
          </div>
        ))}
        {gameSummary.length > 0 && (
          <div className="pt-2 text-sm text-slate-500 dark:text-slate-300">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Game breakdown:</span>{' '}
            {cpuGames.length > 0 && (
              <span className="mr-3">
                CPU: {cpuGames.map(g => g.name).join(', ')}
              </span>
            )}
            {gpuGames.length > 0 && (
              <span className="mr-3">
                GPU: {gpuGames.map(g => g.name).join(', ')}
              </span>
            )}
            {mixedGames.length > 0 && (
              <span className="mr-3">
                Mixed: {mixedGames.map(g => g.name).join(', ')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
