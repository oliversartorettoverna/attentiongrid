"""Esegue tutto il motore e scrive i file che la console legge.

Uso normale (dopo dati e simulazione):
    python engine/pipeline.py

Finale multi-flotta:
    python engine/pipeline.py --flotte boxi,navetta,robot --out console/data/scenario_multiflotta

Opzioni utili: --giri, --rischio, --tratti, --out (vedi --help).
"""
import argparse
import json
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from erlang import operatori_necessari  # noqa: E402
from ottimizza import ottimizza  # noqa: E402
from previsione import (avvisi, carica_giri, carica_nomi_vie, carica_rischio,  # noqa: E402
                        curva_richieste, hm, hms, passate, sec)
from rigioco import estrai_richieste, kpi, simula_coda  # noqa: E402

RADICE = Path(__file__).resolve().parents[1]


def piano_operatori(curva: list, passo_min: int, durata_s: float, attesa_s: float, livello: float) -> list:
    """Operatori necessari per ogni minuto, calcolati su blocchi di `passo_min` minuti."""
    piano = []
    for i in range(0, len(curva), passo_min):
        blocco = curva[i:i + passo_min]
        n = operatori_necessari(sum(blocco) / len(blocco), durata_s, attesa_s, livello)
        piano += [n] * len(blocco)
    return piano


def percorsi_animazione(giri: list, sposta: dict, flotte: set) -> list:
    out = []
    for g in giri:
        if g["flotta"] not in flotte:
            continue
        d = sposta.get(g["veicolo_id"], 0) * 60
        out.append({"veicolo_id": g["veicolo_id"], "flotta": g["flotta"],
                    "percorso": [[hms(sec(p["ora"]) + d), p["lat"], p["lon"]] for p in g["percorso"]]})
    return out


