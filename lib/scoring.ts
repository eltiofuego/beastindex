import { ARENAS, TIERS, POOLS, MARATHON_CUTOFFS } from './arenas';
import type {
  Reference, ScoreInput, ScoreResult, MetricResult, Sex, PoolKey, Curve, Metric,
} from './types';

/* ── normalisation ───────────────────────────────────────────────────────────── */

// DOTS removes bodyweight and sex bias from a lift. Kopayev et al. 2020.
const DOTS: Record<Sex, number[]> = {
  M: [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093],
  F: [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706],
};
export function dotsCoeff(bw: number, sex: Sex): number {
  const b = Math.min(210, Math.max(40, bw));
  const c = DOTS[sex] ?? DOTS.M;
  return 500 / (c[0] + c[1] * b + c[2] * b ** 2 + c[3] * b ** 3 + c[4] * b ** 4);
}

const MARATHON_M = 42195;
/* Riegel (1981): T2 = T1 * (D2/D1)^1.06. Both endpoints are race performances timed
   the same way, so unlike a VO2max bridge this compares like with like. */
export function riegelToMarathon(seconds: number, metres: number): number {
  if (metres === MARATHON_M) return seconds;
  return seconds * Math.pow(MARATHON_M / metres, 1.06);
}

/* ── helpers ─────────────────────────────────────────────────────────────────── */

export function parseTime(s: string | number | undefined): number | null {
  if (s === undefined || s === null || s === '') return null;
  const parts = String(s).trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0] * 60;
  return null;
}
export function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
export function ordinalSuffix(n: number): string {
  const r = n % 100;
  if (r >= 11 && r <= 13) return 'th';
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
}
function possessive(n: string) { return /s$/i.test(n) ? `${n}'` : `${n}'s`; }
function latinSub(name: string) {
  const s = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  return `${s.slice(0, 9).replace(/[aeiou]+$/, '')}ensis`;
}
function bandWord(p: number) {
  if (p >= 93) return 'exceptional';
  if (p >= 80) return 'well above average';
  if (p >= 62) return 'above average';
  if (p >= 40) return 'about average';
  if (p >= 20) return 'below average';
  return 'well below average';
}
export function ageBand(ref: Reference, age: number): string {
  for (const b of ref.meta.ageBands) {
    const [lo, hi] = b.split('-').map(Number);
    if (age >= lo && age <= hi) return b;
  }
  return 'all';
}
function bwBandOf(bw: number): string {
  const B: [number, number][] = [[40,60],[60,70],[70,80],[80,90],[90,100],[100,110],[110,200]];
  for (const [lo, hi] of B) if (bw >= lo && bw < hi) return `${lo}-${hi}`;
  return bw >= 110 ? '110-200' : '40-60';
}
function pctOf(ref: Reference, curve: Curve, v: number): number {
  const P = ref.meta.percentiles, xs = curve.p;
  if (v <= xs[0]) return P[0];
  if (v >= xs[xs.length - 1]) return P[P.length - 1];
  for (let i = 1; i < xs.length; i++) {
    if (v <= xs[i]) {
      const t = (v - xs[i - 1]) / ((xs[i] - xs[i - 1]) || 1);
      return P[i - 1] + t * (P[i] - P[i - 1]);
    }
  }
  return 50;
}
/* A percentile plus a known sample size is a real position inside that dataset.
   Never presented as a live leaderboard of site users — the copy says "would place". */
export function rankIn(pct: number, n: number) {
  if (!n) return null;
  return { rank: Math.max(1, Math.min(n, Math.round(((100 - pct) / 100) * n))), n };
}
export const fmtRank = (r: { rank: number; n: number }) =>
  `#${r.rank.toLocaleString()} of ${r.n.toLocaleString()}`;

/* ── cutoff awareness ────────────────────────────────────────────────────────── */

/* A slow marathon is not just a low percentile — at most majors the course closes
   and no official time is recorded at all. NYC is the exception (no strict cutoff),
   which is why its dataset holds finishes out to 12:45. Say both things plainly. */
