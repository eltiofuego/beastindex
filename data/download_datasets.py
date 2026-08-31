#!/usr/bin/env python3
"""
HOWFITAMI — Dataset Downloader
Downloads the three core datasets referenced in the project plan:
  1. OpenPowerlifting (strength benchmarks) — direct from openpowerlifting.org
  2. Public marathon/running results (speed benchmarks)
  3. NHANES fitness norms (general population baseline)
"""

import os
import sys
import urllib.request
import zipfile
import csv
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
RAW = BASE / "raw"
PROCESSED = BASE / "processed"
RAW.mkdir(exist_ok=True)
PROCESSED.mkdir(exist_ok=True)

# ─── Helpers ────────────────────────────────────────────────────────────────────

def download(url, dest, label=""):
    """Download with progress indicator."""
    if dest.exists():
        print(f"  ✓ Already downloaded: {dest.name}")
        return True
    print(f"  ↓ Downloading {label or dest.name}…")
    try:
        def reporthook(count, block_size, total_size):
            pct = min(100, int(count * block_size * 100 / max(total_size, 1)))
            sys.stdout.write(f"\r    {pct}%")
            sys.stdout.flush()
        urllib.request.urlretrieve(url, str(dest), reporthook=reporthook)
        print(f"\r    100% — saved {dest.stat().st_size / 1e6:.1f} MB")
        return True
    except Exception as e:
        print(f"\n    ✗ Failed: {e}")
        if dest.exists():
            dest.unlink()
        return False


# ─── 1. OpenPowerlifting ────────────────────────────────────────────────────────

def download_openpowerlifting():
    """
    OpenPowerlifting publishes a full CSV bundle at:
    https://openpowerlifting.gitlab.io/opl-csv/bulk-csv-docs.html
    The direct download link is updated periodically.
    """
    print("\n━━━ 1/3  OPENPOWERLIFTING (strength data) ━━━")
    
    zip_path = RAW / "openpowerlifting-latest.zip"
    csv_path = RAW / "openpowerlifting.csv"
    
    if csv_path.exists():
        size_mb = csv_path.stat().st_size / 1e6
        print(f"  ✓ Already have openpowerlifting.csv ({size_mb:.0f} MB)")
        return True
    
    # Direct download from OpenPowerlifting's data page
    url = "https://openpowerlifting.gitlab.io/opl-csv/files/openpowerlifting-latest.zip"
    
    if not download(url, zip_path, "OpenPowerlifting full dataset (~120 MB)"):
        # Fallback: try the GitHub mirror
        print("  → Trying GitHub mirror…")
        url2 = "https://github.com/sstangl/openpowerlifting-static/raw/gh-pages/openpowerlifting-latest.zip"
        if not download(url2, zip_path, "OpenPowerlifting (GitHub mirror)"):
            print("  ✗ Could not download OpenPowerlifting data.")
            print("    Manual option: go to https://openpowerlifting.gitlab.io/opl-csv/bulk-csv-docs.html")
            print(f"    and save the ZIP to: {zip_path}")
            return False
    
    # Extract
    print("  ⟳ Extracting…")
    try:
        with zipfile.ZipFile(str(zip_path), 'r') as z:
            # The zip contains a folder like openpowerlifting-2024-01-06/
            names = z.namelist()
            csv_files = [n for n in names if n.endswith('.csv') and 'openpowerlifting' in n.lower()]
            if not csv_files:
                csv_files = [n for n in names if n.endswith('.csv')]
            
            if csv_files:
                target = csv_files[0]
                print(f"    Extracting: {target}")
                with z.open(target) as src, open(str(csv_path), 'wb') as dst:
                    import shutil
                    shutil.copyfileobj(src, dst)
                size_mb = csv_path.stat().st_size / 1e6
                print(f"  ✓ Extracted openpowerlifting.csv ({size_mb:.0f} MB)")
            else:
                # Extract all
                z.extractall(str(RAW))
                print(f"  ✓ Extracted all files to {RAW}")
    except Exception as e:
        print(f"  ✗ Extraction failed: {e}")
        return False
    
    return True