def esegui(giri_path, rischio_path, tratti_path, out_dir, config_path, flotte):
    cfg = yaml.safe_load(open(config_path, encoding="utf-8"))
    g, o, oz, rg = cfg["giorno"], cfg["operatori"], cfg["ottimizzazione"], cfg["rigioco"]
    inizio_s, fine_s, fascia = sec(g["inizio"]), sec(g["fine"]), g["fascia_min"]

    giri = carica_giri(giri_path)
    rischio = carica_rischio(rischio_path)
    nomi = carica_nomi_vie(tratti_path)
    n_veicoli = sum(1 for x in giri if x["flotta"] in flotte)

    # 1. Senza sistema: partenze come da programma, operatori fissi
    pas_senza = passate(giri, None, flotte)
    curva_senza = curva_richieste(pas_senza, rischio, inizio_s, fine_s, fascia)

    # 2. Con sistema: partenze sfasate + operatori secondo la previsione
    sposta = ottimizza(giri, rischio, inizio_s, fine_s, fascia, oz["spostamento_max_min"], oz["passo_min"],
                       flotte={"boxi"} & flotte or flotte)
    pas_con = passate(giri, sposta, flotte)
    curva_con = curva_richieste(pas_con, rischio, inizio_s, fine_s, fascia)

    args_op = (o["durata_media_intervento_s"], o["attesa_max_s"], o["livello_servizio"])
    piano_senza = piano_operatori(curva_senza, fascia, *args_op)   # quanti ne servirebbero senza sfasare
    piano_con = piano_operatori(curva_con, fascia, *args_op)

    # 3. Rigioco con numeri casuali comuni
    fissi = rg["operatori_senza_sistema"]
    req_senza = estrai_richieste(pas_senza, rischio, fascia, rg["seme"], o["durata_media_intervento_s"])
    req_con = estrai_richieste(pas_con, rischio, fascia, rg["seme"], o["durata_media_intervento_s"])
    ev_senza = simula_coda(req_senza, lambda t: fissi)
    ev_con = simula_coda(req_con, lambda t: piano_con[min(len(piano_con) - 1, max(0, int((t - inizio_s) // 60)))])

    kpi_senza = kpi(ev_senza, n_veicoli, fissi, max(piano_senza))
    kpi_con = kpi(ev_con, n_veicoli, sum(piano_con) / len(piano_con), max(piano_con))

    # 3b. Confronto a parità di servizio: senza previsione, per garantire il livello di servizio
    # bisogna tenere in turno tutto il pomeriggio gli operatori che servono al picco
    op_picco_senza = max(piano_senza)
    ev_senza_pari = simula_coda(req_senza, lambda t: op_picco_senza)
    ore = (fine_s - inizio_s) / 3600
    def blocco(eventi, operatori_medi):
        attese = [e["attesa_s"] for e in eventi] or [0]
        return {"operatori_medi": round(operatori_medi, 1),
                "ore_operatore": round(operatori_medi * ore, 1),
                "veicoli_per_operatore": round(n_veicoli / max(operatori_medi, 1e-9), 1),
                "attesa_media_s": round(sum(attese) / len(attese)),
                "entro_attesa_max_pct": round(100 * sum(a <= o["attesa_max_s"] for a in attese) / len(attese))}
    parita = {"senza": blocco(ev_senza_pari, op_picco_senza),
              "con": blocco(ev_con, sum(piano_con) / len(piano_con))}

    # 4. Scrittura
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    orari = [hm(inizio_s + 60 * i) for i in range(len(curva_senza))]
    scrivi = lambda nome, dati: json.dump(dati, open(out / nome, "w", encoding="utf-8"), ensure_ascii=False)
    scrivi("carico.json", {"passo_min": 1, "orari": orari,
                           "senza": {"richieste_attese": [round(x, 3) for x in curva_senza], "operatori_necessari": piano_senza,
                                     "operatori_in_turno": [fissi] * len(orari)},
                           "con": {"richieste_attese": [round(x, 3) for x in curva_con], "operatori_necessari": piano_con,
                                   "operatori_in_turno": piano_con}})
    scrivi("avvisi.json", avvisi(pas_con, rischio, fascia, nomi))
    scrivi("rigioco.json", {"senza": ev_senza, "con": ev_con})
    scrivi("kpi.json", {"senza": kpi_senza, "con": kpi_con, "parita_servizio": parita, "spostamenti_min": sposta})
    scrivi("veicoli.json", {"senza": percorsi_animazione(giri, {}, flotte),
                            "con": percorsi_animazione(giri, sposta, flotte)})
    gj = json.load(open(tratti_path, encoding="utf-8"))
    for ft in gj["features"]:
        ft["properties"] = {"seg_id": ft["properties"]["seg_id"], "nome": ft["properties"].get("nome", "")}
    scrivi("tratti.geojson", gj)

    print(f"Scritto in {out}")
    print("Spostamenti partenze (min):", {k: v for k, v in sposta.items() if v})
    for nome, k in (("SENZA", kpi_senza), ("CON", kpi_con)):
        print(f"{nome:6s} richieste={k['richieste']:3d}  picco insieme={k['picco_richieste_insieme']}  "
              f"attesa media={k['attesa_media_s']}s  fermi>60s={k['veicoli_fermi_oltre_60s']}  "
              f"operatori medi={k['operatori_medi']}  al picco={k['operatori_necessari_al_picco']}  "
              f"veicoli/operatore={k['veicoli_per_operatore']}")
    for nome, k in parita.items():
        print(f"PARI {nome:5s} operatori medi={k['operatori_medi']}  ore operatore={k['ore_operatore']}  "
              f"veicoli/operatore={k['veicoli_per_operatore']}  attesa media={k['attesa_media_s']}s  "
              f"entro {o['attesa_max_s']}s={k['entro_attesa_max_pct']}%")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--giri", default=RADICE / "sim/out/giri.json")
    p.add_argument("--rischio", default=RADICE / "data/processed/rischio.csv")
    p.add_argument("--tratti", default=RADICE / "data/processed/tratti.geojson")
    p.add_argument("--out", default=RADICE / "console/data/scenario")
    p.add_argument("--config", default=RADICE / "config/scenario.yaml")
    p.add_argument("--flotte", default="boxi")
    a = p.parse_args()
    esegui(a.giri, a.rischio, a.tratti, a.out, a.config, set(a.flotte.split(",")))
