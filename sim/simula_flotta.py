"""Simula una giornata della centrale condivisa: veicoli di più flotte sulla rete stradale vera.

Uso:
    python sim/simula_flotta.py

Prima servono 01_scarica_osm.py e 02_costruisci_tratti.py.
Output: sim/out/giri.json (formato in docs/formati-dati.md, sezione 4).

Le flotte sono in config/scenario.yaml → flotte. Due tipi:
- consegne (BOXi, furgoni): partono dal deposito a ondate (come in un centro di recapito che carica
  i mezzi insieme: è questo che crea i picchi che il sistema poi sfasa), fanno un giro di fermate su
  edifici veri in ordine "vado alla più vicina" e tornano al deposito;
- linea (navette): vanno avanti e indietro tra i capolinea, con una fermata ogni `fermata_ogni_m`,
  a intervalli regolari per tutto l'orario di servizio.

Velocità: quella media del traffico a Roma nell'ora (config/scenario.yaml → traffico), mai oltre
il massimo del veicolo.
"""
import json
import random
import sys
from pathlib import Path

import geopandas as gpd
import networkx as nx
import osmnx as ox

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE / "data" / "scripts"))
from comune import PROCESSED, RAW, leggi_scenario, minuti  # noqa: E402

OUT = RADICE / "sim" / "out"