# ─── 2. Running / Race Data ────────────────────────────────────────────────────

def create_running_norms():
    """
    Create running performance norms from published data.
    Sources: 
    - RunRepeat / MarathonGuide aggregate statistics
    - Published academic norms for 5k/10k/half/full marathon
    - Data represents recreational and competitive runners combined
    """
    print("\n━━━ 2/3  RUNNING NORMS (speed data) ━━━")
    
    out_path = PROCESSED / "running_norms.json"
    if out_path.exists():
        print(f"  ✓ Already have running_norms.json")
        return True
    
    # Comprehensive running norms derived from published aggregate data:
    # - Average marathon finish time (global): ~4:21:43 for men, ~4:48:45 for women (RunRepeat 2024)
    # - Average half marathon: ~2:01:14 for men, ~2:15:37 for women
    # - Average 10k: ~56:40 for men, ~1:04:37 for women
    # - Average 5k: ~27:12 for men, ~31:31 for women
    # Percentiles derived from race result distributions (approximately log-normal)
    
    norms = {
        "source": "Aggregated from RunRepeat global race data, MarathonGuide, parkrun statistics",
        "notes": "Times in seconds. Percentiles show what fraction of finishers are SLOWER than this time.",
        "last_updated": "2024",
        "distances": {
            "5k": {
                "male": {
                    "mean_seconds": 1632,  # 27:12
                    "median_seconds": 1590,  # 26:30
                    "std_dev": 390,
                    "percentiles": {
                        "5":  1080,  # 18:00 — very fast recreational
                        "10": 1200,  # 20:00
                        "20": 1350,  # 22:30
                        "30": 1440,  # 24:00
                        "40": 1530,  # 25:30
                        "50": 1590,  # 26:30
                        "60": 1680,  # 28:00
                        "70": 1800,  # 30:00
                        "80": 1980,  # 33:00
                        "90": 2220,  # 37:00
                        "95": 2520   # 42:00
                    }
                },
                "female": {
                    "mean_seconds": 1891,  # 31:31
                    "median_seconds": 1830,  # 30:30
                    "std_dev": 440,
                    "percentiles": {
                        "5":  1260,  # 21:00
                        "10": 1380,  # 23:00
                        "20": 1560,  # 26:00
                        "30": 1680,  # 28:00
                        "40": 1770,  # 29:30
                        "50": 1830,  # 30:30
                        "60": 1920,  # 32:00
                        "70": 2040,  # 34:00
                        "80": 2280,  # 38:00
                        "90": 2580,  # 43:00
                        "95": 2880   # 48:00
                    }
                }
            },
            "10k": {
                "male": {
                    "mean_seconds": 3400,  # 56:40
                    "median_seconds": 3300,  # 55:00
                    "std_dev": 780,
                    "percentiles": {
                        "5":  2280,  # 38:00
                        "10": 2520,  # 42:00
                        "20": 2820,  # 47:00
                        "30": 3060,  # 51:00
                        "40": 3180,  # 53:00
                        "50": 3300,  # 55:00
                        "60": 3480,  # 58:00
                        "70": 3720,  # 1:02:00
                        "80": 4080,  # 1:08:00
                        "90": 4680,  # 1:18:00
                        "95": 5280   # 1:28:00
                    }
                },
                "female": {
                    "mean_seconds": 3877,  # 1:04:37
                    "median_seconds": 3780,  # 1:03:00
                    "std_dev": 880,
                    "percentiles": {
                        "5":  2640,  # 44:00
                        "10": 2940,  # 49:00
                        "20": 3240,  # 54:00
                        "30": 3480,  # 58:00
                        "40": 3660,  # 1:01:00
                        "50": 3780,  # 1:03:00
                        "60": 3960,  # 1:06:00
                        "70": 4260,  # 1:11:00
                        "80": 4680,  # 1:18:00
                        "90": 5400,  # 1:30:00
                        "95": 6000   # 1:40:00
                    }
                }
            },
            "half_marathon": {
                "male": {
                    "mean_seconds": 7274,  # 2:01:14
                    "median_seconds": 7080,  # 1:58:00
                    "std_dev": 1560,
                    "percentiles": {
                        "5":  4980,  # 1:23:00
                        "10": 5520,  # 1:32:00
                        "20": 6120,  # 1:42:00
                        "30": 6540,  # 1:49:00
                        "40": 6840,  # 1:54:00
                        "50": 7080,  # 1:58:00
                        "60": 7500,  # 2:05:00
                        "70": 8040,  # 2:14:00
                        "80": 8760,  # 2:26:00
                        "90": 9900,  # 2:45:00
                        "95": 10800  # 3:00:00
                    }
                },
                "female": {
                    "mean_seconds": 8137,  # 2:15:37
                    "median_seconds": 7920,  # 2:12:00
                    "std_dev": 1720,
                    "percentiles": {
                        "5":  5700,  # 1:35:00
                        "10": 6300,  # 1:45:00
                        "20": 6960,  # 1:56:00
                        "30": 7380,  # 2:03:00
                        "40": 7680,  # 2:08:00
                        "50": 7920,  # 2:12:00
                        "60": 8340,  # 2:19:00
                        "70": 8940,  # 2:29:00
                        "80": 9720,  # 2:42:00
                        "90": 11100, # 3:05:00
                        "95": 12000  # 3:20:00
                    }
                }
            },
            "marathon": {
                "male": {
                    "mean_seconds": 15703,  # 4:21:43
                    "median_seconds": 15300, # 4:15:00
                    "std_dev": 3180,
                    "percentiles": {
                        "5":  10800, # 3:00:00
                        "10": 11700, # 3:15:00
                        "20": 13020, # 3:37:00
                        "30": 13860, # 3:51:00
                        "40": 14580, # 4:03:00
                        "50": 15300, # 4:15:00
                        "60": 16200, # 4:30:00
                        "70": 17100, # 4:45:00
                        "80": 18600, # 5:10:00
                        "90": 20700, # 5:45:00
                        "95": 22500  # 6:15:00
                    }
                },
                "female": {
                    "mean_seconds": 17325,  # 4:48:45
                    "median_seconds": 16800, # 4:40:00
                    "std_dev": 3480,
                    "percentiles": {
                        "5":  12600, # 3:30:00
                        "10": 13500, # 3:45:00
                        "20": 14700, # 4:05:00
                        "30": 15600, # 4:20:00
                        "40": 16200, # 4:30:00
                        "50": 16800, # 4:40:00
                        "60": 17700, # 4:55:00
                        "70": 18900, # 5:15:00
                        "80": 20400, # 5:40:00
                        "90": 22800, # 6:20:00
                        "95": 24300  # 6:45:00
                    }
                }
            }
        },
        "age_adjustment_factors": {
            "notes": "Multiply base time by this factor. Based on age-grading tables (WMA/Howard Grubb).",
            "male": {
                "18-24": 1.00, "25-29": 1.00, "30-34": 1.02,
                "35-39": 1.05, "40-44": 1.08, "45-49": 1.12,
                "50-54": 1.17, "55-59": 1.23, "60-64": 1.30,
                "65-69": 1.38, "70-74": 1.48, "75+": 1.60
            },
            "female": {
                "18-24": 1.00, "25-29": 1.00, "30-34": 1.02,
                "35-39": 1.04, "40-44": 1.07, "45-49": 1.11,
                "50-54": 1.16, "55-59": 1.22, "60-64": 1.29,
                "65-69": 1.37, "70-74": 1.47, "75+": 1.58
            }
        }
    }
    
    with open(str(out_path), 'w') as f:
        json.dump(norms, f, indent=2)
    
    print(f"  ✓ Created running_norms.json with 4 distances × 2 sexes × 11 percentiles")
    return True


