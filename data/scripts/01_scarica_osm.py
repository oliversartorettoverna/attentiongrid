"""Scarica da OpenStreetMap strade, edifici e punti di interesse dell'area della demo.

Uso:
    python data/scripts/01_scarica_osm.py

Output (in data/raw/, non versionati):
    strade.graphml          rete stradale percorribile in auto
    edifici.geojson         edifici con altezza/piani quando OSM li ha
    punti_interesse.geojson scuole, negozi, locali, uffici postali (come punti)
    attraversamenti.geojson strisce pedonali e semafori

Serve internet (Overpass API). La prima volta ci mette qualche minuto; poi usa la cache.
"""
import osmnx as ox

from comune import RAW, riquadro

ox.settings.use_cache = True
ox.settings.cache_folder = str(RAW / "cache")
ox.settings.log_console = True


def solo_colonne(gdf, colonne):
    """Tiene solo le colonne utili (OSM ne ha centinaia) e le converte in testo."""
    for c in colonne:
        if c not in gdf.columns:
            gdf[c] = None
    out = gdf[colonne + ["geometry"]].copy()
    for c in colonne:
        out[c] = out[c].astype("string")
    return out.reset_index(drop=True)


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    bbox = riquadro()
    print("Riquadro (lon_min, lat_min, lon_max, lat_max):", bbox)

    print("1/4 Rete stradale…")
    G = ox.graph_from_bbox(bbox, network_type="drive", simplify=True)
    ox.save_graphml(G, RAW / "strade.graphml")
    print(f"    {len(G.nodes)} incroci, {len(G.edges)} tratti")

    print("2/4 Edifici…")
    edifici = ox.features_from_bbox(bbox, tags={"building": True})
    edifici = edifici[edifici.geometry.type.isin(["Polygon", "MultiPolygon"])]
    solo_colonne(edifici, ["building", "building:levels", "height"]).to_file(
        RAW / "edifici.geojson", driver="GeoJSON"
    )
    print(f"    {len(edifici)} edifici")

    print("3/4 Punti di interesse…")
    tag_poi = {
        "amenity": ["school", "kindergarten", "college", "restaurant", "bar", "cafe",
                    "fast_food", "pharmacy", "post_office"],
        "shop": True,
    }
    poi = ox.features_from_bbox(bbox, tags=tag_poi)
    poi["geometry"] = poi.geometry.representative_point()
    solo_colonne(poi, ["amenity", "shop", "name"]).to_file(
        RAW / "punti_interesse.geojson", driver="GeoJSON"
    )
    print(f"    {len(poi)} punti")

    print("4/4 Attraversamenti pedonali…")
    attr = ox.features_from_bbox(bbox, tags={"highway": ["crossing", "traffic_signals"]})
    attr = attr[attr.geometry.type == "Point"]
    solo_colonne(attr, ["highway", "crossing"]).to_file(
        RAW / "attraversamenti.geojson", driver="GeoJSON"
    )
    print(f"    {len(attr)} attraversamenti")
    print("Fatto. File in", RAW)


if __name__ == "__main__":
    main()
