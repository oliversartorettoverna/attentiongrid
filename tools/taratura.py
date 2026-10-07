"""Taratura del peso degli attraversamenti su un dato pubblico.

Cruise (robotaxi a San Francisco, 2023) dichiara una richiesta di assistenza remota ogni 4–5 miglia.
Cerchiamo il peso per attraversamento tale che, in condizioni normali (pomeriggio senza pioggia forte
e senza uscita delle scuole), i BOXi simulati chiedano aiuto una volta ogni 4,5 miglia (7,24 km).

Uso:
    python tools/taratura.py
Stampa il valore da mettere in config/pesi_rischio.yaml → attraversamenti.per_attraversamento.
Va rilanciato se cambiano i tratti, i giri o le altre regole del rischio.
"""
import copy
import importlib.util
import sys
from pathlib import Path

import pandas as pd

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE / "engine"))
sys.path.insert(0, str(RADICE / "data" / "scripts"))
from comune import PROCESSED, leggi_pesi, leggi_scenario  # noqa: E402
from previsione import carica_giri, passate, sec  # noqa: E402

spec = importlib.util.spec_from_file_location("mappa_rischio", RADICE / "data/scripts/04_mappa_rischio.py")
mappa_rischio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mappa_rischio)

OBIETTIVO_KM = 4.5 * 1.609      # una richiesta ogni 4,5 miglia (Cruise, CNBC 6/11/2023)
FINESTRA = ("14:00", "16:00")   # condizioni normali nello scenario: niente pioggia forte, niente scuole


def km_per_richiesta(peso: float, tratti, meteo, sc, pesi, giri, lista) -> float:
    p = copy.deepcopy(pesi)
    p["attraversamenti"]["per_attraversamento"] = peso
    r = mappa_rischio.calcola(tratti, meteo, sc, p)
    rischio = {(a, f): q for a, f, q in zip(r.seg_id, r.fascia, r.p_intervento)}
    a, b = sec(FINESTRA[0]), sec(FINESTRA[1])
    passo = sc["giorno"]["fascia_min"] * 60
    attese = sum(rischio.get((x.seg_id, f"{(x.t - x.t % passo) // 3600:02d}:{(x.t - x.t % passo) % 3600 // 60:02d}"), 0.0)
                 for x in lista if a <= x.t < b)
    vel_ms = sc["flotte"]["boxi"]["velocita_max_kmh"] / 3.6
    km = sum(1 for g in giri for q in g["percorso"] if a <= sec(q["ora"]) < b and q["seg_id"]) * 10 * vel_ms / 1000
    return km / attese


def main():
    sc, pesi = leggi_scenario(), leggi_pesi()
    tratti = mappa_rischio.carica_tratti()
    meteo = pd.read_csv(PROCESSED / "meteo.csv")
    giri = carica_giri(RADICE / "sim/out/giri.json")
    lista = passate(giri, None, {"boxi"})
    basso, alto = 0.0005, 0.05
    for _ in range(25):                         # più peso → più richieste → meno km per richiesta
        medio = (basso + alto) / 2
        if km_per_richiesta(medio, tratti, meteo, sc, pesi, giri, lista) > OBIETTIVO_KM:
            basso = medio
        else:
            alto = medio
    peso = round((basso + alto) / 2, 4)
    km = km_per_richiesta(peso, tratti, meteo, sc, pesi, giri, lista)
    attuale = km_per_richiesta(pesi["attraversamenti"]["per_attraversamento"], tratti, meteo, sc, pesi, giri, lista)
    print(f"Peso attuale {pesi['attraversamenti']['per_attraversamento']}: una richiesta ogni {attuale:.1f} km")
    print(f"Peso tarato  {peso}: una richiesta ogni {km:.1f} km (obiettivo {OBIETTIVO_KM:.1f} km)")


if __name__ == "__main__":
    main()
