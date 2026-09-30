"""Meteo orario storico da Open-Meteo (gratis, senza chiave).

Due usi:

1) Trovare il giorno giusto per lo scenario (feriale, con temporale nel pomeriggio):
    python data/scripts/03_meteo.py --cerca 2025-09-01 2025-11-30
   Stampa i 10 giorni feriali con più pioggia tra le 15 e le 19.
   Scegline uno e scrivilo in config/scenario.yaml → giorno.data

2) Scaricare il meteo del giorno scelto:
    python data/scripts/03_meteo.py
   Scrive data/processed/meteo.csv (formato in docs/formati-dati.md, sezione 3).
"""
import argparse
import datetime as dt

import pandas as pd
import requests

from comune import LAT_RIF, LON_RIF, PROCESSED, leggi_scenario

URL = "https://archive-api.open-meteo.com/v1/archive"


def scarica(inizio: str, fine: str) -> pd.DataFrame:
    parametri = {
        "latitude": LAT_RIF, "longitude": LON_RIF,
        "start_date": inizio, "end_date": fine,
        "hourly": "precipitation,cloud_cover",
        "timezone": "Europe/Rome",
    }
    r = requests.get(URL, params=parametri, timeout=60)
    r.raise_for_status()
    h = r.json()["hourly"]
    df = pd.DataFrame({"tempo": pd.to_datetime(h["time"]),
                       "pioggia_mm": h["precipitation"],
                       "nuvolosita_pct": h["cloud_cover"]})
    return df


def cerca(inizio: str, fine: str):
    df = scarica(inizio, fine)
    df["giorno"] = df["tempo"].dt.date
    pomeriggio = df[df["tempo"].dt.hour.between(15, 18)]
    somma = pomeriggio.groupby("giorno")["pioggia_mm"].sum()
    feriali = somma[[pd.Timestamp(g).weekday() < 5 for g in somma.index]]
    print("Giorni feriali con più pioggia tra le 15 e le 19 (mm):")
    print(feriali.sort_values(ascending=False).head(10).round(1).to_string())


def giorno_scenario():
    data = leggi_scenario()["giorno"]["data"]
    try:
        dt.date.fromisoformat(data)
    except ValueError:
        raise SystemExit(f"Data non valida in config/scenario.yaml: {data!r}. "
                         "Prima lancia con --cerca e scegli un giorno.")
    df = scarica(data, data)
    df["ora"] = df["tempo"].dt.strftime("%H:%M")
    df["visibilita_m"] = ""   # l'archivio non ha la visibilità: resta vuota
    PROCESSED.mkdir(parents=True, exist_ok=True)
    df[["ora", "pioggia_mm", "visibilita_m", "nuvolosita_pct"]].to_csv(PROCESSED / "meteo.csv", index=False)
    print(f"Scritto {PROCESSED / 'meteo.csv'}")
    print(df[["ora", "pioggia_mm", "nuvolosita_pct"]].iloc[13:20].to_string(index=False))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--cerca", nargs=2, metavar=("INIZIO", "FINE"))
    a = p.parse_args()
    cerca(*a.cerca) if a.cerca else giorno_scenario()
