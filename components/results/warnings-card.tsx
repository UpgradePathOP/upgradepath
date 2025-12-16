import { AlertTriangle } from 'lucide-react';

export function WarningsCard({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="bg-amber-50 dark:bg-slate-900 rounded-xl shadow-lg p-6 border border-amber-200 dark:border-amber-700">
      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-4 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-600" />
        Important considerations
      </h3>
      <div className="space-y-3">
        {warnings.map((warning, i) => (
          <div key={i} className="flex items-start gap-3 bg-white dark:bg-slate-800 p-3 rounded-lg border border-amber-100 dark:border-amber-700/60">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-slate-700 dark:text-slate-200">{warning}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
