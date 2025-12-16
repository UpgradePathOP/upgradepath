import { AnalysisResult } from '@/lib/types';
import { DollarSign } from 'lucide-react';

export function ValueCard({ bestValue }: { bestValue: AnalysisResult['bestValue'] }) {
  return (
    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-slate-800 dark:to-slate-900 rounded-xl shadow-lg p-6 border border-emerald-200 dark:border-slate-700">
      <div className="flex items-start gap-3 mb-4">
        <DollarSign className="w-6 h-6 text-emerald-600 dark:text-emerald-300 mt-1" />
        <div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Best Value Upgrade</h3>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{bestValue.category}</p>
          <p className="text-sm text-emerald-700 dark:text-emerald-200 mt-1">
            Estimated Impact: {bestValue.estimatedImpact}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {bestValue.reasons.map((reason, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2" />
            <p className="text-slate-700 dark:text-slate-200">{reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
