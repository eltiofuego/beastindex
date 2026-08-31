#!/usr/bin/env python3
"""
BEASTINDEX — build web/data/reference.json from the measured sources.

Everything the site scores against is an EMPIRICAL PERCENTILE CURVE computed here.
No hand-typed numbers. Each curve records its source and sample size so the
methodology page can cite it.

Normalisation strategy per arena:
  STRONG  DOTS coefficient removes bodyweight+sex, then percentiles by age band.
          (DOTS chosen per Kopayev et al. 2020 — see README section 5 refs.)
  FAST    percentiles of finish time by sex + age band.
  FIT     percentiles of rep counts by sex + age band.
"""
import json, warnings
from pathlib import Path
import numpy as np, pandas as pd
warnings.filterwarnings('ignore')

BASE = Path(__file__).resolve().parent
RAW, OUT = BASE / "raw", BASE.parent / "web" / "data"
OUT.mkdir(parents=True, exist_ok=True)

PCTS = [1,2,3,5,7.5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,92.5,95,97,98,99]
AGE_BANDS = [(18,24),(25,29),(30,34),(35,39),(40,44),(45,49),(50,59),(60,85)]

# DOTS — Kopayev et al. 2020. Removes bodyweight and sex bias from a lift.
DOTS_M = (-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093)
DOTS_F = (-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706)

def dots_coeff(bw, sex):
    bw = np.clip(bw, 40, 210)
    a,b,c,d,e = DOTS_M if sex == 'M' else DOTS_F
    return 500.0 / (a + b*bw + c*bw**2 + d*bw**3 + e*bw**4)

def band_of(age):
    for lo,hi in AGE_BANDS:
        if lo <= age <= hi: return f"{lo}-{hi}"
    return None

def curve(series, min_n=120):
    """Empirical percentile curve -> {p: value}. None if the cell is too thin."""
    s = pd.Series(series).dropna()
    if len(s) < min_n: return None
    return {"n": int(len(s)),
            "p": [round(float(v), 2) for v in np.percentile(s, PCTS)]}

def by_age(df, valcol, min_n=120):
    out = {}
    for sex in ('M','F'):
        d = df[df.sex == sex]
        cells = {}
        for lo,hi in AGE_BANDS:
            c = curve(d[d.age.between(lo,hi)][valcol], min_n)
            if c: cells[f"{lo}-{hi}"] = c
        allc = curve(d[valcol], min_n)
        if allc: cells["all"] = allc
        if cells: out[sex] = cells
    return out


def build_strong():
    print("STRONG — OpenPowerlifting")
    df = pd.read_csv(RAW.parent / "processed" / "strength_data.csv", low_memory=False)
    df = df[(df.Equipment == 'Raw') & df.Age.between(18,85) & df.BodyweightKg.between(40,200)]
    df = df.rename(columns={'Sex':'sex','Age':'age'})
    k = np.where(df.sex.values=='M', dots_coeff(df.BodyweightKg.values,'M'),
                                     dots_coeff(df.BodyweightKg.values,'F'))
    metrics = {}
    for name, col in [('squat','Best3SquatKg'),('bench','Best3BenchKg'),('deadlift','Best3DeadliftKg')]:
        d = df[df[col].notna()].copy()
        kk = np.where(d.sex.values=='M', dots_coeff(d.BodyweightKg.values,'M'),
                                         dots_coeff(d.BodyweightKg.values,'F'))
        d['norm'] = d[col].values * kk
        metrics[name] = {"pools": {"competitors": by_age(d,'norm')}}
        n = sum(c['n'] for s in metrics[name]['pools']['competitors'].values() for kx,c in s.items() if kx=='all')
        print(f"   {name:<9} n={n:,}")
    return {"metrics": metrics, "normalisation": "dots",
            "source": {"competitors": "OpenPowerlifting bulk export, Raw equipment only"}}


def build_fast():
    print("FAST — NYC Marathon 2025 + NHANES VO2max")
    df = pd.read_csv(RAW / "running" / "nyc_marathon_2025.csv", low_memory=False)
    fin = df.drop_duplicates('RunnerID')[['OverallTime','Gender','Age']].copy()
    def sec(t):
        try:
            p=[int(x) for x in str(t).split(':')]
            return p[0]*3600+p[1]*60+p[2] if len(p)==3 else np.nan
        except: return np.nan
    fin['val'] = fin.OverallTime.map(sec)
    fin['sex'] = fin.Gender.map({'M':'M','W':'F'})
    fin['age'] = pd.to_numeric(fin.Age, errors='coerce')
    fin = fin[fin.val.notna() & fin.sex.notna() & fin.age.between(18,85)]
    marathon = by_age(fin,'val')
    print(f"   marathon competitors n={len(fin):,}")

    # NHANES VO2max -> general population. Stored as VO2max; the site converts a
    # user's race time to VO2max with the Daniels/Gilbert relation before lookup.
    vo=[]
    for cv,dm in [('CVX','DEMO'),('CVX_B','DEMO_B'),('CVX_C','DEMO_C')]:
        c = pd.read_sas(RAW/'nhanes'/f'{cv}.xpt', format='xport')[['SEQN','CVDVOMAX']]
        d = pd.read_sas(RAW/'nhanes'/f'{dm}.xpt', format='xport')[['SEQN','RIAGENDR','RIDAGEYR']]
        vo.append(c.merge(d, on='SEQN'))
    vo = pd.concat(vo)
    vo['sex'] = vo.RIAGENDR.map({1:'M',2:'F'}); vo['age'] = vo.RIDAGEYR
    vo = vo[vo.CVDVOMAX.notna() & vo.age.between(18,85)]
    print(f"   vo2max everyone   n={len(vo):,}")
    return {"metrics": {
              "marathon": {"pools": {"competitors": marathon}},
              "vo2max":   {"pools": {"everyone": by_age(vo,'CVDVOMAX')}}},
            "normalisation": "none",
            "source": {"competitors":"NYC Marathon 2025 (NYRR public results)",
                       "everyone":"NHANES CVX 1999-2004, measured VO2max"}}


def build_fit():
    print("FIT — Korea Sports Promotion Foundation")
    df = pd.read_csv(RAW / "fitness" / "body_performance_kr.csv")
    df = df.rename(columns={'sit-ups counts':'situps','gripForce':'grip','gender':'sex'})
    df = df[df.age.between(18,85)]
    print(f"   situps everyone   n={len(df):,}")
    return {"metrics": {"situps": {"pools": {"everyone": by_age(df,'situps')}}},
            "normalisation":"none",
            "source":{"everyone":"Korea Sports Promotion Foundation national fitness testing"}}


def main():
    ref = {"meta": {"percentiles": PCTS, "ageBands":[f"{a}-{b}" for a,b in AGE_BANDS],
                    "note":"Empirical percentile curves from measured data. No synthetic values."},
           "arenas": {"strong": build_strong(), "fast": build_fast(), "fit": build_fit()}}
    p = OUT / "reference.json"
    p.write_text(json.dumps(ref, separators=(',',':')))
    print(f"\nwrote {p} ({p.stat().st_size/1024:.0f} KB)")

if __name__ == "__main__":
    main()
