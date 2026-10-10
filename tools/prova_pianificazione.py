"""Il piano dei turni regge se la previsione sbaglia? E quanto aggiungono le leve in tempo reale?

Tre piani, tutti fatti sulla previsione e verificati sulla giornata vera (mai vista dal piano):
- turni fissi sul picco di ogni turno;
- solo piano prudente: il piano rifatto con il temporale previsto anticipato e ritardato di un'ora
  (ricalcolando il rischio, così si vede anche la pioggia sull'uscita da scuola), tenendo il massimo;
- piano normale (solo la previsione), da solo e con le leve;
- piano prudente + leve in tempo reale (engine/tempo_reale.py: operatori misti, prolungamento turno,
  reperibilità, meno richieste).
Con tre previsioni: giusta, temporale previsto un'ora prima, un'ora dopo.

Uso:
    python tools/prova_pianificazione.py

Scrive anche console/data/scenario/piani.json per il planner dell'app (formato in docs/formati-dati.md).
"""
import copy
import importlib.util
import json
import sys
from pathlib import Path

import pandas as pd
import yaml

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE / "engine"))
sys.path.insert(0, str(RADICE / "data" / "scripts"))
import tempo_reale as tr_mod  # noqa: E402
from comune import CONFIG, PROCESSED, leggi_pesi, leggi_scenario  # noqa: E402
from pipeline import a_blocchi, costo_ora_operatore, per_turni, piano_operatori, rispetta_servizio  # noqa: E402
from previsione import carica_giri, carica_rischio, curva_richieste, passate, sec  # noqa: E402
from rigioco import estrai_richieste, simula_coda  # noqa: E402

spec = importlib.util.spec_from_file_location("mappa_rischio", RADICE / "data/scripts/04_mappa_rischio.py")
mappa_rischio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mappa_rischio)


def rischio_da(df) -> dict:
    return {(r.pop("seg_id"), r.pop("fascia")): r for r in df.to_dict("records")}


def meteo_spostato(meteo: pd.DataFrame, ore: int) -> pd.DataFrame:
    m = meteo.copy()
    m["pioggia_mm"] = m["pioggia_mm"].shift(ore).fillna(0.0)
    return m


# Nella previsione il temporale è spostato di `spost` ore: se la previsione lo mette un'ora prima,
# nella realtà arriva un'ora dopo il previsto, e viceversa.
CASI = [("previsto", "Il temporale arriva come previsto", 0),
        ("dopo", "Il temporale arriva un'ora dopo il previsto", -1),
        ("prima", "Il temporale arriva un'ora prima del previsto", 1)]
PIANI_APP = {"turni fissi sul picco": "fissi", "solo piano normale": "normale", "solo piano prudente": "prudente"}


