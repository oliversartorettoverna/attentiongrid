"""Strade ed edifici attorno alla sede dell'hackathon, per mostrare in console il BOXi dal vivo (il telefono).

Uso:
    python data/scripts/08_area_sede.py

Scarica da OpenStreetMap strade ed edifici in un quadrato attorno a `sede.punto` (config/scenario.yaml); l'altezza
degli edifici segue la regola dei tratti (OSM, poi Copernicus se c'è data/raw/copernicus/, poi 15 m).
Output: console/data/sede/strade.geojson e console/data/sede/edifici.geojson (solo geometrie, per la mappa).
"""
import importlib.util
import json
from pathlib import Path

import geopandas as gpd
import osmnx as ox

from comune import leggi_scenario

RADICE = Path(__file__).resolve().parents[2]
OUT = RADICE / "console" / "data" / "sede"

spec = importlib.util.spec_from_file_location("tratti", Path(__file__).with_name("02_costruisci_tratti.py"))
tratti = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tratti)


def riquadro(lat: float, lon: float, raggio_m: float):
    dlat = raggio_m / 111_200
    dlon = raggio_m / (111_200 * 0.745)   # coseno di 41,9°
    return (lon - dlon, lat - dlat, lon + dlon, lat + dlat)   # osmnx 2.x: left, bottom, right, top


def main():
    sede = leggi_scenario()["sede"]
    bbox = riquadro(*sede["punto"], sede["raggio_m"])
    OUT.mkdir(parents=True, exist_ok=True)

    G = ox.graph_from_bbox(bbox, network_type="drive", simplify=True)
    strade = ox.graph_to_gdfs(G, nodes=False)[["geometry"]].reset_index(drop=True)
    strade.to_file(OUT / "strade.geojson", driver="GeoJSON")

    edifici = ox.features_from_bbox(bbox, tags={"building": True})
    edifici = edifici[edifici.geom_type.isin(["Polygon", "MultiPolygon"])].copy()
    altezza = edifici.apply(tratti.altezza_edificio, axis=1)
    satellite = tratti.altezze_copernicus(edifici.to_crs(tratti.CRS_METRICO))
    altezza = altezza.fillna(satellite).fillna(tratti.ALTEZZA_DEFAULT_M)
    out = gpd.GeoDataFrame({"h": altezza.round(1).values}, geometry=edifici.geometry.values, crs=edifici.crs)
    out["geometry"] = out.to_crs(tratti.CRS_METRICO).simplify(0.8).to_crs(4326)
    out.to_file(OUT / "edifici.geojson", driver="GeoJSON", COORDINATE_PRECISION=6)

    print(f"{len(strade)} strade, {len(out)} edifici attorno a {sede['nome']} → {OUT.relative_to(RADICE)}")
    print(f"dimensioni: {(OUT / 'strade.geojson').stat().st_size / 1e3:.0f} kB + {(OUT / 'edifici.geojson').stat().st_size / 1e3:.0f} kB")
    print(json.dumps({"riquadro": [round(x, 5) for x in bbox]}))


if __name__ == "__main__":
    main()
