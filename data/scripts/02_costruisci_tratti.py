"""Costruisce data/processed/tratti.geojson: un record per tratto di strada con i fattori fissi
(larghezza, altezza edifici, rapporto canyon, attraversamenti, negozi, scuole, sottopassi).

Uso:
    python data/scripts/02_costruisci_tratti.py

Prima serve 01_scarica_osm.py. Il formato di output è in docs/formati-dati.md (sezione 1).

Altezza edifici: usa OSM (`height`, oppure `building:levels` × 3,2 m). Dove OSM non ha il dato
usa ALTEZZA_DEFAULT_M.
"""
import math

from shapely import STRtree
from shapely.geometry import LineString

import geopandas as gpd
import numpy as np
import osmnx as ox
import pandas as pd

from comune import PROCESSED, RAW

CRS_METRICO = "EPSG:32633"      # UTM 33N, in metri, va bene per Roma
ALTEZZA_DEFAULT_M = 15.0        # palazzina tipica del centro di Roma quando manca il dato
RAGGIO_FACCIATE_M = 40.0        # oltre questa distanza un lato della strada conta come aperto (fiume, piazza)
PASSO_CAMPIONI_M = 10.0         # ogni quanti metri si misura la distanza tra le facciate
STRADE_PRINCIPALI = {"trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link"}

# Larghezza stimata in metri per tipo di strada OSM, quando manca il tag `width`
LARGHEZZA_PER_TIPO = {
    "primary": 14, "primary_link": 8, "secondary": 11, "secondary_link": 7,
    "tertiary": 9, "tertiary_link": 6, "residential": 6.5, "unclassified": 6,
    "living_street": 4.5, "service": 4, "pedestrian": 5,
}


def primo(valore):
    """OSM a volte mette liste nei campi (es. due nomi): prendiamo il primo."""
    if isinstance(valore, list):
        return valore[0] if valore else None
    return valore


def numero(valore):
    try:
        return float(str(primo(valore)).replace("m", "").replace(",", ".").strip())
    except (TypeError, ValueError):
        return None


def altezza_edificio(riga):
    h = numero(riga.get("height"))
    if h and 2 < h < 120:
        return h
    piani = numero(riga.get("building:levels"))
    if piani and 0 < piani < 40:
        return piani * 3.2
    return np.nan


def direzione(geom_wgs84):
    """Orientamento del tratto in gradi (0 = nord, 90 = est), dal primo all'ultimo punto."""
    (lon1, lat1), (lon2, lat2) = geom_wgs84.coords[0], geom_wgs84.coords[-1]
    dx = (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2))
    dy = lat2 - lat1
    return (math.degrees(math.atan2(dx, dy)) + 360) % 360


