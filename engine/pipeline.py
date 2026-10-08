"""Esegue tutto il motore e scrive i file che la console legge.

Uso normale (dopo dati e simulazione):
    python engine/pipeline.py

Opzioni utili: --giri, --rischio, --tratti, --out, --flotte boxi,navette (vedi --help).

Tre modi di organizzare gli operatori, sulla stessa giornata:
- senza previsione, turni fissi: ogni turno dimensionato su una giornata asciutta (quello che fa chi
  non prevede il meteo). È il pannello animato: nel temporale si forma la coda;
- senza previsione, a parità di servizio: per non far cadere il servizio senza sapere quando arriva
  il picco, si tiene il personale del picco per tutta la giornata;
- con AttentionGrid: partenze sfasate e personale secondo la previsione, cambiato a blocchi
  (config/scenario.yaml → operatori.blocco_turno_min).
"""
import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np
import yaml
from shapely.geometry import LineString

sys.path.insert(0, str(Path(__file__).resolve().parent))
import attenzione  # noqa: E402
from erlang import operatori_necessari  # noqa: E402
from ottimizza import ottimizza  # noqa: E402
from previsione import (carica_giri, carica_nomi_vie, carica_rischio, curva_richieste,  # noqa: E402
                        hm, passate, prob_asciutto, riga_rischio, sec)
from rigioco import estrai_richieste, kpi, simula_coda  # noqa: E402

RADICE = Path(__file__).resolve().parents[1]
PASSO_ANIMAZIONE_S = 30
SOSTA_MAX_S = 600          # una pausa più lunga (al deposito, tra un giro e l'altro) non conta come servizio


def piano_operatori(curva: list, passo_min: int, durata_s: float, attesa_s: float, livello: float) -> list:
    """Operatori necessari per ogni minuto, calcolati su blocchi di `passo_min` minuti."""
    piano = []
    for i in range(0, len(curva), passo_min):
        blocco = curva[i:i + passo_min]
        n = operatori_necessari(sum(blocco) / len(blocco), durata_s, attesa_s, livello)
        piano += [n] * len(blocco)
    return piano


def a_blocchi(piano: list, blocco_min: int) -> list:
    """Il personale si cambia solo a blocchi: in ogni blocco serve il massimo del blocco."""
    out = []
    for i in range(0, len(piano), blocco_min):
        b = piano[i:i + blocco_min]
        out += [max(b)] * len(b)
    return out


