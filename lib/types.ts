export type Sex = 'M' | 'F';
export type PoolKey = 'everyone' | 'firsttimers' | 'competitors' | 'trained';
export type ArenaKey = 'fit' | 'strong' | 'fast';

export interface Curve { n: number; p: number[] }
export interface Metric {
  k: string; label: string; hint: string; ref: string;
  time?: boolean; load?: boolean; signed?: boolean;
  dist?: number; unit?: string;
}
export interface Arena {
  word: string; name: string; accent: string; photo: string;
  crop: string; verb: string; help: string;
  ranks: [string, string, string][];
  metrics: Metric[];
}
export interface ArenaData {
  basePool: PoolKey; pools: PoolKey[];
  source: Record<string, string>;
  metrics: Record<string, {
    pools: Record<string, Record<Sex, Record<string, Curve>>>;
    cohorts?: Record<Sex, Record<string, Record<string, Curve>>>;
    regions?: Record<Sex, Record<string, Record<string, Curve>>>;
  }>;
}
export interface Reference {
  meta: { percentiles: number[]; ageBands: string[]; participation?: Record<Sex, Record<string, number>> };
  arenas: Record<ArenaKey, ArenaData>;
}
export interface Country { name: string; iso: string; region: string; continent: string; pop: number }

export interface ScoreInput {
  arena: ArenaKey; sex: Sex; age: number; bodyweight: number;
  pool: PoolKey; region?: string | null; country?: string | null;
  values: Record<string, string | number>;
}
export interface MetricResult {
  key: string; label: string; value: number; display: string;
  percentile: number; rank: { rank: number; n: number } | null;
  cohort: { n: number; percentile: number; who: string; rank: { rank: number; n: number } } | null;
  region: { n: number; percentile: number; rank: { rank: number; n: number } } | null;
  converted?: { toSeconds: number; note: string };
  explanation: string;
  source: string;
}
export interface ScoreResult {
  arena: ArenaKey; pool: PoolKey; overall: number; n: number;
  rank: { rank: number; n: number } | null;
  tier: number; animal: string; binomial: string; tagline: string; title: string;
  next: [string, string, string] | null;
  otherPool: PoolKey | null; otherAnimal: string | null;
  metrics: MetricResult[];
  why: string[];
  ladder: { rank: number; animal: string; from: number; to: number; you: boolean }[];
  notices: { level: 'info' | 'warn'; text: string }[];
}
