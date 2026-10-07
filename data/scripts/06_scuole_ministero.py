"""Scuole dall'anagrafe ufficiale del Ministero dell'Istruzione (dati aperti), geolocalizzate dall'indirizzo.

Uso:
    python data/scripts/06_scuole_ministero.py

Perché: nel rilievo in strada 3 scuole su 4 viste lungo le vie non erano in OpenStreetMap.
L'anagrafe del Ministero (statali e paritarie) è completa ma non ha coordinate: le ricaviamo
dall'indirizzo con Nominatim (il geocodificatore di OpenStreetMap, una richiesta al secondo).
I risultati restano in data/raw/geocodifica_scuole.json, così una seconda esecuzione è immediata.

Output: data/processed/scuole.geojson (lo usa 02_costruisci_tratti.py insieme alle scuole OSM).
"""
import io
import json
import re
import time

import geopandas as gpd
import pandas as pd
import requests
from shapely.geometry import Point, box

from comune import PROCESSED, RAW, riquadro

FONTI = {
    "statale": "https://dati.istruzione.it/opendata/opendata/catalogo/elements1/SCUANAGRAFESTAT20252620250901.csv",
    "paritaria": "https://dati.istruzione.it/opendata/opendata/catalogo/elements1/SCUANAGRAFEPAR20252620250901.csv",
}
# Codici postali che coprono l'area della demo (Prati, Borgo, Trastevere, centro storico ovest)
CAP_AREA = {"00186", "00192", "00193", "00195", "00153", "00165", "00120"}
CACHE = RAW / "geocodifica_scuole.json"
NOMINATIM = "https://nominatim.openstreetmap.org/search"


ABBREVIAZIONI = {r"\bP\.?ZZA\b": "PIAZZA", r"\bP\.?LE\b": "PIAZZALE", r"\bV\.?LE\b": "VIALE",
                 r"\bL\.?GO\b": "LARGO", r"\bLUNGOTEV\.?\b": "LUNGOTEVERE", r"\bC\.?SO\b": "CORSO"}


def varianti(indirizzo: str) -> list:
    """L'indirizzo così com'è, poi senza abbreviazioni, iniziali e "ROMA" finale, poi con S. = San/Santa/Santo."""
    pulito = re.sub(r"\s+ROMA$", "", indirizzo.upper().strip())
    for abbr, intero in ABBREVIAZIONI.items():
        pulito = re.sub(abbr, intero, pulito)
    pulito = re.sub(r"\b(?!S\.)([A-Z]\.)+(?=\s*[A-Z])", "", pulito).replace("  ", " ").strip()   # G.L.BERNINI → BERNINI
    out = [indirizzo, pulito]
    if re.search(r"\bS\.\s*", pulito):
        out += [re.sub(r"\bS\.\s*", santo + " ", pulito) for santo in ("SAN", "SANTA", "SANTO", "SANT'")]
    return list(dict.fromkeys(out))


def chiedi(params: dict):
    r = requests.get(NOMINATIM, timeout=30, headers={"User-Agent": "AttentionGrid/1.0 (hackathon)"},
                     params={**params, "format": "json", "limit": 1, "countrycodes": "it"})
    r.raise_for_status()
    time.sleep(1.1)                          # regola d'uso di Nominatim: al massimo una richiesta al secondo
    trovati = r.json()
    return [float(trovati[0]["lat"]), float(trovati[0]["lon"])] if trovati else None


def geocodifica(indirizzo: str, cap: str, cache: dict):
    chiave = f"{indirizzo}|{cap}"
    if cache.get(chiave) is None:
        for v in varianti(indirizzo):
            cache[chiave] = chiedi({"street": v, "postalcode": cap, "city": "Roma"}) or chiedi({"q": f"{v}, {cap} Roma"})
            if cache[chiave]:
                break
    return cache[chiave]


def main():
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    righe = []
    for tipo, url in FONTI.items():
        d = pd.read_csv(io.StringIO(requests.get(url, timeout=120).text), dtype=str)
        d = d[(d["DESCRIZIONECOMUNE"] == "ROMA") & d["CAPSCUOLA"].isin(CAP_AREA)]
        # niente corsi serali per adulti: non hanno l'uscita delle 16
        d = d[~d["DENOMINAZIONESCUOLA"].str.contains("SERALE|PERCORSO|CPIA|ADULTI", case=False, na=False)]
        for r in d.itertuples():
            righe.append({"codice": r.CODICESCUOLA, "nome": r.DENOMINAZIONESCUOLA.strip(), "tipo": tipo,
                          "grado": r.DESCRIZIONETIPOLOGIAGRADOISTRUZIONESCUOLA,
                          "indirizzo": r.INDIRIZZOSCUOLA.strip(), "cap": r.CAPSCUOLA})
    print(f"{len(righe)} scuole nei CAP dell'area; geolocalizzo gli indirizzi…")
    try:
        for r in righe:
            pos = geocodifica(r["indirizzo"], r["cap"], cache)
            r["geometry"] = Point(pos[1], pos[0]) if pos else None
    finally:
        RAW.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0))

    trovate = [r for r in righe if r["geometry"] is not None]
    g = gpd.GeoDataFrame(trovate, crs="EPSG:4326")
    # anche le scuole poco oltre il bordo (≈150 m): influenzano le strade al confine dell'area
    g = g[g.within(box(*riquadro()).buffer(0.002))].drop_duplicates(subset=["indirizzo", "cap"])
    g.to_file(PROCESSED / "scuole.geojson", driver="GeoJSON")
    print(f"Geolocalizzate {len(trovate)} su {len(righe)}; {len(g)} sedi dentro l'area → {PROCESSED / 'scuole.geojson'}")


if __name__ == "__main__":
    main()