def distanza_facciate(linea, albero, edifici_geom):
    """Distanza mediana tra le facciate ai due lati del tratto (in metri, CRS metrico).

    Lungo il tratto, ogni PASSO_CAMPIONI_M, traccia una linea perpendicolare e misura su ogni lato
    la distanza dal primo edificio. Se su un lato non c'è niente entro RAGGIO_FACCIATE_M,
    quel lato conta RAGGIO_FACCIATE_M (strada aperta, il GPS vede il cielo).
    """
    n = max(1, int(linea.length // PASSO_CAMPIONI_M))
    misure = []
    for i in range(n):
        d = linea.length * (i + 0.5) / n
        p = linea.interpolate(d)
        q = linea.interpolate(min(d + 1.0, linea.length)) if d + 1.0 <= linea.length else linea.interpolate(d - 1.0)
        dx, dy = (q.x - p.x, q.y - p.y) if d + 1.0 <= linea.length else (p.x - q.x, p.y - q.y)
        norma = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / norma, dx / norma
        totale = 0.0
        for verso in (1, -1):
            raggio = LineString([(p.x, p.y), (p.x + verso * nx * RAGGIO_FACCIATE_M, p.y + verso * ny * RAGGIO_FACCIATE_M)])
            minimo = RAGGIO_FACCIATE_M
            for j in albero.query(raggio, predicate="intersects"):
                minimo = min(minimo, p.distance(edifici_geom[j].intersection(raggio)))
            totale += minimo
        misure.append(totale)
    return float(np.median(misure))


def main():
    G = ox.load_graphml(RAW / "strade.graphml")
    tratti = ox.graph_to_gdfs(G, nodes=False).reset_index()
    tratti = tratti.drop_duplicates(subset=["u", "v"]).reset_index(drop=True)
    tratti["seg_id"] = [f"seg_{i:06d}" for i in range(len(tratti))]
    tratti["nome"] = tratti.get("name", pd.Series([None] * len(tratti))).map(primo).fillna("")
    tratti["direzione_gradi"] = tratti.geometry.map(direzione).round(1)
    tipo = tratti["highway"].map(primo)
    larghezza_osm = tratti.get("width", pd.Series([None] * len(tratti))).map(numero)
    tratti["larghezza_m"] = pd.to_numeric(larghezza_osm.fillna(tipo.map(LARGHEZZA_PER_TIPO)).fillna(6.0)).astype(float)
    tunnel = tratti.get("tunnel", pd.Series([None] * len(tratti))).map(primo)
    # Solo i sottovia stradali: gli archi sotto i palazzi (`building_passage`, o `tunnel=yes` su
    # vicoli residenziali come l'Arco de' Tolomei) non sono sottopassi che si allagano
    tratti["sottopasso"] = (tunnel == "yes") & tipo.isin(STRADE_PRINCIPALI)

    m = tratti.to_crs(CRS_METRICO)
    m["lunghezza_m"] = m.geometry.length.round(1)

    # Altezza edifici entro 25 m dal tratto
    edifici = gpd.read_file(RAW / "edifici.geojson").to_crs(CRS_METRICO)
    edifici["h"] = edifici.apply(altezza_edificio, axis=1)
    fasce = m[["seg_id", "geometry"]].copy()
    fasce["geometry"] = fasce.buffer(25)
    vicini = gpd.sjoin(edifici[["h", "geometry"]], fasce, predicate="intersects")
    mediana = vicini.groupby("seg_id")["h"].median()
    m["altezza_edifici_m"] = pd.to_numeric(m["seg_id"].map(mediana)).fillna(ALTEZZA_DEFAULT_M).astype(float).round(1)
    # Rapporto canyon = altezza / distanza tra le facciate (non la carreggiata)
    geom_edifici = edifici.geometry.values
    albero = STRtree(geom_edifici)
    m["distanza_facciate_m"] = [round(distanza_facciate(g, albero, geom_edifici), 1) for g in m.geometry]
    m["rapporto_canyon"] = (m["altezza_edifici_m"] / m["distanza_facciate_m"].clip(lower=m["larghezza_m"])).round(2)

    # Attraversamenti entro 10 m
    attr = gpd.read_file(RAW / "attraversamenti.geojson").to_crs(CRS_METRICO)
    fasce["geometry"] = m.buffer(10)
    conta = gpd.sjoin(attr[["geometry"]], fasce, predicate="within").groupby("seg_id").size()
    m["attraversamenti"] = m["seg_id"].map(conta).fillna(0).astype(int)

    # Negozi e locali entro 50 m, per 100 m di strada
    poi = gpd.read_file(RAW / "punti_interesse.geojson").to_crs(CRS_METRICO)
    commerciali = poi[poi["shop"].notna() | poi["amenity"].isin(
        ["restaurant", "bar", "cafe", "fast_food", "pharmacy"])]
    fasce["geometry"] = m.buffer(50)
    conta = gpd.sjoin(commerciali[["geometry"]], fasce, predicate="within").groupby("seg_id").size()
    m["densita_negozi"] = (m["seg_id"].map(conta).fillna(0) / (m["lunghezza_m"].clip(lower=20) / 100)).round(2)

    # Scuola entro 100 m
    scuole = poi[poi["amenity"].isin(["school", "kindergarten"])]
    fasce["geometry"] = m.buffer(100)
    con_scuola = set(gpd.sjoin(scuole[["geometry"]], fasce, predicate="within")["seg_id"])
    m["scuola_vicina"] = m["seg_id"].isin(con_scuola)

    # Limite: sono sottopassi solo i sottovia mappati in OSM; i punti bassi che si allagano
    # senza essere tunnel non sono inclusi.

    m["fonte_dati"] = "osm"
    colonne = ["seg_id", "u", "v", "nome", "lunghezza_m", "larghezza_m", "distanza_facciate_m", "altezza_edifici_m", "rapporto_canyon",
               "direzione_gradi", "attraversamenti", "densita_negozi", "scuola_vicina", "sottopasso",
               "fonte_dati", "geometry"]
    PROCESSED.mkdir(parents=True, exist_ok=True)
    m[colonne].to_crs("EPSG:4326").to_file(PROCESSED / "tratti.geojson", driver="GeoJSON")
    print(f"Scritti {len(m)} tratti in {PROCESSED / 'tratti.geojson'}")
    print(m[["rapporto_canyon", "attraversamenti", "densita_negozi"]].describe().round(2))


if __name__ == "__main__":
    main()
