"""Funzioni condivise dagli script dei dati: percorsi e lettura della configurazione."""
from pathlib import Path

import yaml

RADICE = Path(__file__).resolve().parents[2]
RAW = RADICE / "data" / "raw"
PROCESSED = RADICE / "data" / "processed"
CONFIG = RADICE / "config"

# Coordinate di riferimento per sole e meteo (centro dell'area, circa Ponte Garibaldi)
LAT_RIF = 41.893
LON_RIF = 12.470


def leggi_scenario() -> dict:
    with open(CONFIG / "scenario.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def leggi_pesi() -> dict:
    with open(CONFIG / "pesi_rischio.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def riquadro() -> tuple:
    """(lon_min, lat_min, lon_max, lat_max), il formato che usa osmnx 2."""
    return tuple(leggi_scenario()["area"]["riquadro"])


def minuti(hhmm: str) -> int:
    h, m = hhmm.split(":")[:2]
    return int(h) * 60 + int(m)


def hhmm(minuti_tot: int) -> str:
    return f"{minuti_tot // 60:02d}:{minuti_tot % 60:02d}"