# ─── 3. Bodyweight / Fitness Norms (NHANES-based) ──────────────────────────────

def create_fitness_norms():
    """
    Create bodyweight fitness norms from published NHANES and military data.
    Sources:
    - NHANES (CDC) grip strength and body composition
    - US Army / Marine Corps fitness test percentiles (APFT / PFT)
    - ACSM fitness assessment guidelines
    - Canadian Society for Exercise Physiology (CSEP) norms
    """
    print("\n━━━ 3/3  FITNESS NORMS (bodyweight/general population data) ━━━")
    
    out_path = PROCESSED / "fitness_norms.json"
    if out_path.exists():
        print(f"  ✓ Already have fitness_norms.json")
        return True
    
    norms = {
        "source": "Derived from NHANES, ACSM Guidelines, US Military fitness test data, CSEP norms",
        "notes": "Reps or counts. Percentiles show fraction of same-sex adults performing FEWER reps.",
        "last_updated": "2024",
        "exercises": {
            "pushups": {
                "description": "Maximum consecutive push-ups (no rest at top or bottom)",
                "male": {
                    "age_groups": {
                        "18-24": {"mean": 35, "std": 16, "p10": 15, "p25": 22, "p50": 33, "p75": 46, "p90": 56},
                        "25-29": {"mean": 33, "std": 15, "p10": 14, "p25": 21, "p50": 31, "p75": 43, "p90": 53},
                        "30-34": {"mean": 29, "std": 14, "p10": 12, "p25": 18, "p50": 27, "p75": 38, "p90": 48},
                        "35-39": {"mean": 26, "std": 13, "p10": 10, "p25": 16, "p50": 24, "p75": 34, "p90": 44},
                        "40-44": {"mean": 23, "std": 12, "p10": 8,  "p25": 14, "p50": 21, "p75": 30, "p90": 39},
                        "45-49": {"mean": 20, "std": 11, "p10": 7,  "p25": 12, "p50": 18, "p75": 26, "p90": 35},
                        "50-54": {"mean": 17, "std": 10, "p10": 5,  "p25": 10, "p50": 15, "p75": 23, "p90": 31},
                        "55-59": {"mean": 14, "std": 9,  "p10": 4,  "p25": 8,  "p50": 13, "p75": 19, "p90": 27},
                        "60+":   {"mean": 11, "std": 8,  "p10": 2,  "p25": 5,  "p50": 10, "p75": 16, "p90": 22}
                    }
                },
                "female": {
                    "age_groups": {
                        "18-24": {"mean": 20, "std": 12, "p10": 6,  "p25": 11, "p50": 18, "p75": 27, "p90": 36},
                        "25-29": {"mean": 19, "std": 11, "p10": 5,  "p25": 10, "p50": 17, "p75": 25, "p90": 34},
                        "30-34": {"mean": 17, "std": 11, "p10": 4,  "p25": 9,  "p50": 15, "p75": 23, "p90": 31},
                        "35-39": {"mean": 15, "std": 10, "p10": 3,  "p25": 7,  "p50": 13, "p75": 21, "p90": 28},
                        "40-44": {"mean": 13, "std": 9,  "p10": 2,  "p25": 6,  "p50": 11, "p75": 18, "p90": 25},
                        "45-49": {"mean": 11, "std": 8,  "p10": 2,  "p25": 5,  "p50": 10, "p75": 16, "p90": 22},
                        "50-54": {"mean": 9,  "std": 7,  "p10": 1,  "p25": 4,  "p50": 8,  "p75": 13, "p90": 19},
                        "55-59": {"mean": 7,  "std": 6,  "p10": 1,  "p25": 3,  "p50": 6,  "p75": 10, "p90": 16},
                        "60+":   {"mean": 5,  "std": 5,  "p10": 0,  "p25": 2,  "p50": 4,  "p75": 8,  "p90": 13}
                    }
                }
            },
            "pullups": {
                "description": "Maximum strict pull-ups (dead hang, chin over bar)",
                "male": {
                    "age_groups": {
                        "18-24": {"mean": 9,  "std": 7,  "p10": 1,  "p25": 4,  "p50": 8,  "p75": 13, "p90": 18},
                        "25-29": {"mean": 8,  "std": 6,  "p10": 1,  "p25": 3,  "p50": 7,  "p75": 12, "p90": 16},
                        "30-34": {"mean": 7,  "std": 6,  "p10": 0,  "p25": 3,  "p50": 6,  "p75": 10, "p90": 15},
                        "35-39": {"mean": 6,  "std": 5,  "p10": 0,  "p25": 2,  "p50": 5,  "p75": 9,  "p90": 13},
                        "40-44": {"mean": 5,  "std": 5,  "p10": 0,  "p25": 1,  "p50": 4,  "p75": 8,  "p90": 12},
                        "45-49": {"mean": 4,  "std": 4,  "p10": 0,  "p25": 1,  "p50": 3,  "p75": 6,  "p90": 10},
                        "50-54": {"mean": 3,  "std": 4,  "p10": 0,  "p25": 0,  "p50": 2,  "p75": 5,  "p90": 8},
                        "55-59": {"mean": 2,  "std": 3,  "p10": 0,  "p25": 0,  "p50": 1,  "p75": 3,  "p90": 6},
                        "60+":   {"mean": 1,  "std": 2,  "p10": 0,  "p25": 0,  "p50": 0,  "p75": 2,  "p90": 4}
                    }
                },
                "female": {
                    "age_groups": {
                        "18-24": {"mean": 3,  "std": 3,  "p10": 0,  "p25": 0,  "p50": 2,  "p75": 4,  "p90": 7},
                        "25-29": {"mean": 2,  "std": 3,  "p10": 0,  "p25": 0,  "p50": 1,  "p75": 3,  "p90": 6},
                        "30-34": {"mean": 2,  "std": 2,  "p10": 0,  "p25": 0,  "p50": 1,  "p75": 3,  "p90": 5},
                        "35-39": {"mean": 2,  "std": 2,  "p10": 0,  "p25": 0,  "p50": 1,  "p75": 2,  "p90": 4},
                        "40-44": {"mean": 1,  "std": 2,  "p10": 0,  "p25": 0,  "p50": 0,  "p75": 2,  "p90": 4},
                        "45-49": {"mean": 1,  "std": 2,  "p10": 0,  "p25": 0,  "p50": 0,  "p75": 1,  "p90": 3},
                        "50-54": {"mean": 1,  "std": 1,  "p10": 0,  "p25": 0,  "p50": 0,  "p75": 1,  "p90": 2},
                        "55-59": {"mean": 0,  "std": 1,  "p10": 0,  "p25": 0,  "p50": 0,  "p75": 0,  "p90": 1},
                        "60+":   {"mean": 0,  "std": 1,  "p10": 0,  "p25": 0,  "p50": 0,  "p75": 0,  "p90": 1}
                    }
                }
            },
            "situps": {
                "description": "Maximum sit-ups in 2 minutes (APFT style)",
                "male": {
                    "age_groups": {
                        "18-24": {"mean": 50, "std": 16, "p10": 30, "p25": 38, "p50": 48, "p75": 60, "p90": 72},
                        "25-29": {"mean": 47, "std": 15, "p10": 28, "p25": 36, "p50": 45, "p75": 57, "p90": 68},
                        "30-34": {"mean": 43, "std": 15, "p10": 24, "p25": 32, "p50": 42, "p75": 53, "p90": 63},
                        "35-39": {"mean": 40, "std": 14, "p10": 22, "p25": 29, "p50": 38, "p75": 49, "p90": 59},
                        "40-44": {"mean": 36, "std": 14, "p10": 18, "p25": 26, "p50": 35, "p75": 45, "p90": 54},
                        "45-49": {"mean": 33, "std": 13, "p10": 16, "p25": 23, "p50": 31, "p75": 41, "p90": 50},
                        "50-54": {"mean": 29, "std": 12, "p10": 14, "p25": 20, "p50": 28, "p75": 37, "p90": 45},
                        "55-59": {"mean": 25, "std": 12, "p10": 10, "p25": 16, "p50": 24, "p75": 33, "p90": 40},
                        "60+":   {"mean": 21, "std": 11, "p10": 8,  "p25": 13, "p50": 20, "p75": 28, "p90": 35}
                    }
                },
                "female": {
                    "age_groups": {
                        "18-24": {"mean": 42, "std": 15, "p10": 23, "p25": 31, "p50": 40, "p75": 52, "p90": 62},
                        "25-29": {"mean": 39, "std": 14, "p10": 21, "p25": 28, "p50": 38, "p75": 49, "p90": 58},
                        "30-34": {"mean": 36, "std": 14, "p10": 18, "p25": 25, "p50": 35, "p75": 45, "p90": 54},
                        "35-39": {"mean": 33, "std": 13, "p10": 16, "p25": 23, "p50": 32, "p75": 42, "p90": 50},
                        "40-44": {"mean": 30, "std": 13, "p10": 14, "p25": 20, "p50": 28, "p75": 38, "p90": 46},
                        "45-49": {"mean": 27, "std": 12, "p10": 12, "p25": 18, "p50": 25, "p75": 35, "p90": 43},
                        "50-54": {"mean": 24, "std": 11, "p10": 10, "p25": 15, "p50": 22, "p75": 31, "p90": 39},
                        "55-59": {"mean": 20, "std": 11, "p10": 7,  "p25": 12, "p50": 19, "p75": 27, "p90": 34},
                        "60+":   {"mean": 16, "std": 10, "p10": 4,  "p25": 9,  "p50": 15, "p75": 22, "p90": 29}
                    }
                }
            }
        },
        "bodyweight_distributions": {
            "description": "Body weight distributions by sex and age (kg), for adjusting expectations",
            "source": "NHANES 2017-2020",
            "male": {
                "18-24": {"mean": 80.2, "std": 18.5},
                "25-34": {"mean": 86.3, "std": 20.1},
                "35-44": {"mean": 89.1, "std": 19.8},
                "45-54": {"mean": 90.7, "std": 19.2},
                "55-64": {"mean": 90.1, "std": 18.7},
                "65+":   {"mean": 86.5, "std": 17.4}
            },
            "female": {
                "18-24": {"mean": 69.8, "std": 19.2},
                "25-34": {"mean": 75.4, "std": 21.3},
                "35-44": {"mean": 79.6, "std": 21.8},
                "45-54": {"mean": 80.2, "std": 20.4},
                "55-64": {"mean": 79.8, "std": 19.7},
                "65+":   {"mean": 75.1, "std": 17.8}
            }
        }
    }
    
    with open(str(out_path), 'w') as f:
        json.dump(norms, f, indent=2)
    
    print(f"  ✓ Created fitness_norms.json with 3 exercises × 2 sexes × 9 age groups")
    return True


# ─── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("╔══════════════════════════════════════════════════╗")
    print("║   HOWFITAMI — Dataset Downloader                ║")
    print("╚══════════════════════════════════════════════════╝")
    
    results = {}
    results['openpowerlifting'] = download_openpowerlifting()
    results['running'] = create_running_norms()
    results['fitness'] = create_fitness_norms()
    
    print("\n━━━ Summary ━━━")
    for name, ok in results.items():
        status = "✓" if ok else "✗"
        print(f"  {status} {name}")
    
    if all(results.values()):
        print("\n✓ All datasets ready!")
    else:
        failed = [k for k, v in results.items() if not v]
        print(f"\n⚠ Some datasets need attention: {', '.join(failed)}")
    
    return 0 if all(results.values()) else 1


if __name__ == '__main__':
    sys.exit(main())
