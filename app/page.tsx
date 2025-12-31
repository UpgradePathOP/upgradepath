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
import { Cpu, HardDrive, Monitor, Share2, Copy, TrendingUp, Loader2, Clock4 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import clsx from 'clsx';

type FormState = {
  cpuId: string;
  gpuId: string;
  ramAmount: number | '';
  ramSpeed: string;
  storageType: StorageType | '';
  resolution: Resolution | '';
  refreshRate: number | '';
  games: string[];
  budgetBucket: BudgetBucket | '';
};

const DEFAULT_FORM: FormState = {
  cpuId: '',
  gpuId: '',
  ramAmount: '',
  ramSpeed: '',
  storageType: '',
  resolution: '',
  refreshRate: '',
  games: [],
  budgetBucket: ''
};

const BUDGET_OPTIONS: Array<{ value: BudgetBucket; label: string }> = [
  { value: '$0-100', label: '$0 - $100' },
  { value: '$100-250', label: '$100 - $250' },
  { value: '$250-400', label: '$250 - $400' },
  { value: '$400-700', label: '$400 - $700' },
  { value: '$700-1200', label: '$700 - $1200' },
  { value: '$1200-1600', label: '$1200 - $1600' },
  { value: '$1600-2000', label: '$1600 - $2000' },
  { value: '$2000-2500', label: '$2000 - $2500' },
  { value: '$2500+', label: '$2500+' }
];

const normalizeBudgetBucket = (value?: string | null): BudgetBucket | '' => {
  if (!value) return '';
  if (value === '$1200+') return '$1200-1600';
  return BUDGET_OPTIONS.some(option => option.value === value) ? (value as BudgetBucket) : '';
};

export default function Page() {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('theme');
    if (stored) return stored === 'dark';
    return true; // default to dark
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [lastInput, setLastInput] = useState<AnalysisInput | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    }
  }, [dark]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextForm: FormState = { ...DEFAULT_FORM };
    const saved = localStorage.getItem('upgradepath:lastForm');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<FormState>;
        Object.assign(nextForm, parsed);
      } catch (err) {
        console.warn('Saved form parse failed', err);
      }
    }

    const params = new URLSearchParams(window.location.search);
    const hasParams = ['cpu', 'gpu', 'ram', 'ramSpeed', 'storage', 'res', 'refresh', 'games', 'budget'].some(key =>
      params.has(key)
    );
    if (hasParams) {
      const cpu = params.get('cpu');
      const gpu = params.get('gpu');
      const ram = params.get('ram');
      const ramSpeed = params.get('ramSpeed');
      const storage = params.get('storage');
      const res = params.get('res');
      const refresh = params.get('refresh');
      const gamesParam = params.get('games');
      const budget = params.get('budget');
      nextForm.cpuId = cpu ?? nextForm.cpuId;
      nextForm.gpuId = gpu ?? nextForm.gpuId;
      nextForm.ramAmount = ram ? Number(ram) : nextForm.ramAmount;
      nextForm.ramSpeed = ramSpeed ?? nextForm.ramSpeed;
      nextForm.storageType = (storage as StorageType) ?? nextForm.storageType;
      nextForm.resolution = (res as Resolution) ?? nextForm.resolution;
      nextForm.refreshRate = refresh ? Number(refresh) : nextForm.refreshRate;
      nextForm.games = gamesParam ? gamesParam.split(',').filter(Boolean) : nextForm.games;
      nextForm.budgetBucket = normalizeBudgetBucket(budget) || nextForm.budgetBucket;
    }
    nextForm.budgetBucket = normalizeBudgetBucket(nextForm.budgetBucket);
    setForm(nextForm);
  }, []);

  const isFormComplete =
    !!form.cpuId &&
    !!form.gpuId &&
    form.ramAmount !== '' &&
    !!form.ramSpeed &&
    !!form.storageType &&
    !!form.resolution &&
    form.refreshRate !== '' &&
    !!form.budgetBucket &&
    form.games.length > 0;

  const handleAnalyze = async () => {
    if (!isFormComplete) return;
    setLoading(true);
    try {
      // For MVP we can compute locally to avoid network while still mirroring the API shape.
      const analysisInput: AnalysisInput = {
        cpuId: form.cpuId,
        gpuId: form.gpuId,
        ramAmount: Number(form.ramAmount),
        ramSpeed: form.ramSpeed,
        storageType: form.storageType as StorageType,
        resolution: form.resolution as Resolution,
        refreshRate: Number(form.refreshRate),
        games: form.games,
        budgetBucket: form.budgetBucket as BudgetBucket
      };
      const analysis = analyzeSystem(analysisInput);
      setResult(analysis);
      setLastInput(analysisInput);
      setLastUpdated(new Date().toLocaleTimeString());
      if (typeof window !== 'undefined') {
        localStorage.setItem('upgradepath:lastForm', JSON.stringify(analysisInput));
      }
      const params = new URLSearchParams({
        cpu: analysisInput.cpuId,
        gpu: analysisInput.gpuId,
        ram: String(analysisInput.ramAmount),
        ramSpeed: analysisInput.ramSpeed,
        storage: analysisInput.storageType,
        res: analysisInput.resolution,
        refresh: String(analysisInput.refreshRate),
        games: analysisInput.games.join(','),
        budget: analysisInput.budgetBucket
      });
      if (typeof window !== 'undefined') {
        try {
          const state = window.history.state;
          if (state) {
            window.history.replaceState(state, '', `?${params.toString()}`);
          }
          // Smooth scroll to results on update
          if (resultRef.current) {
            resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        } catch (err) {
          console.warn('URL sync skipped', err);
        }
      }
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : 'Could not analyze. Please check inputs.';
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result || !lastInput) return;
    const cpuName = cpus.find(c => c.id === lastInput.cpuId)?.name ?? lastInput.cpuId;
    const gpuName = gpus.find(g => g.id === lastInput.gpuId)?.name ?? lastInput.gpuId;
    const verdictLabel =
      result.verdict.boundType === 'CPU_BOUND'
        ? 'CPU-limited'
        : result.verdict.boundType === 'GPU_BOUND'
        ? 'GPU-limited'
        : result.verdict.boundType === 'TARGET_LIMITED'
        ? 'Target-limited'
        : 'Mixed';
    const confidencePct = Math.round(result.verdict.confidence * 100);
    const text = `
UpgradePath Analysis
System: ${cpuName} + ${gpuName}
RAM: ${lastInput.ramAmount}GB ${lastInput.ramSpeed} | Storage: ${lastInput.storageType}
Display: ${lastInput.resolution} @ ${lastInput.refreshRate}Hz | Budget: ${lastInput.budgetBucket}

Verdict: ${verdictLabel} (${confidencePct}%)
${result.verdict.reasons.map(r => `- ${r}`).join('\n')}

Best Value: ${result.bestValue.category} - ${result.bestValue.impactSummary}
${result.bestValue.reasons.map(r => `- ${r}`).join('\n')}
${result.bestValue.options?.length ? `
Top GPU picks:
${result.bestValue.options.map(o => `- ${o.label}: ${o.name} ($${o.price}) ${o.impactSummary}`).join('\n')}` : ''}

Upgrade Path:
${result.upgradePath.map((u, i) => `${i + 1}. ${u.category} (${u.impactSummary})`).join('\n')}

Warnings:
${result.warnings.map(w => `- ${w}`).join('\n')}
`.trim();
    navigator.clipboard.writeText(text);
    alert('Results copied to clipboard!');
  };

  const handleShare = () => {
    if (!lastInput) return;
    const params = new URLSearchParams({
      cpu: lastInput.cpuId,
      gpu: lastInput.gpuId,
      ram: String(lastInput.ramAmount),
      ramSpeed: lastInput.ramSpeed,
      storage: lastInput.storageType,
      res: lastInput.resolution,
      refresh: String(lastInput.refreshRate),
      games: lastInput.games.join(','),
      budget: lastInput.budgetBucket
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

  const resolutionLabel = useMemo(() => {
    if (form.resolution === '1080p') return '1080p (focus FPS)';
    if (form.resolution === '1440p') return '1440p sweet spot';
    if (form.resolution === '4K') return '4K cinematic';
    return 'Select a resolution to tune the recommendations.';
  }, [form.resolution]);

  const selectClass = (hasValue: boolean) =>
    clsx(
      'w-full px-4 py-3 border border-slate-200 dark:border-border rounded-lg bg-white dark:bg-surface hover:border-brand-500 dark:hover:border-brand-500 transition',
      hasValue ? 'text-slate-900 dark:text-slate-50' : 'text-slate-400 dark:text-muted'
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-[#0b0c0e] dark:via-[#0e1013] dark:to-[#0c0d0f] px-4 md:px-6 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="px-1 mb-4 md:mb-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <p className="text-[11px] uppercase tracking-[0.32em] font-semibold leading-none">UpgradePath</p>
                <Image
                  src={dark ? '/branding/upgradepath-logo.png' : '/branding/upgradepath-logo-white.png'}
                  alt="UpgradePath logo"
                  width={512}
                  height={356}
                  className="h-4 w-auto opacity-80"
                  priority
                />
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
                  PC Upgrade Optimizer
                </h1>
                <p className="text-slate-600 dark:text-muted text-sm md:text-base max-w-2xl">
                  Detect bottlenecks. Rank upgrades. See why.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={dark} onChange={setDark} label="Dark mode" />
            </div>
          </div>
        </header>

        <section className="bg-white dark:bg-surface rounded-2xl shadow-lg p-6 md:p-8 border border-slate-100 dark:border-border space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-50 mb-2 block">CPU</label>
              <SearchableSelect
                options={cpus}
                value={form.cpuId}
                onChange={id => setForm(prev => ({ ...prev, cpuId: id }))}
                placeholder="Select CPU"
                icon={Cpu}
                allowClear
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-50 mb-2 block">GPU</label>
              <SearchableSelect
                options={gpus}
                value={form.gpuId}
                onChange={id => setForm(prev => ({ ...prev, gpuId: id }))}
                placeholder="Select GPU"
                icon={Cpu}
                allowClear
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-50 mb-2 block">RAM Amount</label>
              <select
                value={form.ramAmount}
                onChange={e => {
                  const value = e.target.value;
                  setForm(prev => ({ ...prev, ramAmount: value ? Number(value) : '' }));
                }}
                className={selectClass(form.ramAmount !== '')}
              >
                <option value="" className="text-slate-400" style={{ color: '#9aa4b2' }}>
                  Select RAM amount
                </option>
                {[8, 16, 32, 64].map(val => (
                  <option key={val} value={val}>
                    {val} GB
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-50 mb-2 block">RAM Speed</label>
              <select
                value={form.ramSpeed}
                onChange={e => setForm(prev => ({ ...prev, ramSpeed: e.target.value }))}
                className={selectClass(form.ramSpeed !== '')}
              >
                <option value="" className="text-slate-400" style={{ color: '#9aa4b2' }}>
                  Select RAM speed
                </option>
                <option value="2666MHz">2666MHz DDR4</option>
                <option value="3200MHz">3200MHz DDR4</option>
                <option value="3600MHz">3600MHz DDR4</option>
                <option value="DDR5 5200MHz">5200MHz DDR5</option>
                <option value="DDR5 6000MHz">6000MHz DDR5</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-50 mb-2 block">Storage</label>
              <select
                value={form.storageType}
                onChange={e =>
                  setForm(prev => ({
                    ...prev,
                    storageType: e.target.value as StorageType | ''
                  }))
                }
                className={selectClass(form.storageType !== '')}
              >
                <option value="" className="text-slate-400" style={{ color: '#9aa4b2' }}>
                  Select storage
                </option>
                <option value="HDD">HDD</option>
                <option value="SATA SSD">SATA SSD</option>
                <option value="NVMe">NVMe SSD</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-50 mb-2 block">Budget</label>
              <select
                value={form.budgetBucket}
                onChange={e =>
                  setForm(prev => ({
                    ...prev,
                    budgetBucket: e.target.value as BudgetBucket | ''
                  }))
                }
                className={selectClass(form.budgetBucket !== '')}
              >
                <option value="" className="text-slate-400" style={{ color: '#9aa4b2' }}>
                  Select budget
                </option>
                {BUDGET_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-50 mb-2 block">Resolution</label>
              <select
                value={form.resolution}
                onChange={e =>
                  setForm(prev => ({
                    ...prev,
                    resolution: e.target.value as Resolution | ''
                  }))
                }
                className={selectClass(form.resolution !== '')}
              >
                <option value="" className="text-slate-400" style={{ color: '#9aa4b2' }}>
                  Select resolution
                </option>
                <option value="1080p">1080p</option>
                <option value="1440p">1440p</option>
                <option value="4K">4K</option>
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-50 mt-1">{resolutionLabel}</p>
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-50 mb-2 block">Refresh Rate</label>
              <select
                value={form.refreshRate}
                onChange={e => {
                  const value = e.target.value;
                  setForm(prev => ({ ...prev, refreshRate: value ? Number(value) : '' }));
                }}
                className={selectClass(form.refreshRate !== '')}
              >
                <option value="" className="text-slate-400" style={{ color: '#9aa4b2' }}>
                  Select refresh rate
                </option>
                {[60, 120, 144, 165, 240, 360, 480, 540, 720].map(val => (
                  <option key={val} value={val}>
                    {val} Hz
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <label className="text-sm text-slate-600 dark:text-slate-50">
                Games you play ({form.games.length} selected)
              </label>
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-muted">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-1 rounded-full bg-slate-400/60 dark:bg-muted/60" />
                  <span>CPU-heavy</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1 w-3 rounded-full bg-slate-400/60 dark:bg-muted/60" />
                  <span>GPU-heavy</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400/60 dark:bg-muted/60" />
                  <span>Balanced</span>
                </div>
              </div>
            </div>
            <MultiSelect options={games} selected={form.games} onToggle={toggleGame} />
          </div>

          <div className="relative group">
            <button
              onClick={handleAnalyze}
              disabled={loading || !isFormComplete}
              className={clsx(
                'w-full bg-brand-500 text-slate-900 py-4 rounded-xl font-semibold hover:bg-brand-600 transition flex items-center justify-center gap-2',
                'disabled:bg-slate-300 disabled:text-slate-700 disabled:cursor-not-allowed dark:disabled:bg-border dark:disabled:text-muted'
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
            {!isFormComplete && !loading && (
              <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max max-w-xs -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted opacity-0 shadow-lg transition group-hover:opacity-100">
                Please finish selecting components to analyze.
              </div>
            )}
          </div>
        </section>

        {result && (
          <section className="space-y-4" ref={resultRef}>
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-muted">
                <span
                  className={clsx(
                    'inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[11px]',
                    loading
                      ? 'border-warning-300 text-warning-600 dark:text-warning-300'
                      : 'border-brand-400 text-brand-700 dark:text-brand-300'
                  )}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> Updating...
                    </>
                  ) : (
                    <>
                      <Clock4 className="w-3 h-3" />
                      Updated {lastUpdated ?? 'just now'}
                    </>
                  )}
                </span>
              </div>
              <div className="flex gap-2">
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-surface text-slate-700 dark:text-slate-100 rounded-lg hover:bg-slate-200 dark:hover:bg-[#171a1f] transition"
              >
                <Share2 className="w-4 h-4" />
                Share link
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-surface text-slate-700 dark:text-slate-100 rounded-lg hover:bg-slate-200 dark:hover:bg-[#171a1f] transition"
              >
                <Copy className="w-4 h-4" />
                Copy results
              </button>
              </div>
            </div>

            <div className={clsx('relative transition-opacity', loading ? 'opacity-80' : 'opacity-100')}>
              {loading && (
                <div className="absolute inset-0 bg-white/40 dark:bg-background/40 rounded-xl backdrop-blur-sm pointer-events-none z-10 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Recomputing recommendations...
                  </div>
                </div>
              )}
              <div className="space-y-4">
                <VerdictCard verdict={result.verdict} />
                <ValueCard bestValue={result.bestValue} />
                <UpgradePathCard upgrades={result.upgradePath} />
                <PartsCard recommendations={result.recommendedParts} />
                <WarningsCard warnings={result.warnings} />
              </div>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