export function cutoffNotices(metric: Metric, seconds: number): { level: 'info' | 'warn'; text: string }[] {
  if (!metric.dist || metric.dist !== MARATHON_M) return [];
  const missed = MARATHON_CUTOFFS.filter((c) => seconds > c.seconds);
  if (!missed.length) return [];
  const list = missed.map((c) => `${c.race} (${fmtTime(c.seconds)})`).join(', ');
  const all = missed.length === MARATHON_CUTOFFS.length;
  return [{
    level: all ? 'warn' : 'info',
    text: all
      ? `At ${fmtTime(seconds)} you would be past the course cutoff at every World Marathon Major — ${list}. Those races would close the course and record no official finish. New York has no strict cutoff, and its 2025 field did include finishers this slow, which is the group you are ranked against here.`
      : `At ${fmtTime(seconds)} you would be past the cutoff at ${list} — no official finish at those races. New York has no strict cutoff, so this time still ranks against its field.`,
  }];
}

/* ── the score ───────────────────────────────────────────────────────────────── */

function metricValue(m: Metric, values: ScoreInput['values']): number | null {
  const raw = values[m.k];
  if (m.time) return parseTime(raw);
  const a = parseFloat(String(raw));
  if (Number.isNaN(a)) return null;
  if (a <= 0 && !m.signed) return null;          // sit-and-reach may be negative
  if (m.load) {                                   // Epley: weight x reps -> est. 1RM
    const r = parseInt(String(values[`${m.k}_reps`]), 10);
    return !Number.isNaN(r) && r > 1 ? a * (1 + Math.min(r, 12) / 30) : a;
  }
  return a;
}

