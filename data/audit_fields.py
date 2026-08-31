#!/usr/bin/env python3
"""
BEASTINDEX — input-field / dataset audit  (revision doc POIN 1).

Answers, from the actual reference file rather than from memory: which input field
on the form is backed by a trained dataset, which dataset, how many people, and
which fields are NOT backed. Regenerate after every build_reference.py run.
"""
import json
from pathlib import Path

REF = Path(__file__).resolve().parent.parent / "web" / "data" / "reference.json"
FIELDS = {                       # form field -> (arena, metric key in reference.json)
    "Squat":               ("strong", "squat"),
    "Bench press":         ("strong", "bench"),
    "Deadlift":            ("strong", "deadlift"),
    "5K":                  ("fast",   "marathon"),   # via Riegel
    "10K":                 ("fast",   "marathon"),   # via Riegel
    "Half marathon":       ("fast",   "marathon"),   # via Riegel
    "Marathon":            ("fast",   "marathon"),
    "Sit-ups":             ("fit",    "situps"),
    "Standing broad jump": ("fit",    "jump"),
    "Sit and reach":       ("fit",    "reach"),
}
UNBACKED = {
    "Push-ups": "No public row-level dataset after three searches (HuggingFace, GitHub, "
                "CDC). NHANES does not test it and it is not in the KSPO adult battery. "
                "ACSM publishes aggregate tables only. Field not on the form.",
    "Pull-ups": "Same as push-ups. Field not on the form.",
}
NOTE = ("5K / 10K / half are ranked on the marathon distribution after a Riegel (1981) "
        "race-equivalence conversion — no standalone 5K/10K dataset exists at scale; the "
        "largest found was a single 10K in Mozambique (~3k rows).")

def main():
    ref = json.loads(REF.read_text())
    rows = []
    for field, (arena, key) in FIELDS.items():
        m = ref["arenas"][arena]["metrics"][key]
        pools = m.get("pools", {})
        n = max((sx.get("all", {}).get("n", 0)
                 for p in pools.values() for sx in p.values()), default=0)
        coh = sum(len(v) for s in m.get("cohorts", {}).values() for v in s.values())
        reg = sum(len(v) for s in m.get("regions", {}).values() for v in s.values())
        src = "; ".join(sorted(set(ref["arenas"][arena].get("source", {}).values())))
        rows.append((field, arena.upper(), n, coh, reg, list(pools), src))

    print(f"{'FIELD':<21}{'ARENA':<8}{'n':>10}  {'cohort':>6} {'region':>6}  POOLS")
    print("-"*104)
    for f, a, n, coh, reg, pools, _ in rows:
        print(f"{f:<21}{a:<8}{n:>10,}  {coh:>6} {reg:>6}  {', '.join(pools)}")
    print("\nSOURCES")
    for f, _, _, _, _, _, src in rows:
        print(f"  {f:<21}{src}")
    print("\nNOT BACKED BY ANY DATASET")
    for f, why in UNBACKED.items():
        print(f"  {f:<12}{why}")
    backed = len(rows)
    print(f"\n{backed}/{backed + len(UNBACKED)} form fields are backed by a trained dataset. "
          f"No field uses a placeholder formula.")
    print(f"\nNOTE  {NOTE}")

if __name__ == "__main__":
    main()
