"""Il piano dei turni regge se la previsione sbaglia?

Fa il piano degli operatori (solo turni, partenze invariate) su una previsione meteo diversa dalla realtà
e lo verifica sulla giornata vera:
- previsione giusta;
- temporale previsto un'ora prima o un'ora dopo;
- nessuna pioggia prevista (chi pianifica senza meteo).

Uso:
    python tools/prova_pianificazione.py
"""
import copy
import importlib.util
import sys
from pathlib import Path

import pandas as pd
import yaml

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE / "engine"))
sys.path.insert(0, str(RADICE / "data" / "scripts"))
from comune import PROCESSED, leggi_pesi, leggi_scenario  # noqa: E402
from pipeline import a_blocchi, piano_operatori, rispetta_servizio  # noqa: E402
from previsione import carica_giri, carica_rischio, curva_richieste, passate, sec  # noqa: E402
from rigioco import estrai_richieste, simula_coda  # noqa: E402

spec = importlib.util.spec_from_file_location("mappa_rischio", RADICE / "data/scripts/04_mappa_rischio.py")
mappa_rischio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mappa_rischio)


def rischio_da(df) -> dict:
    righe = df.to_dict("records")
    return {(r.pop("seg_id"), r.pop("fascia")): r for r in righe}


def meteo_spostato(meteo: pd.DataFrame, ore: int | None) -> pd.DataFrame:
    m = meteo.copy()
    if ore is None:
        m["pioggia_mm"] = 0.0
    else:
        m["pioggia_mm"] = m["pioggia_mm"].shift(ore).fillna(0.0)
    return m


def main():
    sc, pesi = leggi_scenario(), leggi_pesi()
    o, rg = sc["operatori"], sc["rigioco"]
    inizio_s, fine_s, fascia = sec(sc["giorno"]["inizio"]), sec(sc["giorno"]["fine"]), sc["giorno"]["fascia_min"]
    n_min = (fine_s - inizio_s) // 60
    giri = carica_giri(RADICE / "sim/out/giri.json")
    lista = passate(giri)
    vero = carica_rischio(PROCESSED / "rischio.csv.gz")
    reali = estrai_richieste(lista, vero, fascia, rg["seme"], o["durata_media_intervento_s"])
    tratti = mappa_rischio.carica_tratti()
    meteo = pd.read_csv(PROCESSED / "meteo.csv")
    blocco = o.get("blocco_turno_min", 60)
    blocchi = [(i, min(i + blocco, n_min)) for i in range(0, n_min, blocco)]
    semi = range(rg["seme"] + 1, rg["seme"] + 1 + rg.get("giornate_pianificazione", 10))
    servizio = (inizio_s, o["attesa_max_s"], o["livello_servizio"], 20, 30, rg.get("quota_giornate", 0.9))

    print(f"{'previsione usata per il piano':38s} {'ore operatore':>13s} {'entro 20 s':>10s} {'ora peggiore':>12s} {'ore sotto il 90%':>16s}")
    for nome, spost in [("giusta", 0), ("temporale previsto 1 ora prima", -1),
                        ("temporale previsto 1 ora dopo", 1), ("nessuna pioggia prevista", None)]:
        previsto = vero if spost == 0 else rischio_da(
            mappa_rischio.calcola(tratti, meteo_spostato(meteo, spost), sc, copy.deepcopy(pesi)))
        curva = curva_richieste(lista, previsto, inizio_s, fine_s, fascia)
        piano = a_blocchi(piano_operatori(curva, fascia, o["durata_media_intervento_s"], o["attesa_max_s"],
                                          o["livello_servizio"]), blocco)
        giornate = [estrai_richieste(lista, previsto, fascia, s, o["durata_media_intervento_s"]) for s in semi]
        piano = rispetta_servizio(piano, giornate, blocchi, *servizio)
        eventi = simula_coda(reali, lambda t: piano[min(n_min - 1, max(0, int((t - inizio_s) // 60)))])
        entro = 100 * sum(e["attesa_s"] <= o["attesa_max_s"] for e in eventi) / len(eventi)
        per_ora = []
        for i, j in blocchi:
            a = [e["attesa_s"] for e in eventi if i <= (sec(e["ora"]) - inizio_s) // 60 < j]
            if len(a) >= 20:
                per_ora.append(100 * sum(x <= o["attesa_max_s"] for x in a) / len(a))
        print(f"{nome:38s} {sum(piano) / 60:13.0f} {entro:9.0f}% {min(per_ora):11.0f}% {sum(p < 90 for p in per_ora):16d}")


if __name__ == "__main__":
    main()