def per_turni(piano: list, turni: list, inizio_s: int) -> list:
    """Turni fissi: in ogni turno sempre il massimo che serve in quel turno."""
    out = list(piano)
    for a, b in turni:
        i, j = max(0, (sec(a) - inizio_s) // 60), min(len(piano), max(0, (sec(b) - inizio_s) // 60))
        if i < j:
            out[i:j] = [max(piano[i:j])] * (j - i)
    return out


def intervalli_servizio(g: dict) -> list:
    """Intervalli [inizio, fine] in secondi in cui il veicolo è in servizio (in movimento o fermo a una
    consegna); le pause più lunghe di SOSTA_MAX_S non contano."""
    out = []
    for p in g["percorso"]:
        t, d = (sec(p["ora"]), 10.0) if isinstance(p, dict) else (p[0], p[3])
        if out and t - out[-1][1] <= SOSTA_MAX_S:
            out[-1][1] = max(out[-1][1], t + d)
        else:
            out.append([t, t + d])
    return out


def veicoli_attivi(giri: list, sposta: dict, inizio_s: int, n_min: int) -> np.ndarray:
    attivi = np.zeros(n_min)
    for g in giri:
        d = sposta.get(g["veicolo_id"], 0) * 60
        minuti = np.zeros(n_min, dtype=bool)
        for a, b in intervalli_servizio(g):
            i, j = int((a + d - inizio_s) // 60), int((b + d - inizio_s) // 60) + 1
            minuti[max(0, i):max(0, min(n_min, j))] = True
        attivi += minuti
    return attivi


def percorsi_animazione(giri: list, geometrie: dict) -> list:
    """Posizione di ogni veicolo ogni PASSO_ANIMAZIONE_S secondi, senza spostamenti (la console li applica)."""
    out = []
    for g in giri:
        punti_chiave = []                                   # (t, lat, lon)
        for p in g["percorso"]:
            if isinstance(p, dict):
                punti_chiave.append((sec(p["ora"]), p["lat"], p["lon"]))
                continue
            t, n, verso, durata = p
            linea = geometrie.get(n)
            if linea is None:
                continue
            coords = list(linea.coords) if verso == 1 else list(linea.coords)[::-1]
            tot = LineString(coords).length or 1.0
            fatto = 0.0
            for k, (x, y) in enumerate(coords):
                if k:
                    fatto += ((x - coords[k - 1][0]) ** 2 + (y - coords[k - 1][1]) ** 2) ** 0.5
                punti_chiave.append((t + durata * fatto / tot, y, x))
        if not punti_chiave:
            continue
        t0 = int(punti_chiave[0][0] // PASSO_ANIMAZIONE_S * PASSO_ANIMAZIONE_S)
        tempi = np.array([p[0] for p in punti_chiave])
        lat, lon = np.array([p[1] for p in punti_chiave]), np.array([p[2] for p in punti_chiave])
        campioni = np.arange(t0, tempi[-1] + PASSO_ANIMAZIONE_S, PASSO_ANIMAZIONE_S)
        out.append({"veicolo_id": g["veicolo_id"], "flotta": g["flotta"], "t0": t0,
                    "punti": [[round(a, 5), round(b, 5)] for a, b in
                              zip(np.interp(campioni, tempi, lat), np.interp(campioni, tempi, lon))]})
    return out


def rischio_console(rischio: dict, rischio_path, inizio_s: int, fine_s: int, fascia_min: int, data: str) -> dict:
    """Rischio di ogni tratto per fascia, in millesimi, per colorare le strade in console.
    Aggiunge la pioggia per fascia se nella stessa cartella del rischio c'è meteo.csv."""
    fasce = [hm(t) for t in range(inizio_s, fine_s, fascia_min * 60)]
    indice = {f: i for i, f in enumerate(fasce)}
    p = {}
    for (seg, f), r in rischio.items():
        if f in indice:
            p.setdefault(seg, [0] * len(fasce))[indice[f]] = round(r["p_intervento"] * 1000)
    pioggia = None
    meteo = Path(rischio_path).with_name("meteo.csv")
    if meteo.exists():
        ore = {r["ora"][:2]: float(r["pioggia_mm"]) for r in csv.DictReader(open(meteo, encoding="utf-8"))}
        pioggia = [ore.get(f[:2]) for f in fasce]
    return {"data": data, "fasce": fasce, "pioggia_mm": pioggia, "p_millesimi": p}


def costo_ora_operatore(eco: dict) -> float:
    """Costo di un'ora di postazione presidiata: come nel foglio del business model, una postazione
    24 ore su 24 richiede `persone_per_postazione_24h` persone."""
    annuo = eco["stipendio_lordo_annuo"] * eco["costo_azienda_su_lordo"] * eco["persone_per_postazione_24h"]
    return annuo * (1 + eco["costi_extra"]) / (365 * 24)


def scrivi_registro(percorso, eventi, lista_passate, rischio, fascia, nomi, giri, cfg_flotte):
    """Registro degli interventi per l'autorità: ogni richiesta con gestore, via, motivo, attesa e durata."""
    flotta_di = {x["veicolo_id"]: x["flotta"] for x in giri}
    passata = {(p.veicolo_id, p.seg_id): p for p in lista_passate}
    with open(percorso, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["ora", "gestore", "veicolo", "via", "motivo_previsto", "probabilita_prevista",
                    "attesa_s", "durata_s", "operatore"])
        for e in eventi:
            p = passata.get((e["veicolo_id"], e["seg_id"]))
            r = riga_rischio(p, rischio, fascia) if p else None
            flotta = flotta_di.get(e["veicolo_id"], "")
            w.writerow([e["ora"], cfg_flotte.get(flotta, {}).get("nome", flotta), e["veicolo_id"],
                        nomi.get(e["seg_id"], ""), attenzione.motivo_principale(r) if r else "",
                        round(r["p_intervento"], 3) if r else "", e["attesa_s"], e["durata_s"], e["operatore"] + 1])


def esegui(giri_path, rischio_path, tratti_path, out_dir, config_path, flotte=None, economia_path=None):
    cfg = yaml.safe_load(open(config_path, encoding="utf-8"))
    g, o, oz, rg = cfg["giorno"], cfg["operatori"], cfg["ottimizzazione"], cfg["rigioco"]
    inizio_s, fine_s, fascia = sec(g["inizio"]), sec(g["fine"]), g["fascia_min"]
    n_min = (fine_s - inizio_s) // 60

    giri = carica_giri(giri_path)
    flotte = flotte or {x["flotta"] for x in giri}
    giri = [x for x in giri if x["flotta"] in flotte]
    cfg_flotte = cfg.get("flotte", {})
    sfasabili = {k for k, v in cfg_flotte.items() if v.get("sfasabile", True)} or None
    rischio = carica_rischio(rischio_path)
    nomi = carica_nomi_vie(tratti_path)
    n_veicoli = len(giri)

    # 1. Previsione: richieste attese minuto per minuto
    pas_senza = passate(giri)
    curva_senza = curva_richieste(pas_senza, rischio, inizio_s, fine_s, fascia)
    curva_asciutta = curva_richieste(pas_senza, rischio, inizio_s, fine_s, fascia, prob_asciutto)
    sposta = ottimizza(giri, rischio, inizio_s, fine_s, fascia, oz["spostamento_max_min"], oz["passo_min"],
                       sfasabili=sfasabili)
    pas_con = passate(giri, sposta)
    curva_con = curva_richieste(pas_con, rischio, inizio_s, fine_s, fascia)

    # 2. Operatori: quanti ne servono e quanti se ne mettono in turno
    args_op = (o["durata_media_intervento_s"], o["attesa_max_s"], o["livello_servizio"])
    nec_senza = piano_operatori(curva_senza, fascia, *args_op)
    nec_con = piano_operatori(curva_con, fascia, *args_op)
    nec_asciutto = piano_operatori(curva_asciutta, fascia, *args_op)
    turni = o.get("turni", [[g["inizio"], g["fine"]]])
    turno_fisso = per_turni(nec_asciutto, turni, inizio_s)         # senza previsione: turni da giornata asciutta
    picco_costante = [max(nec_senza)] * n_min                       # senza previsione, a parità di servizio
    turni_sul_picco = per_turni(nec_senza, turni, inizio_s)         # senza previsione, turni sul picco di ogni turno
    turno_con = a_blocchi(nec_con, o.get("blocco_turno_min", 60))    # con AttentionGrid

    # 3. Rigioco con numeri casuali comuni
    req_senza = estrai_richieste(pas_senza, rischio, fascia, rg["seme"], o["durata_media_intervento_s"])
    req_con = estrai_richieste(pas_con, rischio, fascia, rg["seme"], o["durata_media_intervento_s"])

    def in_turno(piano):
        return lambda t: piano[min(n_min - 1, max(0, int((t - inizio_s) // 60)))]

    ev_senza = simula_coda(req_senza, in_turno(turno_fisso))
    ev_con = simula_coda(req_con, in_turno(turno_con))
    ev_picco = simula_coda(req_senza, in_turno(picco_costante))
    ev_turni_picco = simula_coda(req_senza, in_turno(turni_sul_picco))
    kpi_senza = kpi(ev_senza, n_veicoli, float(np.mean(turno_fisso)), max(nec_senza))
    kpi_con = kpi(ev_con, n_veicoli, float(np.mean(turno_con)), max(nec_con))

    # 4. Veicoli per operatore e costi
    attivi_senza = veicoli_attivi(giri, {}, inizio_s, n_min)
    attivi_con = veicoli_attivi(giri, sposta, inizio_s, n_min)
    eco = None
    if economia_path and Path(economia_path).exists():
        eco = yaml.safe_load(open(economia_path, encoding="utf-8"))
    euro_ora = costo_ora_operatore(eco) if eco else None

    def blocco(eventi, piano, attivi):
        attese = [e["attesa_s"] for e in eventi] or [0]
        ore_op, ore_veic = sum(piano) / 60, float(attivi.sum()) / 60
        b = {"operatori_medi": round(float(np.mean(piano)), 1), "ore_operatore": round(ore_op, 1),
             "ore_veicolo": round(ore_veic, 1),
             "veicoli_per_operatore": round(ore_veic / max(ore_op, 1e-9), 1),
             "attesa_media_s": round(sum(attese) / len(attese)),
             "entro_attesa_max_pct": round(100 * sum(a <= o["attesa_max_s"] for a in attese) / len(attese))}
        if euro_ora:
            costo = ore_op * euro_ora * 365 / 12 / n_veicoli
            b["costo_veicolo_mese"] = round(costo)
            b["margine_pct"] = round(100 * (1 - costo / eco["prezzo_servizio_mese"]))
        return b

    parita = {"senza": blocco(ev_picco, picco_costante, attivi_senza),
              "senza_turni": blocco(ev_turni_picco, turni_sul_picco, attivi_senza),
              "con": blocco(ev_con, turno_con, attivi_con)}

    orario = []
    for i in range(0, n_min, 60):
        sl = slice(i, i + 60)
        op_s, op_c = float(np.mean(picco_costante[sl])), float(np.mean(turno_con[sl]))
        v_s, v_c = float(attivi_senza[sl].mean()), float(attivi_con[sl].mean())
        orario.append({"ora": hm(inizio_s + i * 60), "veicoli": round(v_c, 1),
                       "operatori_senza": round(op_s, 1), "operatori_con": round(op_c, 1),
                       "operatori_turni": round(float(np.mean(turno_fisso[sl])), 1),
                       "veicoli_per_operatore_senza": round(v_s / op_s, 1),
                       "veicoli_per_operatore_con": round(v_c / op_c, 1)})

    # 5. Griglia dell'attenzione
    at = cfg["attenzione"]
    stati = attenzione.livelli(pas_con, rischio, fascia, nomi, inizio_s, fine_s, at["orizzonte_min"] * 60,
                               at["soglia_osservazione"], at["soglia_intervento"])
    valid = attenzione.validazione(stati, req_con, inizio_s, at["anticipo_validazione_min"] * 60)

    # 6. Scrittura
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    def scrivi(nome, dati):
        json.dump(dati, open(out / nome, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    def tondo(xs):
        return [round(float(x), 3) for x in xs]

    scrivi("carico.json", {"passo_min": 1, "orari": [hm(inizio_s + 60 * i) for i in range(n_min)],
                           "senza": {"richieste_attese": tondo(curva_senza), "operatori_necessari": nec_senza,
                                     "operatori_in_turno": turno_fisso, "operatori_sul_picco": picco_costante,
                                     "veicoli_attivi": attivi_senza.astype(int).tolist()},
                           "con": {"richieste_attese": tondo(curva_con), "operatori_necessari": nec_con,
                                   "operatori_in_turno": turno_con, "veicoli_attivi": attivi_con.astype(int).tolist()}})
    scrivi("rigioco.json", {"senza": ev_senza, "con": ev_con})
    scrivi("kpi.json", {"senza": kpi_senza, "con": kpi_con, "parita_servizio": parita, "orario": orario,
                        "economia": ({"paese": eco["paese"], "costo_ora_postazione": round(euro_ora, 2),
                                      "prezzo_servizio_mese": eco["prezzo_servizio_mese"]} if eco else None),
                        "spostamenti_min": sposta})
    geometrie = {}
    gj = json.load(open(tratti_path, encoding="utf-8"))
    for ft in gj["features"]:
        geometrie[int(ft["properties"]["seg_id"].split("_")[1])] = LineString(ft["geometry"]["coordinates"])
        ft["properties"] = {"seg_id": ft["properties"]["seg_id"], "nome": ft["properties"].get("nome", "")}
    scrivi("veicoli.json", {"passo_s": PASSO_ANIMAZIONE_S,
                            "flotte": {k: {"nome": cfg_flotte.get(k, {}).get("nome", k),
                                           "veicoli": sum(1 for x in giri if x["flotta"] == k)} for k in sorted(flotte)},
                            "spostamenti_s": {k: v * 60 for k, v in sposta.items() if v},
                            "veicoli": percorsi_animazione(giri, geometrie)})
    scrivi("tratti.geojson", gj)
    scrivi("attenzione.json", attenzione.serializza_compatto(stati, inizio_s, at, valid))
    scrivi("rischio_console.json", rischio_console(rischio, rischio_path, inizio_s, fine_s, fascia,
                                                   str(g.get("data", ""))))
    scrivi_registro(out / "registro_interventi.csv", ev_con, pas_con, rischio, fascia, nomi, giri, cfg_flotte)

    print(f"Scritto in {out}")
    print(f"Veicoli: {n_veicoli} di {len(flotte)} flotte; partenze spostate: {sum(1 for v in sposta.values() if v)}")
    for nome, k in (("SENZA (turni fissi)", kpi_senza), ("CON", kpi_con)):
        print(f"{nome:20s} richieste={k['richieste']:5d}  picco insieme={k['picco_richieste_insieme']:3d}  "
              f"attesa media={k['attesa_media_s']}s  blocchi>60s={k['veicoli_fermi_oltre_60s']}")
    v = valid
    print(f"ATTENZIONE verde {v['tempo_pct']['verde']}% giallo {v['tempo_pct']['giallo']}% "
          f"rosso {v['tempo_pct']['rosso']}% | richieste da rosso {v['richieste_da_pct']['rosso']}% "
          f"| rosso/verde x{v['rosso_su_verde']}")
    for nome, k in parita.items():
        print(f"PARI {nome:12s} operatori medi={k['operatori_medi']:5}  ore operatore={k['ore_operatore']:6}  "
              f"veicoli/operatore={k['veicoli_per_operatore']:5}  entro {o['attesa_max_s']}s={k['entro_attesa_max_pct']}%"
              + (f"  costo €{k['costo_veicolo_mese']}/veicolo/mese  margine {k['margine_pct']}%" if euro_ora else ""))
    return {"senza": kpi_senza, "con": kpi_con, "parita_servizio": parita, "attenzione": valid, "orario": orario}


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--giri", default=RADICE / "sim/out/giri.json")
    p.add_argument("--rischio", default=RADICE / "data/processed/rischio.csv.gz")
    p.add_argument("--tratti", default=RADICE / "data/processed/tratti.geojson")
    p.add_argument("--out", default=RADICE / "console/data/scenario")
    p.add_argument("--config", default=RADICE / "config/scenario.yaml")
    p.add_argument("--economia", default=RADICE / "config/economia.yaml")
    p.add_argument("--flotte", default="", help="flotte da includere, separate da virgola (vuoto = tutte)")
    a = p.parse_args()
    esegui(a.giri, a.rischio, a.tratti, a.out, a.config, set(filter(None, a.flotte.split(","))) or None, a.economia)
