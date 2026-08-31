# BEASTINDEX — Build Notes

Fitness scoring + animal-archetype mapping, built on real reference data.

**Brand: BEASTINDEX (beastindex.com)** — decided 2026-08-31. `Beast/BEAST INDEX.dc.html` is the
frontend reference; the HOWFITAMI-named files are the same app under the retired name.
This file is the running log the project plan (`HOWFITAMI_Rencana_Proyek_v2.docx` §12) asks for:
decisions made, what is verified, what is still missing, and what needs a human call.

Status as of 2026-08-31: **Tahap 1 (Data) done for STRONG and FAST with measured data.
FIT still runs on hand-typed placeholder tables.** No model, API, or production frontend exists yet.

---

## 1. Repo map

```
data/
  download_datasets.py       OPL downloader (+ the two hand-typed tables, see §3)
  download_real_sources.py   NEW — NHANES + NYC Marathon, all measured
  clean_strength.py          OPL raw CSV -> processed/strength_data.csv
  raw/openpowerlifting.csv          819 MB, 4,009,735 rows (full OPL bulk export)
  raw/nhanes/*.xpt                  15 files, 46 MB — VO2max, grip, demo, body measures
  raw/running/nyc_marathon_2025.csv 175 MB, 1.88M split rows / 56,456 finishers
  processed/strength_data.csv       121 MB, 2,373,441 rows — CLEAN, verified
  processed/running_norms.json      hand-typed placeholder — superseded, do not use
  processed/fitness_norms.json      hand-typed placeholder — FIT arena only
Beast/                     design source (see §4)
api/  models/  notebooks/  web/    created, all empty
```

## 2. Dataset status

| Arena | General-population anchor | Competitive tail | Real? |
|---|---|---|---|
| STRONG | NHANES grip strength, n=10,386 | OpenPowerlifting, n=2,373,441 | **Yes / Yes** |
| FAST | NHANES VO2max, n=5,440 | NYC Marathon 2025, n=56,456 | **Yes / Yes** |
| FIT | *(none)* | *(none)* | **No — placeholders** |

Downloaded 2026-08-31 by `data/download_real_sources.py`. Every file is fetched, nothing typed.

### 2.0 The new measured sources

**NHANES (CDC)** — nationally representative US sample, the general-population anchor the plan
asks for in §10. Two measured variables matter:

- `CVDVOMAX` — VO2max from a submaximal treadmill test, cycles 1999-2000/2001-02/2003-04.
  Pooled n=5,440 adults 18-85. Median 42.4 M / 29.6 F mL/kg/min; p10 32.6 M / 18.5 F.
- `MGDCGSZ` — combined grip strength, cycles 2011-12/2013-14. Pooled n=10,386 adults.
  Mean 86.9 kg M / 55.4 kg F.

Both merge cleanly on `SEQN` with `DEMO` (age, sex) and `BMX` (weight, height). Verified.

**NYC Marathon 2025** — 56,456 unique finishers, 133 countries, ages 18-85, with 5 km splits
(1.88M split rows). A mass-participation field, not an elite-only one, which is exactly the
recreational-competitive tier we need:

```
Men    n=30,608   p5 2:54:47   p25 3:34:56   p50 4:09:53   p75 4:54:37   p95 6:13:31
Women  n=25,710   p5 3:23:49   p25 4:02:00   p50 4:39:16   p75 5:24:33   p95 6:46:44
```

Source: HuggingFace `donaldye8812/nyc-2025-marathon-splits`, scraped from NYRR public results.

**Kaggle was not used.** It needs a `kaggle.json` credential we do not have, and everything
required turned out to be available without auth. No account needed to rebuild this project.

### 2.1 Strength data — verified profile

`data/processed/strength_data.csv` — 2,373,441 rows, columns
`Sex, Age, BodyweightKg, Best3SquatKg, Best3BenchKg, Best3DeadliftKg, TotalKg, Dots, Equipment, Country`

```
Sex           M 1,721,036  ·  F 652,405
Equipment     Raw 1,551,951 · Single-ply 523,717 · Wraps 188,041 · Multi-ply 83,506 · Unlimited 26,147
All 3 lifts   1,533,477 rows
Age           mean 30.9   range 14–90
BodyweightKg  mean 84.9   range 35–200
Squat         mean 181.3  (824,366 null — bench-only meets)
Bench         mean 123.1  (190,811 null)
Deadlift      mean 199.8  (613,491 null)
Dots          mean 277.0  median 307.8  — present on every row
Countries     USA 899k · Russia 374k · Ukraine 102k · Australia 72k · Germany 69k
```

