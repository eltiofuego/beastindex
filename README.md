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

## 6. The population problem — recommendation

**Don't pick one population. Make the comparison pool a visible control, and default it to
"everyone".**

The design already ships this pattern: v4/BEAST INDEX has a scope selector for
country / region / continent / world. Add a second axis — *who* you are measured against —
and the biggest correctness risk in the project turns into its most shareable feature.

| Pool | Backed by | What it means |
|---|---|---|
| **Everyone** *(default)* | NHANES, measured, nationally representative | All adults, trained or not |
| **People who train** | OPL lower quartile as proxy | Regular gym-goers |
| **Competitors** | OpenPowerlifting / NYC Marathon finishers | People who enter meets and races |

Why this and not the alternatives:

- **It is honest.** Every number is traceable to a named dataset. No blend that we would have
  to hand-wave about on the methodology page.
- **The contrast is the product.** The same 140 kg deadlift makes you a Grizzly among everyone
  and a House Cat among competitors. That gap is funny, true, and screenshot-worthy — it is
  free content, and it gives the user a reason to move the control.
- **No redesign.** It reuses a control the UI already has, in the same visual language.
- **The ladder stays meaningful.** Compare everyone against competitive lifters only and ~90%
  of visitors are Sloths and House Cats forever. Six ranks collapse into two.

Default to **Everyone**, because a first-time visitor is a normal person and telling them they
are bottom-1% is how you lose them in five seconds. "Competitors" is the opt-in flex.

### 6.1 How each arena bridges the two anchors

**FAST — clean end to end.** NHANES VO2max converts to predicted race times through the
Daniels/Gilbert VDOT relationship, which is peer-reviewed and standard in coaching. NYC Marathon
gives the competitive tail as measured finish times. The two overlap in the middle, so they can
be fitted into one continuous distribution and cross-checked against each other. No invented
numbers anywhere in this path.

**STRONG — one modelling assumption, and it needs to be documented.** OPL gives the competitive
tail directly and it is excellent. The problem is the general-population end: NHANES measures
**grip**, not barbell lifts, and grip-to-total-body-strength correlates around r ≈ 0.5–0.7 in
the literature. That is strong enough to validate the *shape and spread* of a distribution, but
not to convert one person's grip into a squat 1RM — anyone claiming otherwise is guessing.

Recommended instead: a **participation-weighted mixture**. Take the published share of adults
who actually strength-train (CDC/NHIS reports it), give the untrained majority a distribution
anchored on published civilian 1RM norms, and let OPL own the trained tail. Use the NHANES grip
data to sanity-check the resulting spread rather than to generate it. This is the single place
in the project with a real assumption in it, and it belongs on the methodology page in plain
language, not buried.

**FIT — still unsolved.** NHANES does not measure push-ups, pull-ups or sit-ups, and no credible
public microdata set for them turned up. The real options are US Army ACFT/APFT percentile
tables (official and published, but aggregate tables rather than row-level data), or launching
FIT labelled as "published norms, beta" while STRONG and FAST carry the data-backed claim.
My suggestion: **launch with STRONG and FAST**, and hold FIT until it can meet the same bar.
Two arenas that are true beat three where one is decoration.

## 7. Open decisions — need your call

1. ~~HOWFITAMI or BEASTINDEX~~ — **decided: BEASTINDEX.**
2. **Sign off on the pool selector in §6**, and on the STRONG mixture assumption specifically.
3. ~~Real data for speed and endurance~~ — **done, NHANES + NYC Marathon.** Remaining call:
   ship FIT on placeholder tables, or hold FIT out of v1 (§6.1)?
4. **Three arenas or four?** v4 dropped SAVAGE/hybrid that the Brand Kit specifies.
5. **21 missing animal illustrations** — placeholder frames until drawn.
6. **Tier thresholds** `[0,20,40,62,80,93]` were chosen by feel. Re-derive from data, or keep?

## 8. Environment

System Python 3.9.6 has `pandas 2.3.3` and `numpy 2.0.2`.
**Missing: `scikit-learn`, `joblib`, `fastapi`, `uvicorn`.** A venv is needed before Tahap 2:

```
python3 -m venv .venv && source .venv/bin/activate
pip install pandas numpy scikit-learn joblib fastapi uvicorn pytest
```

Also worth adding a `.gitignore` — `raw/` alone is 988 MB and must never reach git.
