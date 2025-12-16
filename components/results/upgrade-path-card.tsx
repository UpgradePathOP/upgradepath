import { AnalysisResult } from '@/lib/types';
import { TrendingUp } from 'lucide-react';

export function UpgradePathCard({ upgrades }: { upgrades: AnalysisResult['upgradePath'] }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6">
      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5" />
        Recommended Upgrade Path
      </h3>
      <div className="space-y-4">
        {upgrades.map((upgrade, i) => (
          <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:border-brand-400 transition">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="inline-flex w-8 h-8 rounded-full bg-brand-50 dark:bg-slate-800 text-brand-700 dark:text-brand-100 font-bold items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-lg font-semibold text-slate-900 dark:text-slate-50">{upgrade.category}</span>
              </div>
              <span className="text-sm font-medium text-brand-700 dark:text-brand-200 bg-brand-50 dark:bg-slate-800 px-3 py-1 rounded-full">
                {upgrade.estimatedImpact}
              </span>
            </div>
            <div className="ml-11 space-y-1">
              {upgrade.reasons.map((reason, j) => (
                <div key={j} className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-slate-400 mt-2" />
                  <p className="text-sm text-slate-600 dark:text-slate-300">{reason}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
        {upgrades.length === 0 && <div className="text-sm text-slate-500">No major upgrades recommended.</div>}
      </div>
    </div>
  );
}
