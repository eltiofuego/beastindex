'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ARENAS, ORDER, POOLS, ART, regionOfCountry } from '@/lib/arenas';
import { score, fmtRank, ordinalSuffix, ageBand } from '@/lib/scoring';
import type {
  Reference, Country, ArenaKey, Sex, PoolKey, ScoreResult,
} from '@/lib/types';

const flagOf = (iso: string) =>
  String.fromCodePoint(...iso.split('').map((c) => 127397 + c.charCodeAt(0)));

export default function Beast({ reference, countries }:
  { reference: Reference; countries: Country[] }) {

  const [arena, setArena] = useState<ArenaKey>('fit');
  const [prev, setPrev] = useState<ArenaKey>('fit');
  const [booted, setBooted] = useState(false);
  const [sex, setSex] = useState<Sex>('M');
  const [age, setAge] = useState('');
  const [bw, setBw] = useState('');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [pool, setPool] = useState<PoolKey>('everyone');
  const [region, setRegion] = useState<string | null>(null);
  const [country, setCountry] = useState<Country | null>(null);
  const [q, setQ] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [counter, setCounter] = useState(100);
  const [barsOn, setBarsOn] = useState(false);
  const [shareLabel, setShareLabel] = useState('Copy link');
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const A = ARENAS[arena];
  const data = reference.arenas[arena];
  const pools = useMemo(() => data?.pools ?? [], [data]);
  const band = ageBand(reference, parseFloat(age) || 30);

  const regionsAvailable = useMemo(() => {
    const m = data?.metrics[A.metrics[0].ref];
    return Object.keys(m?.regions?.[sex]?.[band] ?? {});
  }, [data, A, sex, band]);

  useEffect(() => { if (!pools.includes(pool)) setPool(pools[0]); }, [pools, pool]);
  useEffect(() => {
    if (region && !regionsAvailable.includes(region)) setRegion(null);
  }, [regionsAvailable, region]);

  // the design's opening arena cycle
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setBooted(true); return; }
    const seq: ArenaKey[] = ['strong', 'fast', 'fit'];
    const ts = seq.map((a, i) => setTimeout(() => {
      setBooted(true);
      setPrev((p) => { setArena(a); return p === a ? p : arenaBefore(a); });
    }, 400 + i * 720));
    return () => ts.forEach(clearTimeout);
    function arenaBefore(a: ArenaKey) { return ORDER[(ORDER.indexOf(a) + 2) % 3]; }
  }, []);

  const go = useCallback((next: ArenaKey) => {
    if (next === arena) return;
    setPrev(arena); setArena(next); setVals({});
  }, [arena]);

  const live = useMemo(() => score(reference, {
    arena, sex, age: parseFloat(age) || 30, bodyweight: parseFloat(bw) || 75,
    pool, region, country: country?.name ?? null, values: vals,
  }), [reference, arena, sex, age, bw, pool, region, country, vals]);

  const submit = () => {
    if (!live) return;
    setResult(live); setBarsOn(false);
    document.body.style.overflow = 'hidden';
    const top = Math.round(100 - live.overall);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setCounter(top); setBarsOn(true); return; }
    setCounter(100);
    const start = performance.now();
    if (tick.current) clearInterval(tick.current);
    tick.current = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / 1000);
      setCounter(Math.round(100 - (100 - top) * (1 - Math.pow(1 - t, 3))));
      if (t >= 1 && tick.current) clearInterval(tick.current);
    }, 32);
    setTimeout(() => setBarsOn(true), 120);
  };
  const back = () => {
    if (tick.current) clearInterval(tick.current);
    setResult(null); document.body.style.overflow = '';
  };
  useEffect(() => () => { if (tick.current) clearInterval(tick.current); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && result) back(); };
    addEventListener('keydown', h); return () => removeEventListener('keydown', h);
  }, [result]);

  const matches = q.trim()
    ? countries.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];

  const pad = (w: string) => {
    const d = Math.max(0, 6 - w.length), l = Math.floor(d / 2);
    return ' '.repeat(l) + w + ' '.repeat(d - l);
  };
  const cur = pad(A.word), pre = pad(ARENAS[prev].word);
  const animate = booted && typeof window !== 'undefined'
    && !matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <main style={{ ['--a' as string]: A.accent }}>
      {/* ── hero ── */}
      <section className="hero">
        <div className="hero-bg">
          {ORDER.map((k) => (
            <div key={k} className={`layer${k === arena ? ' on' : ''}`}>
              <div className="photo" style={{ backgroundImage: `url(${ARENAS[k].photo})`, backgroundPosition: '70% 50%' }} />
              <div className="tintA" style={{ background: ARENAS[k].accent }} />
              <div className="tintB" style={{ background: ARENAS[k].accent }} />
            </div>
          ))}
          <div className="scrim1" /><div className="scrim2" />
        </div>

        <div className="wrap hero-top">
          <div className="row-between">
            <div className="brand">
              <span className="brand-mark" aria-hidden />
              <span className="brand-word">BEASTINDEX<span className="dim">.COM</span></span>
            </div>
            <div className="micro">Free · No signup</div>
          </div>
          <div className="rule-note">
            Ranked against <strong>2.4M</strong> real competition lifts, 56,456 marathon
            finishers and national health-survey data · <a href="#about-data">About the data</a>
          </div>
        </div>

        <div className="wrap hero-body">
          <div className="hero-inner">
            <div className="eyebrow"><i className="tick" /><span>{A.name}</span></div>
            <h1 className="headline">
              <span>How</span>
              <button className="flipword" aria-label="Change arena"
                onClick={() => go(ORDER[(ORDER.indexOf(arena) + 1) % 3])}>
                <span className="tiles">
                  {[...cur].map((ch, i) => (
                    <span className="tile" key={`${arena}-${i}`}>
                      <span className="half top"><span>{ch}</span></span>
                      <span className="half bot"><span>{pre[i] ?? ' '}</span></span>
                      {animate && <>
                        <span className="flapA" style={{ animationDelay: `${i * 44}ms` }}><span>{pre[i] ?? ' '}</span></span>
                        <span className="flapB" style={{ animationDelay: `${i * 44 + 240}ms` }}><span>{ch}</span></span>
                      </>}
                      <span className="seam" />
                    </span>
                  ))}
                </span>
                <span className="flip-underline" />
              </button>
              <span>Am I?</span>
            </h1>

            <div className="panels">
              {ORDER.map((k) => (
                <button key={k} className={`panel${k === arena ? ' on' : ''}`} onClick={() => go(k)}>
                  <span className="thumb">
                    <i style={{ backgroundImage: `url(${ARENAS[k].photo})` }} />
                    <u style={{ background: ARENAS[k].accent }} />
                  </span>
                  <span className="cap">
                    <span className="word">{ARENAS[k].word}</span>
                    <span className="crop">{ARENAS[k].crop}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="hero-actions">
              <button className="btn-ghost" onClick={() => go(ORDER[(ORDER.indexOf(arena) + 1) % 3])}>
                Flip the word
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── calculator ── */}
      <section className="calc">
        <div className="wrap calc-wrap">
          <div className="eyebrow"><i className="tick" /><span>About you</span></div>
          <div className="you-grid">
            <div>
              <label className="lbl">Sex</label>
              <div className="seg">
                {(['M', 'F'] as Sex[]).map((s) => (
                  <button key={s} className={sex === s ? 'on' : ''} onClick={() => setSex(s)}>
                    {s === 'M' ? 'Male' : 'Female'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="lbl" htmlFor="age">Age</label>
              <input id="age" type="number" inputMode="numeric" placeholder="30"
                value={age} onChange={(e) => setAge(e.target.value)} />
            </div>
            <div>
              <label className="lbl" htmlFor="bw">Weight kg</label>
              <input id="bw" type="number" inputMode="decimal" placeholder="75"
                value={bw} onChange={(e) => setBw(e.target.value)} />
            </div>
          </div>

          <hr className="div" />
          <div className="eyebrow"><i className="tick" /><span>{A.name}</span></div>
          <p className="note">Fill in at least one. More entries, sharper rank.</p>
          {A.help && <p className="note">{A.help}</p>}

          <div className="fields">
            {A.metrics.map((m, i) => (
              <div className="field" key={m.k} style={{ animationDelay: `${i * 60}ms` }}>
                <div className="head">
                  <span className="name">{m.label}</span>
                  <span className="hint2">{m.hint}</span>
                </div>
                <div className={`inputs${m.load ? ' two' : ''}`}>
                  <input type={m.time ? 'text' : 'number'} inputMode={m.time ? 'text' : 'decimal'}
                    placeholder={m.time ? (m.dist && m.dist <= 10000 ? '25:00' : '4:15:00')
                      : m.load ? 'kg' : m.signed ? 'cm (may be minus)' : 'reps'}
                    value={vals[m.k] ?? ''}
                    onChange={(e) => setVals((v) => ({ ...v, [m.k]: e.target.value }))} />
                  {m.load && (
                    <input type="number" inputMode="numeric" placeholder="reps"
                      value={vals[`${m.k}_reps`] ?? ''}
                      onChange={(e) => setVals((v) => ({ ...v, [`${m.k}_reps`]: e.target.value }))} />
                  )}
                </div>
              </div>
            ))}
          </div>

          <hr className="div" />
          <div className="lbl">Compare me against</div>
          <p className="note">
            {pools.length > 1
              ? 'Both pools are measured populations. Switching changes who you stand next to, not the maths.'
              : 'One measured population for this arena. More pools need data that is not public yet.'}
          </p>
          <div className="pools" style={{ gridTemplateColumns: `repeat(${Math.min(pools.length, 3)},1fr)` }}>
            {pools.map((p) => {
              const c = data.metrics[A.metrics[0].ref]?.pools?.[p]?.[sex];
              const n = c?.['all']?.n;
              return (
                <button key={p} className={`pool${p === pool ? ' on' : ''}`} onClick={() => setPool(p)}>
                  <span className="pname">{POOLS[p].name}</span>
                  <span className="pdesc">{POOLS[p].desc}</span>
                  <span className="pn">{n ? `measured · n = ${n.toLocaleString()}` : 'measured'}</span>
                </button>
              );
            })}
          </div>

          {regionsAvailable.length > 0 && (
            <div className="region-block">
              <div className="lbl">Compare within a region</div>
              <p className="note">
                Measured curves for {regionsAvailable.length} region
                {regionsAvailable.length > 1 ? 's' : ''} in your sex and age band.
                Regions without enough data to be stable are not listed.
              </p>
              <div className="regions">
                {regionsAvailable.map((r) => {
                  const n = data.metrics[A.metrics[0].ref]?.regions?.[sex]?.[band]?.[r]?.n;
                  return (
                    <button key={r} className={`region${r === region ? ' on' : ''}`}
                      onClick={() => setRegion(region === r ? null : r)}>
                      <span className="rgn">{r}</span>
                      <span className="rgc">n = {n?.toLocaleString()}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="country-block">
            <div className="lbl">Where are you?</div>
            <p className="note">Used on your card and for the region above.</p>
            <div className="combo">
              <input type="text" placeholder="Start typing a country" autoComplete="off" value={q}
                onChange={(e) => { setQ(e.target.value); setListOpen(true); }}
                onFocus={() => setListOpen(true)}
                onBlur={() => setTimeout(() => setListOpen(false), 150)} />
              {listOpen && q.trim() && (
                <div className="dropdown">
                  {matches.length ? matches.map((c) => (
                    <button key={c.iso} onMouseDown={() => {
                      setCountry(c); setQ(c.name); setListOpen(false);
                      const r = regionOfCountry(c.name);
                      if (r && regionsAvailable.includes(r)) setRegion(r);
                    }}>
                      <span className="flag">{flagOf(c.iso)}</span>
                      <span className="cname">{c.name}</span>
                      <span className="creg">{c.region}</span>
                    </button>
                  )) : <div className="empty">No country by that name.</div>}
                </div>
              )}
            </div>
          </div>

          <button className="btn-primary" onClick={submit}>Rank me</button>
          <p className="note center">
            {live
              ? `Ranking on ${live.metrics.map((m) => m.label.toLowerCase()).join(', ')} against ${live.n.toLocaleString()} people.`
              : 'Enter at least one number.'}
          </p>

          <div id="about-data" className="about">
            <div className="lbl">How your rank is calculated</div>
            <h2 className="h2">Where the numbers come from</h2>
            <div className="about-body">
              <p>Every rank here is an <strong>empirical percentile</strong> — your number placed on the
                actual distribution of people in the pool you chose, for your sex and age band.
                Nothing is modelled or invented.</p>
              <div className="sources">
                {Object.entries(reference.arenas).map(([ak, av]) =>
                  Object.entries(av.source).map(([p, txt]) => (
                    <div className="src" key={`${ak}-${p}`}>
                      <b>{ARENAS[ak as ArenaKey].word}</b><span>{txt}</span>
                    </div>
                  )))}
              </div>
              <p>Strength is normalised with the <strong>DOTS</strong> coefficient, chosen over Wilks on
                the evidence in Kopayev, Onyshchenko &amp; Stetsenko (2020). Race distances shorter than a
                marathon are converted with <strong>Riegel (1981)</strong> race equivalence.</p>
              <p className="warn">The competitive pools are made of people who entered a sanctioned meet
                or a big-city marathon. They are not the general public. If a number looks brutal, check
                which pool you are in.</p>
              <p className="strong">Estimates for fun, not medical advice.</p>
            </div>
          </div>
        </div>
      </section>

      {result && <Result r={result} counter={counter} barsOn={barsOn} region={region}
        onBack={back} shareLabel={shareLabel} setShareLabel={setShareLabel} />}
    </main>
  );
}

function Result({ r, counter, barsOn, region, onBack, shareLabel, setShareLabel }: {
  r: ScoreResult; counter: number; barsOn: boolean; region: string | null;
  onBack: () => void; shareLabel: string; setShareLabel: (s: string) => void;
}) {
  const A = ARENAS[r.arena];
  return (
    <div className="result">
      <div className="res-hero">
        <div className="res-bg">
          <div className="photo" style={{ backgroundImage: `url(${A.photo})` }} />
          <div className="tint" style={{ background: A.accent }} />
          <div className="scrim" />
        </div>
        <div className="wrap res-nav">
          <button className="btn-back" onClick={onBack}>Back</button>
          <div className="micro bone">{A.name}</div>
        </div>
        <div className="wrap res-head">
          <div className="res-head-in">
            <div className="plate" style={ART[r.animal] ? { backgroundImage: `url(${ART[r.animal]})` } : undefined}>
              {!ART[r.animal] && (
                <div className="slot"><div>
                  <div className="l1">Illustration slot</div>
                  <div className="l2">{r.animal} to be supplied</div>
                </div></div>
              )}
            </div>
            <div className="res-title">
              <div className="eyebrow"><i className="tick" />
                <span>Rank {String(r.tier + 1).padStart(2, '0')} of 06</span></div>
              <div className="animal">{r.animal}</div>
              <div className="binomial">{r.binomial}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="verdict">
        <div className="wrap verdict-in">
          <div>
            <div className="micro op7">You rank</div>
            <div className="big-pct">TOP {counter}%</div>
            <div className="verdict-line">
              <span className="mut">{A.verb.toUpperCase()}</span> {Math.round(r.overall)}%{' '}
              <span className="mut">OF {POOLS[r.pool].who.toUpperCase()}</span>
            </div>
            {r.rank && (
              <div className="rank-line">
                You would place {fmtRank(r.rank)} among {POOLS[r.pool].who}, same sex and age band
              </div>
            )}
            <div className="micro op6">
              {POOLS[r.pool].who} · {r.n.toLocaleString()} people · your sex and age band
            </div>
          </div>
          <div className="verdict-right">
            <div className="res-sub">{r.title}</div>
            <div className="tagline">{r.tagline}</div>
            {r.otherAnimal && (
              <div className="micro">
                {r.otherAnimal === r.animal
                  ? `Among ${POOLS[r.otherPool!].who}, the same verdict`
                  : `Among ${POOLS[r.otherPool!].who}, ${/^[AEIOU]/i.test(r.otherAnimal) ? 'an' : 'a'} ${r.otherAnimal}`}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="wrap res-body">
        <div className="res-col">
          {r.notices.map((n, i) => (
            <div key={i} className={`notice ${n.level}`}>{n.text}</div>
          ))}

          <div className="lbl">The numbers</div>
          <div className="breakdown">
            {r.metrics.map((m, i) => (
              <div className="row" key={m.key}>
                <div className="top">
                  <span className="nm">{m.label}</span>
                  <span className="vals">
                    <span className="v">{m.display}</span>
                    <span className="p">{Math.round(m.percentile)}%</span>
                  </span>
                </div>
                <div className="bar">
                  <i style={{ width: barsOn ? `${m.percentile}%` : 0, transitionDelay: `${i * 90}ms` }} />
                </div>
                <div className="expl">{m.explanation}</div>
                {m.cohort && (
                  <div className="expl coh">
                    Among {m.cohort.n.toLocaleString()} real {m.cohort.who}, you would place{' '}
                    <b>{fmtRank(m.cohort.rank)}</b> — {Math.round(m.cohort.percentile)}
                    {ordinalSuffix(Math.round(m.cohort.percentile))} percentile on raw numbers,
                    no bodyweight adjustment.
                  </div>
                )}
                {m.region && region && (
                  <div className="expl reg">
                    Within {region}: <b>{fmtRank(m.region.rank)}</b> ·{' '}
                    {Math.round(m.region.percentile)}
                    {ordinalSuffix(Math.round(m.region.percentile))} percentile, bodyweight-adjusted.
                  </div>
                )}
                <div className="expl src">Source: {m.source}</div>
              </div>
            ))}
          </div>

          <div className="why-block">
            <div className="lbl">Why this animal</div>
            <div className="why">{r.why.map((s, i) => <p key={i}>{s}</p>)}</div>
            <div className="ladder">
              {r.ladder.map((l) => (
                <div className={`rung${l.you ? ' on' : ''}`} key={l.rank}>
                  <span className="rn">{String(l.rank).padStart(2, '0')}</span>
                  <span className="ra">{l.animal}</span>
                  <span className="rr">{l.from}–{l.to}</span>
                  {l.you && <span className="ryou">you · {Math.round(r.overall)}</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="share">
            <h2 className="h2">Post the poster</h2>
            <div className="tagline">Somebody in your gym is a Sloth. Help them find out.</div>
            <div className="share-btns">
              <button className="btn-ghost sm" onClick={async () => {
                try {
                  await navigator.clipboard.writeText(location.href);
                  setShareLabel('Copied'); setTimeout(() => setShareLabel('Copy link'), 1600);
                } catch { setShareLabel('Copy failed'); }
              }}>{shareLabel}</button>
            </div>
          </div>

          <div className="footer-mark">
            <svg viewBox="0 0 100 100" aria-hidden><path fill="currentColor" fillRule="evenodd" d="M10 10H90V90H10ZM8.5 76.4Q27.9 61.6 44 42Q22.4 53.7 -0.5 63.6Q0 72.8 8.5 76.4ZM26.8 93.3Q50.1 61.7 68 26Q41.7 55.2 13.2 82.7Q16.7 92.2 26.8 93.3ZM54.1 106.3Q79.5 57 98 4Q69.4 51.6 37.9 97.7Q43.3 107 54.1 106.3Z" /></svg>
            <span>BEASTINDEX.COM</span>
          </div>
        </div>
      </div>
    </div>
  );
}