Cleaning already applied by `clean_strength.py`: DQ/DD/NS entries dropped, failed attempts
(negative kg) treated as null, sanity ranges enforced, rows without Sex/bodyweight/Age dropped,
rows with zero valid lifts dropped. 1,636,294 raw rows were dropped in total.

**`Dots` is already computed in the source data** — the plan's Tahap 2 step "hitung skor DOTS
untuk seluruh baris" is effectively free. Keep the OPL-supplied value; only implement the DOTS
formula for scoring *new user input*.

### 2.2 What §2.1 does NOT solve — the population-bias problem

The plan flags this in §10 and it is the single biggest correctness risk. Every row here is a
**competitive powerlifter at a sanctioned meet**. Median Dots is 307.8 — that is roughly an
intermediate-to-advanced competitor. A normal person entering a 60 kg squat would land near the
0th percentile and always be told they are a House Cat.

The plan's answer is to balance against NHANES. That data does not exist in this repo yet — the
`fitness_norms.json` NHANES section covers only bodyweight distributions, not barbell strength.
**This needs solving before the strength arena can be shown to the public.**

## 3. Correction to the plan's data assumptions

Two things in the plan do not match what is on disk:

1. **Kaggle is not involved.** `download_datasets.py` pulls straight from
   `openpowerlifting.gitlab.io` (GitHub mirror as fallback). No `kaggle.json`, no Kaggle API.
   This is better — same data, curated upstream, no credentials, and refreshable weekly.
2. **Datasets 2–4 are not downloads.** `create_running_norms()` and `create_fitness_norms()`
   contain literal Python dicts of percentile numbers, cited in comments to RunRepeat,
   MarathonGuide, parkrun, ACSM, APFT and CSEP but not fetched from any of them. The plan's own
   premise is "data asli dari manusia sungguhan — bukan angka yang dikarang." Three quarters of
   the reference set currently is exactly the thing the plan rules out.

The numbers themselves are plausible and match published aggregates, so they work fine as a
**v1 placeholder**. They should not be described publicly as "dataset" until replaced.

## 4. Design materials

Seven `.dc.html` files in `Beast/`. These are Claude Design canvas files — they need
`support.js` (1,911 lines, present) and use `<x-dc>`, `<sc-for>`, `<sc-if>`, `{{ }}` bindings
plus a `DCLogic` component class. As the plan's §10 notes, this format must be converted to
plain HTML/CSS/JS or React for production.

| File | Role |
|---|---|
| `HOWFITAMI v4.dc.html` | **Newest HOWFITAMI-branded build.** Use as the frontend reference. |
| `BEAST INDEX.dc.html` | Same app, rebranded "BEASTINDEX / beastindex.com". See §6. |
| `HOWFITAMI v3 / v2 / (v1).dc.html` | Earlier iterations, superseded |
| `Brand Kit.dc.html` | Logo, illustration rules, 24 animal slots, share-card spec |
| `Logo Exploration.dc.html` | Mark studies — "a claw mark that is also a rising rank" |

### 4.1 Visual system (from v4 + Brand Kit)

```
--void  #0B0B0C     --coal  #121315     --steel #1B1D20
--line  #2C2F34     --bone  #F2F0EA     --dim   #8C9098
```
Accent is per-arena and swaps the whole page theme:
FIT `#E8A722` · STRONG `#C61F1F` · FAST `#1E5BE8`
(Brand Kit lists an earlier, brighter set — `#C6F24E / #FF5B22 / #37D8F2 / #FF3D6E` — plus a
fourth SAVAGE arena. v4 ships three arenas with the muted set. **v4 wins.**)

Type: `Saira Condensed` 800 display · `Archivo Expanded` 800 wordmark · `Archivo` UI ·
`Newsreader` italic for captions. Radius 0 everywhere. Motion 420–620ms `cubic-bezier(.4,0,.2,1)`,
plus a split-flap board animation on the headline word. `prefers-reduced-motion` respected.

Photography: greyscale, `contrast(1.24) brightness(.62)`, accent flooded over in
`mix-blend-mode:color` at .72. Assets in `Beast/img/` (`fit/strong/fast.jpeg`) and
`Beast/uploads/`.