def per_ora(eventi, piano, inizio_s, n_min, attesa_max):
    """Operatori in turno (massimo dell'ora) e quota entro l'attesa massima, ora per ora."""
    operatori, entro = [], []
    for i in range(0, n_min, 60):
        operatori.append(int(max(piano[i:i + 60])))
        a = [e["attesa_s"] for e in eventi if i <= (sec(e["ora"]) - inizio_s) // 60 < i + 60]
        entro.append(round(100 * sum(x <= attesa_max for x in a) / len(a)) if len(a) >= 20 else None)
    return operatori, entro


def misura(eventi, inizio_s, n_min, attesa_max):
    entro = 100 * sum(e["attesa_s"] <= attesa_max for e in eventi) / len(eventi)
    peggiore = 100.0
    for i in range(0, n_min, 60):
        a = [e["attesa_s"] for e in eventi if i <= (sec(e["ora"]) - inizio_s) // 60 < i + 60]
        if len(a) >= 20:
            peggiore = min(peggiore, 100 * sum(x <= attesa_max for x in a) / len(a))
    return entro, peggiore


def main():
    sc, pesi = leggi_scenario(), leggi_pesi()
    eco = yaml.safe_load(open(CONFIG / "economia.yaml", encoding="utf-8"))
    euro_ora = costo_ora_operatore(eco)
    o, rg, tr = sc["operatori"], sc["rigioco"], sc["tempo_reale"]
    inizio_s, fine_s, fascia = sec(sc["giorno"]["inizio"]), sec(sc["giorno"]["fine"]), sc["giorno"]["fascia_min"]
    n_min = (fine_s - inizio_s) // 60
    args_op = (o["durata_media_intervento_s"], o["attesa_max_s"], o["livello_servizio"])
    giri = carica_giri(RADICE / "sim/out/giri.json")
    n_veicoli = len(giri)
    sfasabili = {k for k, v in sc["flotte"].items() if v.get("sfasabile", True)}
    lista = passate(giri)
    vero = carica_rischio(PROCESSED / "rischio.csv.gz")
    curva_vera = curva_richieste(lista, vero, inizio_s, fine_s, fascia)
    serve = tr_mod.necessari_prossimi(curva_vera, tr["orizzonte_min"], *args_op)
    tratti = mappa_rischio.carica_tratti()
    meteo = pd.read_csv(PROCESSED / "meteo.csv")
    blocco = o.get("blocco_turno_min", 60)
    ore_blocchi = [(i, min(i + blocco, n_min)) for i in range(0, n_min, blocco)]
    turni_min = tr_mod.turni_in_minuti(o["turni"], inizio_s, n_min)
    semi = range(rg["seme"] + 1, rg["seme"] + 1 + rg.get("giornate_pianificazione", 10))
    servizio = (inizio_s, o["attesa_max_s"], o["livello_servizio"], 20, 30, rg.get("quota_giornate", 0.9))
    reali = estrai_richieste(lista, vero, fascia, rg["seme"], o["durata_media_intervento_s"])

    print(f"{'temporale':9s} {'piano':26s} {'ore pagate':>10s} {'di cui str./rep.':>16s} {'€/veic./mese':>12s} "
          f"{'entro 20 s':>10s} {'ora peggiore':>12s} {'ritardo consegne':>24s} {'back-office':>11s}")
    cache = {}

    def rischio_con_pioggia_spostata(ore):
        if ore not in cache:
            cache[ore] = vero if ore == 0 else rischio_da(
                mappa_rischio.calcola(tratti, meteo_spostato(meteo, ore), sc, copy.deepcopy(pesi)))
        return cache[ore]

    def necessari(rischio):
        return piano_operatori(curva_richieste(lista, rischio, inizio_s, fine_s, fascia), fascia, *args_op)

    casi = []
    for chiave, nome, spost in CASI:
        caso = {"chiave": chiave, "nome": nome, "piani": {}}
        casi.append(caso)
        previsto = rischio_con_pioggia_spostata(spost)
        nec = necessari(previsto)
        giornate = [estrai_richieste(lista, previsto, fascia, s, o["durata_media_intervento_s"]) for s in semi]
        fissi = per_turni(nec, o["turni"], inizio_s)
        fissi = rispetta_servizio(fissi, giornate, [b for b in turni_min if b[0] < b[1]], *servizio)
        # prudente: il massimo dei piani con il temporale previsto, anticipato e ritardato di un'ora
        varianti = [a_blocchi(necessari(rischio_con_pioggia_spostata(spost + d)), blocco) for d in (-1, 0, 1)]
        prud = [max(x) for x in zip(*varianti)]
        prud = rispetta_servizio(prud, giornate, ore_blocchi, *servizio)
        normale = rispetta_servizio(a_blocchi(nec, blocco), giornate, ore_blocchi, *servizio)
        piani = [("turni fissi sul picco", fissi, False), ("solo piano normale", normale, False),
                 ("piano normale + leve 1–4", normale, True), ("solo piano prudente", prud, False),
                 ("prudente + leve 1–4", prud, True)]
        for etichetta, piano, con_leve in piani:
            if con_leve:
                leve = tr_mod.leve_operatori(piano, serve, turni_min, tr)
                capacita = leve["capacita"]
                rid = tr_mod.riduci_richieste(lista, giri, capacita, serve, vero, fascia, inizio_s, sfasabili, tr)
                richieste = estrai_richieste(rid["passate"], vero, fascia, rg["seme"], o["durata_media_intervento_s"])
                ritardo = f"{rid['ritardo_consegne_min']} min su {rid['consegne_ritardate']} consegne"
                back = f"{leve['ore_back_office']} h"
            else:
                leve, capacita, richieste, ritardo, back = None, piano, reali, "0", "—"
            eventi = simula_coda(richieste, lambda t: capacita[min(n_min - 1, max(0, int((t - inizio_s) // 60)))])
            entro, peggiore = misura(eventi, inizio_s, n_min, o["attesa_max_s"])
            c = tr_mod.costo_giornata(piano, leve, euro_ora, tr, turni_min)
            extra = f"{c['ore_straordinario']}/{c['ore_reperibili']}" if leve else "—"
            if etichetta in PIANI_APP:
                operatori, entro_ora = per_ora(eventi, piano, inizio_s, n_min, o["attesa_max_s"])
                caso["piani"][PIANI_APP[etichetta]] = {
                    "ore_pagate": c["ore_pagate"], "costo_veicolo_mese": round(c["costo_euro"] * 365 / 12 / n_veicoli),
                    "entro_pct": round(entro), "ora_peggiore_pct": round(peggiore),
                    "operatori": operatori, "entro_pct_ora": entro_ora}
            print(f"{chiave:9s} {etichetta:26s} {c['ore_pagate']:10} {extra:>16s} "
                  f"{c['costo_euro'] * 365 / 12 / n_veicoli:12.0f} {entro:9.0f}% {peggiore:11.0f}% {ritardo:>24s} {back:>11s}")

    out = RADICE / "console/data/scenario/piani.json"
    out.write_text(json.dumps({"attesa_max_s": o["attesa_max_s"], "livello_servizio_pct": round(100 * o["livello_servizio"]),
                               "ore": [f"{(inizio_s + i * 60) // 3600:02d}:00" for i in range(0, n_min, 60)],
                               "casi": casi}, ensure_ascii=False, separators=(",", ":")))
    print(f"Scritto {out.relative_to(RADICE)}")


if __name__ == "__main__":
    main()
