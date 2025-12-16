'use client';

import cpus from '@/data/cpus.json';
import gpus from '@/data/gpus.json';
import games from '@/data/games.json';
import { analyzeSystem } from '@/lib/analysis';
import { AnalysisInput, AnalysisResult, BudgetBucket, Resolution, StorageType } from '@/lib/types';
import { MultiSelect } from '@/components/ui/multi-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Switch } from '@/components/ui/switch';
import { VerdictCard } from '@/components/results/verdict-card';
import { ValueCard } from '@/components/results/value-card';
import { UpgradePathCard } from '@/components/results/upgrade-path-card';
import { WarningsCard } from '@/components/results/warnings-card';
import { PartsCard } from '@/components/results/parts-card';
import { Cpu, HardDrive, Monitor, Share2, Copy, TrendingUp, Loader2, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';

export default function Page() {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('theme');
    if (stored) return stored === 'dark';
    return true; // default to dark
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const [form, setForm] = useState<AnalysisInput>({
    cpuId: cpus[3]?.id ?? '',
    gpuId: gpus[4]?.id ?? '',
    ramAmount: 16,
    ramSpeed: '3200MHz',
    storageType: 'SATA SSD',
    resolution: '1080p',
    refreshRate: 144,
    games: ['valorant', 'cyberpunk'],
    budgetBucket: '$250-400'
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    }
  }, [dark]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cpu = params.get('cpu');
    const gpu = params.get('gpu');
    const ram = params.get('ram');
    const ramSpeed = params.get('ramSpeed');
    const storage = params.get('storage');
    const res = params.get('res');
    const refresh = params.get('refresh');
    const gamesParam = params.get('games');
    const budget = params.get('budget');
    setForm(prev => ({
      ...prev,
      cpuId: cpu ?? prev.cpuId,
      gpuId: gpu ?? prev.gpuId,
      ramAmount: ram ? Number(ram) : prev.ramAmount,
      ramSpeed: ramSpeed ?? prev.ramSpeed,
      storageType: (storage as StorageType) ?? prev.storageType,
      resolution: (res as Resolution) ?? prev.resolution,
      refreshRate: refresh ? Number(refresh) : prev.refreshRate,
      games: gamesParam ? gamesParam.split(',').filter(Boolean) : prev.games,
      budgetBucket: (budget as BudgetBucket) ?? prev.budgetBucket
    }));
  }, []);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      // For MVP we can compute locally to avoid network while still mirroring the API shape.
      const analysis = analyzeSystem(form);
      setResult(analysis);
      const params = new URLSearchParams({
        cpu: form.cpuId,
        gpu: form.gpuId,
        ram: String(form.ramAmount),
        ramSpeed: form.ramSpeed,
        storage: form.storageType,
        res: form.resolution,
        refresh: String(form.refreshRate),
        games: form.games.join(','),
        budget: form.budgetBucket
      });
      window.history.replaceState(null, '', `?${params.toString()}`);
    } catch (e) {
      console.error(e);
      alert('Could not analyze. Please check inputs.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    const cpuName = cpus.find(c => c.id === form.cpuId)?.name ?? form.cpuId;
    const gpuName = gpus.find(g => g.id === form.gpuId)?.name ?? form.gpuId;
    const text = `
UpgradePath Analysis
System: ${cpuName} + ${gpuName}
RAM: ${form.ramAmount}GB ${form.ramSpeed} | Storage: ${form.storageType}
Display: ${form.resolution} @ ${form.refreshRate}Hz | Budget: ${form.budgetBucket}

Verdict: ${result.verdict.type}-limited (${result.verdict.confidence}%)
${result.verdict.reasons.map(r => `• ${r}`).join('\n')}

Best Value: ${result.bestValue.category} — ${result.bestValue.estimatedImpact}
${result.bestValue.reasons.map(r => `• ${r}`).join('\n')}

Upgrade Path:
${result.upgradePath.map((u, i) => `${i + 1}. ${u.category} (${u.estimatedImpact})`).join('\n')}

Warnings:
${result.warnings.map(w => `⚠ ${w}`).join('\n')}
`.trim();
    navigator.clipboard.writeText(text);
    alert('Results copied to clipboard!');
  };

  const handleShare = () => {
    const params = new URLSearchParams({
      cpu: form.cpuId,
      gpu: form.gpuId,
      ram: String(form.ramAmount),
      ramSpeed: form.ramSpeed,
      storage: form.storageType,
      res: form.resolution,
      refresh: String(form.refreshRate),
      games: form.games.join(','),
      budget: form.budgetBucket
    });
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url);
    alert('Share link copied to clipboard!');
  };

  const toggleGame = (id: string) => {
    setForm(prev => ({
      ...prev,
      games: prev.games.includes(id) ? prev.games.filter(g => g !== id) : [...prev.games, id]
    }));
  };

  const quickWhatIf = () => {
    setForm(prev => ({
      ...prev,
      resolution: prev.resolution === '1080p' ? '1440p' : prev.resolution === '1440p' ? '4K' : '1080p'
    }));
  };

  const resolutionLabel = useMemo(
    () => (form.resolution === '1080p' ? '1080p (focus FPS)' : form.resolution === '1440p' ? '1440p sweet spot' : '4K cinematic'),
    [form.resolution]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 px-4 md:px-6 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">UpgradePath</p>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-slate-50">PC Upgrade Optimizer</h1>
            <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">Detect bottlenecks, rank upgrades, and see why.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={quickWhatIf}
              className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm hover:border-brand-500 dark:hover:border-brand-500"
            >
              <Wand2 className="w-4 h-4" />
              What-if (cycle resolution)
            </button>
            <Switch checked={dark} onChange={setDark} label="Dark mode" />
          </div>
        </header>

        <section className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-6 md:p-8 border border-slate-100 dark:border-slate-800 space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300 mb-2 block">CPU</label>
              <SearchableSelect
                options={cpus}
                value={form.cpuId}
                onChange={id => setForm(prev => ({ ...prev, cpuId: id }))}
                placeholder="Select CPU"
                icon={Cpu}
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300 mb-2 block">GPU</label>
              <SearchableSelect
                options={gpus}
                value={form.gpuId}
                onChange={id => setForm(prev => ({ ...prev, gpuId: id }))}
                placeholder="Select GPU"
                icon={Cpu}
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300 mb-2 block">RAM Amount</label>
              <select
                value={form.ramAmount}
                onChange={e => setForm(prev => ({ ...prev, ramAmount: Number(e.target.value) }))}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
              >
                {[8, 16, 32, 64].map(val => (
                  <option key={val} value={val}>
                    {val} GB
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300 mb-2 block">RAM Speed</label>
              <select
                value={form.ramSpeed}
                onChange={e => setForm(prev => ({ ...prev, ramSpeed: e.target.value }))}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
              >
                <option value="2666MHz">2666MHz DDR4</option>
                <option value="3200MHz">3200MHz DDR4</option>
                <option value="3600MHz">3600MHz DDR4</option>
                <option value="DDR5 5200MHz">5200MHz DDR5</option>
                <option value="DDR5 6000MHz">6000MHz DDR5</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300 mb-2 block">Storage</label>
              <select
                value={form.storageType}
                onChange={e => setForm(prev => ({ ...prev, storageType: e.target.value as StorageType }))}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
              >
                <option value="HDD">HDD</option>
                <option value="SATA SSD">SATA SSD</option>
                <option value="NVMe">NVMe SSD</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300 mb-2 block">Budget</label>
              <select
                value={form.budgetBucket}
                onChange={e => setForm(prev => ({ ...prev, budgetBucket: e.target.value as BudgetBucket }))}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
              >
                <option value="$0-100">$0 - $100</option>
                <option value="$100-250">$100 - $250</option>
                <option value="$250-400">$250 - $400</option>
                <option value="$400-700">$400 - $700</option>
                <option value="$700-1200">$700 - $1200</option>
                <option value="$1200+">$1200+</option>
              </select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300 mb-2 block">Resolution</label>
              <select
                value={form.resolution}
                onChange={e => setForm(prev => ({ ...prev, resolution: e.target.value as Resolution }))}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
              >
                <option value="1080p">1080p</option>
                <option value="1440p">1440p</option>
                <option value="4K">4K</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">{resolutionLabel}</p>
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300 mb-2 block">Refresh Rate</label>
              <select
                value={form.refreshRate}
                onChange={e => setForm(prev => ({ ...prev, refreshRate: Number(e.target.value) }))}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
              >
                {[60, 120, 144, 165, 240, 360].map(val => (
                  <option key={val} value={val}>
                    {val} Hz
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-600 dark:text-slate-300 mb-3 block">
              Games you play ({form.games.length} selected)
            </label>
            <MultiSelect options={games} selected={form.games} onToggle={toggleGame} />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loading || form.games.length === 0}
            className={clsx(
              'w-full bg-brand-700 text-white py-4 rounded-xl font-semibold hover:bg-brand-600 transition flex items-center justify-center gap-2',
              'disabled:bg-slate-300 disabled:text-slate-700 disabled:cursor-not-allowed'
            )}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <TrendingUp className="w-5 h-5" />
                Analyze system
              </>
            )}
          </button>
        </section>

        {result && (
          <section className="space-y-4">
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-100 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                <Share2 className="w-4 h-4" />
                Share link
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-100 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                <Copy className="w-4 h-4" />
                Copy results
              </button>
            </div>

            <VerdictCard verdict={result.verdict} />
            <ValueCard bestValue={result.bestValue} />
            <UpgradePathCard upgrades={result.upgradePath} />
            <PartsCard recommendations={result.recommendedParts} />
            <WarningsCard warnings={result.warnings} />
          </section>
        )}

        <footer className="pt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          UpgradePath MVP — deterministic, rule-based suggestions for quick decision-making.
        </footer>
      </div>
    </div>
  );
}
