#!/usr/bin/env python3
"""
BEASTINDEX — real reference data downloader.

Replaces the hand-typed percentile tables in download_datasets.py with measured
data from public sources. Nothing here is invented; every file is fetched.

  NHANES (CDC)        general-population anchor — nationally representative US sample
    CVX  1999-2004      measured VO2max (treadmill submaximal test)   n≈5,400
    MGX  2011-2014      measured grip strength                        n≈10,400
    DEMO/BMX            age, sex, bodyweight, height for the merge
  NYC Marathon 2025   mass-participation race results                 n≈56,500

Run:  python3 data/download_real_sources.py
"""
import os, sys, urllib.request, concurrent.futures
from pathlib import Path

BASE = Path(__file__).resolve().parent
NHANES = BASE / "raw" / "nhanes"; NHANES.mkdir(parents=True, exist_ok=True)
RUNNING = BASE / "raw" / "running"; RUNNING.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "Mozilla/5.0"}
CDC = "https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/{year}/DataFiles/{name}.xpt"

# (start-year-of-cycle, filename). CVX only exists for 1999-2004; MGX for 2011-2014.
NHANES_FILES = [
    ("1999", "CVX"),   ("2001", "CVX_B"),  ("2003", "CVX_C"),    # VO2max
    ("2011", "MGX_G"), ("2013", "MGX_H"),                        # grip strength
    ("1999", "DEMO"),  ("2001", "DEMO_B"), ("2003", "DEMO_C"),   # age / sex
    ("2011", "DEMO_G"),("2013", "DEMO_H"),
    ("1999", "BMX"),   ("2001", "BMX_B"),  ("2003", "BMX_C"),    # weight / height
    ("2011", "BMX_G"), ("2013", "BMX_H"),
]

NYC_URL = ("https://huggingface.co/datasets/donaldye8812/nyc-2025-marathon-splits/"
           "resolve/main/nyrr_marathon_2025_summary_56480_runners_WITH_SPLITS.csv")


def fetch(url, dest, timeout=300):
    if dest.exists():
        return f"  cached  {dest.name} ({dest.stat().st_size/1e6:.1f} MB)"
    try:
        req = urllib.request.Request(url, headers=UA)
        data = urllib.request.urlopen(req, timeout=timeout).read()
        dest.write_bytes(data)
        return f"  ok      {dest.name} ({len(data)/1e6:.1f} MB)"
    except Exception as e:
        return f"  FAILED  {dest.name} — {str(e)[:70]}"


def main():
    print("\n=== NHANES (CDC) — general-population anchor ===")
    jobs = [(CDC.format(year=y, name=n), NHANES / f"{n}.xpt") for y, n in NHANES_FILES]
    with concurrent.futures.ThreadPoolExecutor(6) as ex:
        for line in ex.map(lambda a: fetch(*a), jobs):
            print(line)

    print("\n=== NYC Marathon 2025 — mass-participation race results ===")
    print(fetch(NYC_URL, RUNNING / "nyc_marathon_2025.csv"))

    print("\nNote: OpenPowerlifting is handled by download_datasets.py.")
    print("The running_norms.json / fitness_norms.json in processed/ are hand-typed")
    print("placeholders — see README section 3. Do not treat them as measured data.\n")


if __name__ == "__main__":
    main()
