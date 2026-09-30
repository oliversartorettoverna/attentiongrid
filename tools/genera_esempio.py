"""Genera dati FINTI ma nel formato giusto, per sviluppare console e motore prima dei dati veri.

Crea una griglia di strade vicino a Prati, un rischio che sale verso le 16:30 (scuola + pioggia +
un sottopasso), 12 BOXi che partono a ondate dal deposito, poi lancia il motore.

Uso:
    python tools/genera_esempio.py
Scrive: console/data/esempio/ (quello che legge la console) e tools/esempio_input/ (ingressi finti).
"""
import csv
import json
import random
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE / "engine"))
from pipeline import esegui  # noqa: E402
from previsione import hms  # noqa: E402

LAT0, LON0 = 41.9035, 12.4585       # angolo sud-ovest della griglia
DLAT, DLON = 0.00135, 0.0018        # circa 150 m
N = 7                                # griglia 7x7 incroci
VEL_MS = 25 / 3.6
INGRESSI = RADICE / "tools" / "esempio_input"


def nodo(i, j):
    return (round(LAT0 + i * DLAT, 6), round(LON0 + j * DLON, 6))


def costruisci_griglia():
    tratti, adiacenze = {}, {}
    k = 0
    for i in range(N):
        for j in range(N):
            for di, dj in ((0, 1), (1, 0)):
                a, b = (i, j), (i + di, j + dj)
                if b[0] >= N or b[1] >= N:
                    continue
                sid = f"seg_{k:06d}"
                k += 1
                verticale = dj == 0
                nome = f"Via di esempio {'V' if verticale else 'O'}{j if verticale else i}"
                tratti[sid] = {"a": a, "b": b, "nome": nome,
                               "scuola": verticale and j == 3 and 2 <= i <= 4,
                               "sottopasso": (a, b) == ((3, 5), (4, 5))}
                adiacenze.setdefault(a, []).append((b, sid))
                adiacenze.setdefault(b, []).append((a, sid))
    return tratti, adiacenze


def rischio_finto(tratti):
    righe = []
    for m in range(14 * 60, 19 * 60, 5):
        ora = f"{m // 60:02d}:{m % 60:02d}"
        piove = 16 * 60 + 15 <= m < 17 * 60 + 15
        for sid, t in tratti.items():
            c_attr = 0.03
            c_sc = 0.20 if (t["scuola"] and 16 * 60 <= m < 17 * 60) else 0.0
            c_df = 0.06 if (t["a"][0] in (1, 5) and 16 * 60 <= m < 19 * 60 + 30) else 0.0
            c_meteo = 0.8 * (c_attr + c_sc + c_df) if piove else 0.0
            c_sott = 0.45 if (t["sottopasso"] and piove) else 0.0
            resto = 0.998
            for c in (c_attr, c_df, c_sc, c_meteo, c_sott):
                resto *= 1 - c
            righe.append([sid, ora, round(1 - resto, 4), c_attr, c_df, c_sc, round(c_meteo, 4), 0.0, c_sott, 0.0])
    return righe


def percorso_minimo(adiacenze, da, a):
    """Percorso sulla griglia: prima in verticale poi in orizzontale (va bene per dati finti)."""
    passi, (i, j) = [], da
    while (i, j) != a:
        ni = i + (1 if a[0] > i else -1) if i != a[0] else i
        nj = j if i != a[0] else j + (1 if a[1] > j else -1)
        sid = next(s for (b, s) in adiacenze[(i, j)] if b == (ni, nj))
        passi.append(((i, j), (ni, nj), sid))
        i, j = ni, nj
    return passi


def giri_finti(adiacenze, rng):
    deposito = (0, 0)
    giri = []
    for v in range(12):
        t = 14 * 3600 + rng.randint(0, 60)
        percorso, fermate = [], []
        for ondata in (14 * 3600, 15 * 3600 + 15 * 60, 16 * 3600 + 20 * 60):
            t = max(t, ondata + rng.randint(0, 60))
            posizione = deposito
            tappe = [(rng.randrange(N), rng.randrange(N)) for _ in range(5)] + [deposito]
            for tappa in tappe:
                for a, b, sid in percorso_minimo(adiacenze, posizione, tappa):
                    (la1, lo1), (la2, lo2) = nodo(*a), nodo(*b)
                    durata = 150 / VEL_MS
                    for f in range(0, int(durata), 10):
                        x = f / durata
                        percorso.append({"ora": hms(t + f), "seg_id": sid,
                                         "lat": round(la1 + (la2 - la1) * x, 6), "lon": round(lo1 + (lo2 - lo1) * x, 6)})
                    t += durata
                posizione = tappa
                if tappa != deposito:
                    la, lo = nodo(*tappa)
                    fermate.append({"ora": hms(t), "lat": la, "lon": lo})
                    t += 90
        giri.append({"veicolo_id": f"boxi_{v + 1:02d}", "flotta": "boxi", "partenza": "14:00:00",
                     "fermate": fermate, "percorso": percorso})
    return giri


def main():
    rng = random.Random(7)
    tratti, adiacenze = costruisci_griglia()
    INGRESSI.mkdir(parents=True, exist_ok=True)

    gj = {"type": "FeatureCollection", "features": []}
    for sid, t in tratti.items():
        (la1, lo1), (la2, lo2) = nodo(*t["a"]), nodo(*t["b"])
        gj["features"].append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[lo1, la1], [lo2, la2]]},
                               "properties": {"seg_id": sid, "nome": t["nome"]}})
    json.dump(gj, open(INGRESSI / "tratti.geojson", "w"), ensure_ascii=False)

    with open(INGRESSI / "rischio.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["seg_id", "fascia", "p_intervento", "c_attraversamenti", "c_doppia_fila", "c_scuola",
                    "c_meteo", "c_abbagliamento", "c_sottopasso", "c_gps"])
        w.writerows(rischio_finto(tratti))

    json.dump(giri_finti(adiacenze, rng), open(INGRESSI / "giri.json", "w"), ensure_ascii=False)

    esegui(INGRESSI / "giri.json", INGRESSI / "rischio.csv", INGRESSI / "tratti.geojson",
           RADICE / "console" / "data" / "esempio", RADICE / "config" / "scenario.yaml", {"boxi"})


if __name__ == "__main__":
    main()