Illustration rules for the 24 animal plates (Brand Kit §02): must read as a solid silhouette at
48px; bust not full body, cropped by the frame; two ink weights (8 unit contour, 3 interior);
accent used as rim light only, never as fill; posture carries the rank, line language never
changes; bottom-tier animals are affectionate, never humiliated. Only 3 of 24 plates are drawn —
`Beast/img/animals/` has grizzly, cheetah, sloth. Missing ones fall back to a placeholder frame.

Logo: 11 SVGs in `Beast/logo/` (mark, favicon, app-icon, stamp, two lockups, five explorations).

### 4.2 Ignore `Beast/_ds/`

That folder is a complete design system for **ORIGO LVCA, a music project** — warm paper,
Cinzel, copperplate engravings. Nothing to do with this app. It is unrelated baggage in the zip.

## 5. How the current prototype scores (and what replaces it)

v4's `Component` class in the trailing `<script type="text/x-dc">` block is the whole spec for
what the API must return. Present flow:

1. Pick arena (fit / strong / fast) → sex, age, bodyweight, country, comparison scope.
2. Per metric, a mean is synthesised: `base` scaled by `(bw/75)^-bwPow`, an age factor
   (−0.6%/yr under 28, −0.72%/yr over), a female multiplier, and a scope factor
   (country .94 / region .96 / continent .98 / world 1.0).
3. z-score against a hardcoded `sd`, then `phi(z)` → percentile, clamped 0.6–99.4.
4. Metric percentiles averaged → overall.
5. Overall bucketed by `TIERS = [0,20,40,62,80,93]` → one of 6 animals per arena.
6. Result screen: animal, invented binomial (`Ursus gravis, subsp. <country>ensis`), tagline,
   percentile counter animation, world-vs-local comparison, share card, country map silhouette
   (TopoJSON from `world-atlas@2`, lazy-loaded from jsDelivr).

Barbell input accepts `weight × reps` and converts via Epley-ish `w × (1 + min(reps,12)/30)`.
Running input parses `mm:ss` / `h:mm:ss`.

**Every `base` and `sd` in that file is invented.** Replacing them with percentiles fitted from
`strength_data.csv` — and real sources for speed/endurance — is the actual point of the project.

Two structural notes for the API contract:
- The frontend needs a **percentile per metric plus an overall**, not just a single score. The
  plan's §12 `/score` response shape omits the per-metric breakdown; it should be added.
- Archetype assignment is currently a **threshold cut on one averaged number**, not clustering.
  K-Means over the 3-arena vector (plan §6 Tahap 4) is a genuinely different output and needs
  the tier ladder redesigned around it, or the two need to coexist deliberately.

## 6. Pools: what shipped, and the model that did not

Every pool on the site is a population that was **measured**. None is derived from
another. That is a narrower claim than section 6.2's original plan, and the reason is
below.

| Arena | Pools live | Backed by | n |
|---|---|---|---|
| STRONG | First-timers · Competitors | OpenPowerlifting (debut meets / all meets) | 199k · 560k |
| FAST | Marathoners | NYC Marathon 2025 finishers | 56k |
| FIT | Everyone | Korea Sports Promotion Foundation | 13k |

STRONG's two pools are a genuinely useful contrast: a 200/140/240 lifter is a **Grizzly
among first-timers (77th)** but an **Ox among all competitors**. Same lift, different room.

### 6.1 The mixture model — built, tested, rejected

The plan was to convert percentiles between pools with a two-stratum mixture: adults
either train (share `p`) or do not, so

```
pct_everyone = (1-p)*100 + p * pct_trained
```

`p` came from real data — NHANES PAQ650 vigorous recreational activity, cycles 2011-2014,
survey-weighted (n=11,976). It reproduces the published CDC figure closely: 30.7% of men
and 20.8% of women overall, falling from 54.5% of men aged 18-24 to 11.9% at 60+.

**It produces impossible numbers.** For men 30-34, `p = 43%`, which puts a hard floor at
the 57th percentile — anyone who lifts at all is instantly above 57% of adults, and the
whole competitive range is compressed into 57-100:

```
60/40/80 kg   (untrained)  ->  57th percentile
140/100/180   (decent)     ->  60th percentile     three points apart
```

Inverted for FIT it collapses the other way: everyone below the population median maps to
the 1st percentile among the trained.

