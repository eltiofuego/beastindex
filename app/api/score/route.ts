import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { score } from '@/lib/scoring';
import { ARENAS } from '@/lib/arenas';
import type { Reference, ScoreInput, ArenaKey, Sex, PoolKey } from '@/lib/types';

let cached: Reference | null = null;
async function reference(): Promise<Reference> {
  if (!cached) {
    const p = path.join(process.cwd(), 'public', 'data', 'reference.json');
    cached = JSON.parse(await fs.readFile(p, 'utf8')) as Reference;
  }
  return cached;
}

/** Reject anything impossible before it reaches the model (revision doc POIN 2). */
function validate(b: Record<string, unknown>): { ok: true; input: ScoreInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const arena = b.arena as ArenaKey;
  if (!arena || !(arena in ARENAS)) errors.push('arena must be one of fit, strong, fast');
  const sex = b.sex as Sex;
  if (sex !== 'M' && sex !== 'F') errors.push('sex must be M or F');
  const age = Number(b.age);
  if (!Number.isFinite(age) || age < 14 || age > 90) errors.push('age must be between 14 and 90');
  const bodyweight = Number(b.bodyweight);
  if (!Number.isFinite(bodyweight) || bodyweight < 30 || bodyweight > 250)
    errors.push('bodyweight must be between 30 and 250 kg');
  const values = (b.values ?? {}) as Record<string, string | number>;
  if (!values || typeof values !== 'object' || !Object.keys(values).length)
    errors.push('values must contain at least one entry');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    input: {
      arena, sex, age, bodyweight,
      pool: (b.pool as PoolKey) ?? 'everyone',
      region: (b.region as string) ?? null,
      country: (b.country as string) ?? null,
      values,
    },
  };
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'body must be valid JSON' }, { status: 400 }); }

  const v = validate(body);
  if (!v.ok) return NextResponse.json({ error: 'invalid input', details: v.errors }, { status: 400 });

  const result = score(await reference(), v.input);
  if (!result) {
    return NextResponse.json(
      { error: 'no scoreable entry', details: ['every value was empty, non-numeric or out of range'] },
      { status: 422 },
    );
  }
  return NextResponse.json(result);
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/score',
    body: { arena: 'strong', sex: 'M', age: 30, bodyweight: 80,
            pool: 'firsttimers', country: 'Indonesia', region: 'Southeast Asia',
            values: { squat: 180, squat_reps: 1, bench: 120, deadlift: 220 } },
  });
}