def velocita_traffico(t: float, tr: dict) -> float:
    """km/h del traffico all'istante t (secondi dalla mezzanotte)."""
    m = (t // 60) % 1440
    if m >= minuti(tr["sera_da"]) or m < 6 * 60:
        return tr["sera_kmh"]
    if any(minuti(a) <= m < minuti(b) for a, b in tr["punta_fasce"]):
        return tr["punta_kmh"]
    return tr["giorno_kmh"]


class Rete:
    def __init__(self):
        G = ox.load_graphml(RAW / "strade.graphml")
        # solo la parte di rete dove da ogni incrocio si può andare e tornare
        self.G = G.subgraph(max(nx.strongly_connected_components(G), key=len)).copy()
        tratti = gpd.read_file(PROCESSED / "tratti.geojson")
        self.seg, self.lung_seg = {}, {}
        for r in tratti.itertuples():
            n = int(r.seg_id.split("_")[1])
            self.lung_seg[n] = float(r.lunghezza_m)
            self.seg[(int(r.u), int(r.v))] = (n, 1)        # verso 1: dal nodo u al nodo v
            self.seg.setdefault((int(r.v), int(r.u)), (n, 0))

    def pos(self, n):
        return (self.G.nodes[n]["y"], self.G.nodes[n]["x"])

    def nodo(self, lat, lon):
        return ox.distance.nearest_nodes(self.G, X=lon, Y=lat)

    def arco(self, u, w):
        dati = min(self.G.get_edge_data(u, w).values(), key=lambda d: d.get("length", 1e9))
        return float(dati["length"]), self.seg.get((u, w), (-1, 1))

    def strada(self, a, b):
        return nx.shortest_path(self.G, a, b, weight="length")


def guida(rete, strada, t, vmax, tr, percorso):
    """Percorre la strada a partire da t; aggiunge [t, tratto, verso, durata] e restituisce l'ora d'arrivo."""
    for u, w in zip(strada[:-1], strada[1:]):
        lung, (n, verso) = rete.arco(u, w)
        v = min(vmax, velocita_traffico(t, tr)) / 3.6
        durata = lung / v
        percorso.append([round(t), n, verso, round(durata, 1)])
        t += durata
    return t


def consegne(rete, nome, cfg, tr, fine_s, indirizzi, rng):
    deposito = rete.nodo(*cfg["deposito"])
    giri = []
    for k in range(cfg["veicoli"]):
        percorso, fermate, t = [], [], 0.0
        for ondata in cfg["ondate"]:
            t = max(t, minuti(ondata) * 60 + rng.randint(0, 120))
            if t >= fine_s:
                break
            rimaste = rng.sample(indirizzi, cfg["fermate_per_giro"])
            ordine, corrente = [], deposito
            while rimaste:
                prossima = min(rimaste, key=lambda n: _dist(rete.pos(n), rete.pos(corrente)))
                ordine.append(prossima)
                rimaste.remove(prossima)
                corrente = prossima
            corrente = deposito
            for dest in ordine + [deposito]:
                t = guida(rete, rete.strada(corrente, dest), t, cfg["velocita_max_kmh"], tr, percorso)
                corrente = dest
                if dest != deposito:
                    lat, lon = rete.pos(dest)
                    fermate.append([round(t), round(lat, 6), round(lon, 6)])
                    t += cfg["sosta_fermata_s"]
        giri.append(_giro(f"{nome}_{k + 1:02d}", nome, percorso, fermate))
    return giri


def linea(rete, nome, cfg, tr, rng):
    """Navette: ogni linea va avanti e indietro tra i capolinea; i veicoli partono a intervalli regolari."""
    giri, linee = [], cfg["linee"]
    per_linea = [cfg["veicoli"] // len(linee) + (1 if i < cfg["veicoli"] % len(linee) else 0) for i in range(len(linee))]
    inizio, fine = minuti(cfg["servizio"][0]) * 60, minuti(cfg["servizio"][1]) * 60
    for li, (punti, quanti) in enumerate(zip(linee, per_linea)):
        nodi = [rete.nodo(*p) for p in punti]
        andata = [nodi[0]]
        for a, b in zip(nodi[:-1], nodi[1:]):
            andata += rete.strada(a, b)[1:]
        ritorno = [nodi[-1]]
        for a, b in zip(nodi[::-1][:-1], nodi[::-1][1:]):
            ritorno += rete.strada(a, b)[1:]
        giro_completo = andata + ritorno[1:]
        lunghezza = sum(rete.arco(u, w)[0] for u, w in zip(giro_completo[:-1], giro_completo[1:]))
        durata_giro = lunghezza / (min(cfg["velocita_max_kmh"], tr["giorno_kmh"]) / 3.6)
        for k in range(quanti):
            percorso, fermate = [], []
            t = inizio + k * durata_giro / quanti + rng.uniform(0, 30)
            while t < fine:
                fatti = 0.0
                for u, w in zip(giro_completo[:-1], giro_completo[1:]):
                    t = guida(rete, [u, w], t, cfg["velocita_max_kmh"], tr, percorso)
                    fatti += rete.arco(u, w)[0]
                    if fatti >= cfg["fermata_ogni_m"]:
                        lat, lon = rete.pos(w)
                        fermate.append([round(t), round(lat, 6), round(lon, 6)])
                        t += cfg["sosta_fermata_s"]
                        fatti = 0.0
            giri.append(_giro(f"{nome}_{li + 1}{k + 1:02d}", nome, percorso, fermate))
    return giri


def _dist(a, b):
    return ((a[0] - b[0]) * 111_000) ** 2 + ((a[1] - b[1]) * 83_000) ** 2


def _giro(vid, flotta, percorso, fermate):
    t0 = percorso[0][0] if percorso else 0
    return {"veicolo_id": vid, "flotta": flotta,
            "partenza": f"{t0 // 3600:02d}:{t0 % 3600 // 60:02d}:{t0 % 60:02d}",
            "fermate": fermate, "percorso": percorso}


def main():
    sc = leggi_scenario()
    rng = random.Random(sc["rigioco"]["seme"])
    tr, fine_s = sc["traffico"], minuti(sc["giorno"]["fine"]) * 60
    rete = Rete()
    edifici = gpd.read_file(RAW / "edifici.geojson")
    centri = edifici.to_crs("EPSG:32633").geometry.centroid.to_crs("EPSG:4326").sample(n=3000, random_state=1)
    indirizzi = list(ox.distance.nearest_nodes(rete.G, X=list(centri.x), Y=list(centri.y)))

    giri = []
    for nome, cfg in sc["flotte"].items():
        nuovi = consegne(rete, nome, cfg, tr, fine_s, indirizzi, rng) if cfg["tipo"] == "consegne" \
            else linea(rete, nome, cfg, tr, rng)
        km = sum(rete.lung_seg.get(p[1], 0) for g in nuovi for p in g["percorso"]) / 1000
        ultimo = max((g["percorso"][-1][0] for g in nuovi if g["percorso"]), default=0)
        print(f"{cfg['nome']:22s} {len(nuovi):3d} veicoli, {sum(len(g['fermate']) for g in nuovi):5d} fermate, "
              f"{km / len(nuovi):5.0f} km a veicolo, ultimo movimento alle {ultimo // 3600:02d}:{ultimo % 3600 // 60:02d}")
        giri += nuovi

    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "giri.json", "w", encoding="utf-8") as f:
        json.dump(giri, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Scritto {OUT / 'giri.json'}: {len(giri)} veicoli, {(OUT / 'giri.json').stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