The fault is a population mismatch. `p` is the share doing *vigorous recreational activity*
(43%), but the curve being converted is *competitive powerlifters* (~0.1% of adults). The
model therefore assumes 43% of adults are distributed like meet competitors.

The honest reading: there are **three** strata — untrained, trains but never competes,
competes — and the middle one, where essentially every real user sits, has no public
measured distribution. The code and these numbers are kept in `web/app.js` behind
`POOL_MIXTURE_ENABLED = false` so nobody rebuilds it from scratch.

### 6.2 Why "everyone" cannot be measured for STRONG

This is not a search failure. You cannot safely one-rep-max a random population sample,
so nobody has collected it — which is exactly why NHANES measures grip strength and
dynamometry instead. Grip correlates with total-body strength at only r ~ 0.5-0.7, enough
to validate a distribution's shape but not to convert one person's grip into a squat.

`debut_lifters()` in `data/build_reference.py` is the closest measured substitute: each
lifter's first ever meet, n=296,118, median squat 15 kg below the all-meets figure for men
and 12 kg below for women. Real, but a debut male still squats 185 kg at the median — far
above a typical gym-goer. It narrows the gap; it does not close it.

### 6.3 Routes to a real general-population pool

1. **Published norm tables.** ACSM / Cooper Institute publish general-population 1RM bench
   press ratios by age and sex. Aggregate tables rather than row-level data, so a step down
   in quality from everything else here — but real, peer-reviewed and citable, unlike the
   placeholders in section 3.
2. **Collect it.** Every submission to the site is a general-population strength
   observation. This is already Fase F of the plan, and it is the only route that ends with
   a first-party measured distribution nobody else has.

Recommend both: 1 to launch, 2 to replace it.

### 6.4 FIT metrics

Sit-ups and standing broad jump, both from KSPO, both user-measurable with no equipment.
Push-ups and pull-ups were dropped: two searches across HuggingFace, GitHub and CDC found
no row-level public data for either. NHANES does not test them. They can be added from
published ACSM tables under the same caveat as 6.3.1.

## 7. Open decisions — need your call

1. ~~HOWFITAMI or BEASTINDEX~~ — **decided: BEASTINDEX.**
2. **Sign off on the pool selector in §6**, and on the STRONG mixture assumption specifically.
3. ~~Real data for speed and endurance~~ — **done, NHANES + NYC Marathon.** Remaining call:
   ship FIT on placeholder tables, or hold FIT out of v1 (§6.1)?
4. **Three arenas or four?** v4 dropped SAVAGE/hybrid that the Brand Kit specifies.
5. **21 missing animal illustrations** — placeholder frames until drawn.
6. **Tier thresholds** `[0,20,40,62,80,93]` were chosen by feel. Re-derive from data, or keep?

## 8. The website

`web/` is a **static site with no backend**. `data/build_reference.py` precomputes empirical
percentile curves into `web/data/reference.json` — 21 KB — so scoring runs entirely in the
browser. No API, no CORS, no server cost, deploys to Vercel / Netlify / GitHub Pages as-is.
This replaces the FastAPI service in the plan's Tahap 3; the plan assumed live model inference,
but a lookup table is smaller, faster and cannot go down.

```
web/index.html      markup, converted from Beast/BEAST INDEX.dc.html
web/styles.css      the design system as plain CSS (palette, type, motion all preserved)
web/app.js          scoring engine, arena/pool state, result screen, share-card canvas
web/data/*.json     reference curves (21 KB) + country list (15 KB)
serve.py            local dev server -> http://127.0.0.1:4321
```

Verified working: arena flip-board, panel switching, DOTS normalisation, Epley reps-to-1RM
(180 kg x 3 -> 198 kg), per-metric percentile bars, animal tiering, country subspecies naming
("Capra obstinata, subsp. indonesensis"), percentile count-up, share-card PNG export.

Still to do: 21 of 24 animal plates are unillustrated (placeholder frames render in their
place), and the share card is a plain canvas layout rather than the Brand Kit's 1080x1350 spec.

## 9. Environment

System Python 3.9.6 has `pandas 2.3.3` and `numpy 2.0.2`.
**Missing: `scikit-learn`, `joblib`, `fastapi`, `uvicorn`.** A venv is needed before Tahap 2:

```
python3 -m venv .venv && source .venv/bin/activate
pip install pandas numpy scikit-learn joblib fastapi uvicorn pytest
```

Also worth adding a `.gitignore` — `raw/` alone is 988 MB and must never reach git.
