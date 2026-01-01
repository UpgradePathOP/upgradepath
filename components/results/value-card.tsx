import { AnalysisResult } from '@/lib/types';
import { DollarSign } from 'lucide-react';

export function ValueCard({ bestValue }: { bestValue: AnalysisResult['bestValue'] }) {
  const isIneffective = bestValue.impactSummary.toLowerCase().includes('ineffective');
  return (
    <div className="bg-gradient-to-br from-brand-50 to-brand-100 dark:from-surface dark:to-[#111418] rounded-xl shadow-lg p-6 border border-brand-100 dark:border-border">
      <div className="flex items-start gap-3 mb-4">
        <DollarSign className="w-6 h-6 text-brand-600 dark:text-brand-400 mt-1" />
        <div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Best Value Upgrade</h3>
          <p className="text-2xl font-bold text-brand-700 dark:text-brand-400">{bestValue.category}</p>
          <p
            className={
              isIneffective
                ? 'text-sm text-danger-600 dark:text-danger-400 mt-1 font-semibold'
                : 'text-sm text-brand-700 dark:text-brand-300 mt-1'
            }
          >
            {bestValue.impactSummary}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {bestValue.reasons.map((reason, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-600 mt-2" />
            <p className="text-slate-700 dark:text-slate-200">{reason}</p>
          </div>
        ))}
      </div>
      {bestValue.options && bestValue.options.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {bestValue.options.map(option => (
            <div
              key={option.label}
              className="rounded-lg border border-slate-200 dark:border-border bg-white/60 dark:bg-surface/70 p-3"
            >
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-muted">
                {option.label}
              </p>
              {option.confidence && option.confidence !== 'confirmed' && (
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 dark:text-muted">
                  {option.confidence}
                </p>
              )}
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{option.name}</span>
                <span className="text-xs text-slate-600 dark:text-slate-300">${option.price}</span>
              </div>
              <p className="text-xs text-brand-700 dark:text-brand-300 mt-1">{option.impactSummary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
