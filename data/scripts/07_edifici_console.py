"""Edifici per la mappa 3D della console: pianta semplificata e altezza di ogni edificio.

Uso:
    python data/scripts/07_edifici_console.py

Prima serve 01_scarica_osm.py (e, facoltativo, 05_altezze_copernicus.py). L'altezza segue la stessa regola
dei tratti: OSM (`height` o `building:levels` × 3,2 m), poi Copernicus da satellite, poi 15 m di riserva.
Output: console/data/scenario/edifici.geojson (formato in docs/formati-dati.md, sezione 5).
"""
import importlib.util
import json
from pathlib import Path

import geopandas as gpd

from comune import RAW

RADICE = Path(__file__).resolve().parents[2]
OUT = RADICE / "console" / "data" / "scenario" / "edifici.geojson"
SEMPLIFICA_M = 0.8      # tolleranza della semplificazione: invisibile a scala di quartiere, dimezza il file

spec = importlib.util.spec_from_file_location("tratti", Path(__file__).with_name("02_costruisci_tratti.py"))
tratti = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tratti)


def main():
    edifici = gpd.read_file(RAW / "edifici.geojson")
    edifici = edifici[edifici.geom_type.isin(["Polygon", "MultiPolygon"])].copy()
    metrici = edifici.to_crs(tratti.CRS_METRICO)

    altezza = edifici.apply(tratti.altezza_edificio, axis=1)
    fonte = altezza.notna().map({True: "osm", False: None})
    satellite = tratti.altezze_copernicus(metrici)
    usa_satellite = altezza.isna() & satellite.notna()
    altezza[usa_satellite] = satellite[usa_satellite]
    fonte[usa_satellite] = "copernicus"
    fonte[altezza.isna()] = "riserva"
    altezza = altezza.fillna(tratti.ALTEZZA_DEFAULT_M)

    geom = metrici.geometry.simplify(SEMPLIFICA_M, preserve_topology=True).to_crs(4326)
    features = []
    for g, h in zip(geom, altezza):
        if g.is_empty:
            continue
        coords = json.loads(gpd.GeoSeries([g]).to_json())["features"][0]["geometry"]
        coords["coordinates"] = _arrotonda(coords["coordinates"])
        features.append({"type": "Feature", "properties": {"h": round(float(h), 1)}, "geometry": coords})

    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))
    print(f"{len(features)} edifici → {OUT.relative_to(RADICE)} ({OUT.stat().st_size / 1e6:.1f} MB)")
    print("altezza da:", fonte.value_counts().to_dict())
    print(f"altezza mediana {altezza.median():.1f} m, massima {altezza.max():.1f} m")


def _arrotonda(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], 6), round(c[1], 6)]
    return [_arrotonda(x) for x in c]


if __name__ == "__main__":
    main()