export function score(ref: Reference, input: ScoreInput): ScoreResult | null {
  const arena = ARENAS[input.arena];
  const data = ref.arenas[input.arena];
  if (!arena || !data) return null;

  const band = ageBand(ref, input.age || 30);
  const bw = input.bodyweight || 75;
  const pool = data.pools.includes(input.pool) ? input.pool : data.pools[0];
  const metrics: MetricResult[] = [];
  const notices: ScoreResult['notices'] = [];

  for (const m of arena.metrics) {
    const x = metricValue(m, input.values);
    if (x === null) continue;

    const byPool = data.metrics[m.ref]?.pools?.[pool]?.[input.sex];
    const curve = byPool?.[band] ?? byPool?.['all'];
    if (!curve) continue;

    const normalised = input.arena === 'strong'
      ? x * dotsCoeff(bw, input.sex)
      : m.dist ? riegelToMarathon(x, m.dist) : x;

    let pct = pctOf(ref, curve, normalised);
    if (m.time) pct = 100 - pct;
    pct = Math.min(99.4, Math.max(0.6, pct));

    // like-for-like cohort: same sex, age band, and weight band where recorded
    let cohort: MetricResult['cohort'] = null;
    const cAge = data.metrics[m.ref]?.cohorts?.[input.sex]?.[band];
    if (cAge) {
      let key = 'any';
      let cCurve = cAge['any'];
      if (!cCurve) {
        key = bwBandOf(bw);
        cCurve = cAge[key];
        if (!cCurve) {
          const keys = Object.keys(cAge);
          if (keys.length) {
            const target = parseInt(key, 10);
            key = keys.reduce((a, b) =>
              Math.abs(parseInt(b, 10) - target) < Math.abs(parseInt(a, 10) - target) ? b : a);
            cCurve = cAge[key];
          }
        }
      }
      if (cCurve) {
        let cp = pctOf(ref, cCurve, normalised);
        if (m.time) cp = 100 - cp;
        const who = `${input.sex === 'M' ? 'men' : 'women'} aged ${band}` +
          (key === 'any' ? '' : `, ${key.replace('-', '–')} kg`);
        cohort = { n: cCurve.n, percentile: cp, who, rank: rankIn(cp, cCurve.n)! };
      }
    }

    let region: MetricResult['region'] = null;
    const rCurve = input.region
      ? data.metrics[m.ref]?.regions?.[input.sex]?.[band]?.[input.region] : undefined;
    if (rCurve) {
      let rp = pctOf(ref, rCurve, normalised);
      if (m.time) rp = 100 - rp;
      region = { n: rCurve.n, percentile: rp, rank: rankIn(rp, rCurve.n)! };
    }

    const display = m.time ? fmtTime(x)
      : m.load ? `${Math.round(x)} kg`
      : `${Math.round(x)} ${m.unit ?? ''}`.trim();

    const converted = m.dist && m.dist !== MARATHON_M
      ? { toSeconds: riegelToMarathon(x, m.dist),
          note: `Converted to a ${fmtTime(riegelToMarathon(x, m.dist))} marathon-equivalent (Riegel 1981) before ranking.` }
      : undefined;

    const adj = input.arena === 'strong' ? ', adjusted for bodyweight with DOTS' : '';
    const beat = m.time ? 'faster than' : 'above';
    const explanation =
      `${display} is ${bandWord(pct)} — ${beat} ${Math.round(pct)}% of ${POOLS[pool].who} ` +
      `in your sex and age band${adj}.${converted ? ` ${converted.note}` : ''}`;

    metrics.push({
      key: m.k, label: m.label, value: x, display,
      percentile: pct, rank: rankIn(pct, curve.n),
      cohort, region, converted, explanation,
      source: data.source[pool] ?? Object.values(data.source)[0] ?? '',
    });

    notices.push(...cutoffNotices(m, x));
  }

  if (!metrics.length) return null;

  const overall = metrics.reduce((a, r) => a + r.percentile, 0) / metrics.length;
  const n = Math.max(...metrics.map((r) => r.rank?.n ?? 0));
  let tier = 0;
  TIERS.forEach((t, i) => { if (overall >= t) tier = i; });
  const rank = arena.ranks[tier];
  const other = data.pools.find((p) => p !== pool) ?? null;

  let otherAnimal: string | null = null;
  if (other) {
    const alt = score(ref, { ...input, pool: other });
    otherAnimal = alt ? alt.animal : null;
  }

  const sorted = [...metrics].sort((a, b) => b.percentile - a.percentile);
  const best = sorted[0], worst = sorted[sorted.length - 1];
  const [lo, hi] = [TIERS[tier], tier < 5 ? TIERS[tier + 1] : 100];
  const why: string[] = [
    `You scored ${Math.round(overall)} overall, the average of your ${metrics.length} ` +
    `${metrics.length === 1 ? 'entry' : 'entries'}. That lands in band ${tier + 1} of 6, which is ${rank[0]}.`,
  ];
  if (metrics.length > 1 && Math.round(best.percentile) !== Math.round(worst.percentile)) {
    why.push(`${best.label} is carrying it at ${Math.round(best.percentile)}%; ` +
      `${worst.label} is holding it back at ${Math.round(worst.percentile)}%. ` +
      `Bring ${worst.label.toLowerCase()} up and the rank moves.`);
  }
  if (tier < 5) {
    why.push(`${rank[0]} runs from ${lo} to ${hi}. ` +
      `You need ${Math.max(1, Math.ceil(hi - overall))} more points for ${arena.ranks[tier + 1][0]}.`);
  }

  return {
    arena: input.arena, pool, overall, n, rank: rankIn(overall, n), tier,
    animal: rank[0],
    binomial: rank[1] + (input.country ? `, subsp. ${latinSub(input.country)}` : ''),
    tagline: rank[2],
    title: input.country ? `${possessive(input.country)} ${rank[0]}` : `The ${rank[0]}`,
    next: tier < 5 ? arena.ranks[tier + 1] : null,
    otherPool: other, otherAnimal,
    metrics, why,
    ladder: arena.ranks.map((rk, i) => ({
      rank: i + 1, animal: rk[0], from: TIERS[i], to: i < 5 ? TIERS[i + 1] : 100, you: i === tier,
    })),
    notices,
  };
}
