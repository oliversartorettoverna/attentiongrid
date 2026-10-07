"""Simula i giri di consegna dei BOXi sulla rete stradale vera di Prati–Trastevere.

Uso:
    python sim/simula_flotta.py

Prima servono 01_scarica_osm.py e 02_costruisci_tratti.py.
Output: sim/out/giri.json (formato in docs/formati-dati.md, sezione 4).

Ipotesi (modificabili in config/scenario.yaml → flotte.boxi):
- il deposito è l'ufficio postale OSM più vicino al centro di Prati;
- i veicoli partono a ONDATE (come in un centro di recapito che carica i mezzi insieme):
  è proprio questo che crea i picchi che il sistema poi sfasa;
- ogni giro ha N fermate su edifici veri, in ordine "vado alla più vicina";
- velocità costante pari alla massima (25 km/h per BOXi), sosta fissa a ogni fermata.

Simula solo i BOXi. Il formato di giri.json ha il campo "flotta", quindi accetta anche
altre flotte (per esempio "navetta" o "robot") senza cambiare il motore.
"""
import json
import math
import random
import sys
from pathlib import Path

import geopandas as gpd
import networkx as nx
import osmnx as ox
from shapely.geometry import LineString

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE / "data" / "scripts"))
sys.path.insert(0, str(RADICE / "engine"))
from comune import PROCESSED, RAW, leggi_scenario, minuti  # noqa: E402
from previsione import hms  # noqa: E402

CENTRO_PRATI = (41.9066, 12.4643)                 # Piazza Cola di Rienzo
ONDATE = ["14:00", "15:15", "16:20", "17:40"]     # orari di carico al deposito
PASSO_S = 10                                      # un punto ogni 10 secondi per l'animazione
OUT = RADICE / "sim" / "out"


def distanza(a, b):
    """Distanza approssimata in metri tra (lat, lon)."""
    dy = (a[0] - b[0]) * 111_000
    dx = (a[1] - b[1]) * 111_000 * math.cos(math.radians(a[0]))
    return math.hypot(dx, dy)


def trova_deposito():
    poi = gpd.read_file(RAW / "punti_interesse.geojson")
    poste = poi[poi["amenity"] == "post_office"]
    # Gli uffici di Poste Vaticane (Stato del Vaticano) non sono di Poste Italiane
    poste = poste[~poste["name"].fillna("").str.contains("vatican", case=False)]
    if poste.empty:
        return CENTRO_PRATI
    punti = [(g.y, g.x) for g in poste.geometry]
    return min(punti, key=lambda p: distanza(p, CENTRO_PRATI))


def main():
    sc = leggi_scenario()
    cfg = sc["flotte"]["boxi"]
    rng = random.Random(sc["rigioco"]["seme"])
    vel = cfg["velocita_max_kmh"] / 3.6
    fine_s = minuti(sc["giorno"]["fine"]) * 60

    G = ox.load_graphml(RAW / "strade.graphml")
    # Solo la parte di rete dove da ogni incrocio si può andare e tornare: gli altri (tagliati dal
    # bordo del riquadro o in fondo a sensi unici) renderebbero le fermate irraggiungibili
    G = G.subgraph(max(nx.strongly_connected_components(G), key=len)).copy()
    tratti = gpd.read_file(PROCESSED / "tratti.geojson")
    seg_di = {(int(r.u), int(r.v)): r.seg_id for r in tratti.itertuples()}

    dep_lat, dep_lon = trova_deposito()
    nodo_dep = ox.distance.nearest_nodes(G, X=dep_lon, Y=dep_lat)
    print(f"Deposito: {dep_lat:.5f}, {dep_lon:.5f}")

    edifici = gpd.read_file(RAW / "edifici.geojson")
    centri = edifici.to_crs("EPSG:32633").geometry.centroid.to_crs("EPSG:4326")
    campione = centri.sample(n=min(3000, len(centri)), random_state=1)
    nodi_indirizzi = list(ox.distance.nearest_nodes(G, X=list(campione.x), Y=list(campione.y)))

    def pos(n):
        return (G.nodes[n]["y"], G.nodes[n]["x"])

    giri = []
    for v in range(cfg["veicoli"]):
        percorso, fermate, t = [], [], 0.0
        for ondata in ONDATE:
            t = max(t, minuti(ondata) * 60 + rng.randint(0, 90))
            if t >= fine_s:
                break
            # fermate in ordine "vai alla più vicina"
            rimaste = rng.sample(nodi_indirizzi, cfg["fermate_per_giro"])
            ordine, corrente = [], nodo_dep
            while rimaste:
                prossima = min(rimaste, key=lambda n: distanza(pos(n), pos(corrente)))
                ordine.append(prossima)
                rimaste.remove(prossima)
                corrente = prossima
            corrente = nodo_dep
            for dest in ordine + [nodo_dep]:
                try:
                    strada = nx.shortest_path(G, corrente, dest, weight="length")
                except nx.NetworkXNoPath:
                    continue                                   # fermata irraggiungibile (senso unico): si salta
                for u, w in zip(strada[:-1], strada[1:]):
                    dati = min(G.get_edge_data(u, w).values(), key=lambda d: d.get("length", 1e9))
                    geom = dati.get("geometry") or LineString(
                        [(G.nodes[u]["x"], G.nodes[u]["y"]), (G.nodes[w]["x"], G.nodes[w]["y"])])
                    sid = seg_di.get((u, w)) or seg_di.get((w, u)) or ""
                    durata = float(dati["length"]) / vel
                    f = 0.0
                    while f < durata:
                        p = geom.interpolate(f / durata, normalized=True)
                        percorso.append({"ora": hms(t + f), "seg_id": sid,
                                         "lat": round(p.y, 6), "lon": round(p.x, 6)})
                        f += PASSO_S
                    t += durata
                corrente = dest
                if dest != nodo_dep:
                    fermate.append({"ora": hms(t), "lat": round(pos(dest)[0], 6), "lon": round(pos(dest)[1], 6)})
                    t += cfg["sosta_fermata_s"]
        giri.append({"veicolo_id": f"boxi_{v + 1:02d}", "flotta": "boxi",
                     "partenza": percorso[0]["ora"] if percorso else ONDATE[0],
                     "fermate": fermate, "percorso": percorso})
        print(f"boxi_{v + 1:02d}: {len(fermate)} fermate, rientro alle {hms(t)}")

    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "giri.json", "w", encoding="utf-8") as f:
        json.dump(giri, f, ensure_ascii=False)
    print("Scritto", OUT / "giri.json")


if __name__ == "__main__":
    main()
