#!/usr/bin/env python3
"""
HOWFITAMI — OpenPowerlifting Data Cleaner
Reads the raw OpenPowerlifting CSV and produces a cleaned, filtered dataset
suitable for building strength percentile models.

Output: data/processed/strength_data.csv
Columns kept: Sex, Age, BodyweightKg, Best3SquatKg, Best3BenchKg, Best3DeadliftKg, TotalKg, Dots, Equipment, Country
"""

import os
import sys
import csv
from pathlib import Path

BASE = Path(__file__).resolve().parent
RAW = BASE / "raw"
PROCESSED = BASE / "processed"
PROCESSED.mkdir(exist_ok=True)

INPUT_CSV = RAW / "openpowerlifting.csv"
OUTPUT_CSV = PROCESSED / "strength_data.csv"

# ─── Config ─────────────────────────────────────────────────────────────────────

# Only keep these columns
KEEP_COLS = [
    'Sex', 'Age', 'BodyweightKg',
    'Best3SquatKg', 'Best3BenchKg', 'Best3DeadliftKg',
    'TotalKg', 'Dots', 'Equipment', 'Country'
]

# Valid ranges for sanity filtering
VALID_RANGES = {
    'Age': (14, 90),
    'BodyweightKg': (35, 200),
    'Best3SquatKg': (20, 600),
    'Best3BenchKg': (15, 450),
    'Best3DeadliftKg': (30, 500),
    'TotalKg': (60, 1400),
}

# ─── Main ───────────────────────────────────────────────────────────────────────

def clean():
    if not INPUT_CSV.exists():
        print(f"✗ Input file not found: {INPUT_CSV}")
        print("  Run download_datasets.py first.")
        return False

    size_mb = INPUT_CSV.stat().st_size / 1e6
    print(f"Reading {INPUT_CSV.name} ({size_mb:.0f} MB)…")

    total = 0
    kept = 0
    skipped_reasons = {
        'missing_sex': 0,
        'missing_bw': 0,
        'missing_age': 0,
        'no_lifts': 0,
        'out_of_range': 0,
        'disqualified': 0,
    }

    with open(str(INPUT_CSV), 'r', encoding='utf-8') as fin:
        reader = csv.DictReader(fin)
        
        # Verify required columns exist
        available = set(reader.fieldnames or [])
        missing = [c for c in KEEP_COLS if c not in available]
        if missing:
            print(f"⚠ Missing columns: {missing}")
            print(f"  Available: {sorted(available)}")
            # Try to find close matches
            return False
        
        with open(str(OUTPUT_CSV), 'w', newline='', encoding='utf-8') as fout:
            writer = csv.DictWriter(fout, fieldnames=KEEP_COLS)
            writer.writeheader()
            
            for row in reader:
                total += 1
                if total % 500000 == 0:
                    print(f"  … processed {total:,} rows, kept {kept:,}")
                
                # Skip disqualified entries
                place = row.get('Place', '')
                if place in ('DQ', 'DD', 'NS'):
                    skipped_reasons['disqualified'] += 1
                    continue
                
                # Must have sex
                sex = row.get('Sex', '').strip()
                if sex not in ('M', 'F'):
                    skipped_reasons['missing_sex'] += 1
                    continue
                
                # Must have bodyweight
                bw_str = row.get('BodyweightKg', '').strip()
                if not bw_str:
                    skipped_reasons['missing_bw'] += 1
                    continue
                try:
                    bw = float(bw_str)
                except ValueError:
                    skipped_reasons['missing_bw'] += 1
                    continue
                
                # Age: optional but if present, filter range
                age_str = row.get('Age', '').strip()
                age = None
                if age_str:
                    try:
                        age = float(age_str)
                    except ValueError:
                        age = None
                
                if age is None:
                    # Try AgeClass as fallback
                    skipped_reasons['missing_age'] += 1
                    continue
                
                # Must have at least one lift
                sq = safe_float(row.get('Best3SquatKg', ''))
                bp = safe_float(row.get('Best3BenchKg', ''))
                dl = safe_float(row.get('Best3DeadliftKg', ''))
                
                if sq is None and bp is None and dl is None:
                    skipped_reasons['no_lifts'] += 1
                    continue
                
                # Range checks
                out_of_range = False
                checks = [
                    ('Age', age),
                    ('BodyweightKg', bw),
                    ('Best3SquatKg', sq),
                    ('Best3BenchKg', bp),
                    ('Best3DeadliftKg', dl),
                ]
                for col, val in checks:
                    if val is not None and col in VALID_RANGES:
                        lo, hi = VALID_RANGES[col]
                        if val < lo or val > hi:
                            out_of_range = True
                            break
                
                if out_of_range:
                    skipped_reasons['out_of_range'] += 1
                    continue
                
                # Build output row
                out_row = {
                    'Sex': sex,
                    'Age': f"{age:.1f}" if age else '',
                    'BodyweightKg': f"{bw:.1f}",
                    'Best3SquatKg': f"{sq:.1f}" if sq else '',
                    'Best3BenchKg': f"{bp:.1f}" if bp else '',
                    'Best3DeadliftKg': f"{dl:.1f}" if dl else '',
                    'TotalKg': row.get('TotalKg', '').strip(),
                    'Dots': row.get('Dots', '').strip(),
                    'Equipment': row.get('Equipment', '').strip(),
                    'Country': row.get('Country', '').strip(),
                }
                
                writer.writerow(out_row)
                kept += 1
    
    out_mb = OUTPUT_CSV.stat().st_size / 1e6
    print(f"\n━━━ Cleaning Complete ━━━")
    print(f"  Total rows read:    {total:>10,}")
    print(f"  Rows kept:          {kept:>10,}")
    print(f"  Rows dropped:       {total - kept:>10,}")
    print(f"  Output size:        {out_mb:.1f} MB")
    print(f"\n  Drop reasons:")
    for reason, count in sorted(skipped_reasons.items(), key=lambda x: -x[1]):
        if count > 0:
            print(f"    {reason:<20s} {count:>10,}")
    
    print(f"\n✓ Saved to: {OUTPUT_CSV}")
    return True


def safe_float(s):
    """Parse float, returning None for empty/invalid. Treat negative as None (failed lift)."""
    s = (s or '').strip()
    if not s:
        return None
    try:
        v = float(s)
        return v if v > 0 else None  # negative = failed attempt in OPL
    except ValueError:
        return None


if __name__ == '__main__':
    success = clean()
    sys.exit(0 if success else 1)
