"""What-if nel planner: e se domani c'è un evento in un luogo della mappa?

Un evento porta gente in strada vicino al luogo: nelle ore di afflusso (prima dell'inizio) e di deflusso
(dopo la fine) ogni tratto entro il raggio prende un contributo in più alla probabilità di richiesta, combinato
con gli altri fattori come cause indipendenti (p = 1 − (1 − p)(1 − c), come la scuola). Da lì, con lo stesso
metodo del piano (engine/pipeline.py): richieste attese minuto per minuto, operatori necessari con Erlang C,
confronto ora per ora con il piano prudente di piani.json. Parametri in config/scenario.yaml, sezione `eventi`.

Prova da terminale:
    python engine/what_if.py "San Pietro" 17:00 grande
"""
import json
import math
import sys
from pathlib import Path

import yaml

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE / "engine"))
from pipeline import piano_operatori  # noqa: E402
from previsione import carica_giri, carica_nomi_vie, carica_rischio, curva_richieste, hm, passate, prob, sec  # noqa: E402

METRI_PER_GRADO_LAT = 111_000


def distanza_m(a, b):
    """Distanza approssimata in metri tra due punti [lon, lat]: basta su pochi chilometri."""
    dx = (a[0] - b[0]) * METRI_PER_GRADO_LAT * math.cos(math.radians((a[1] + b[1]) / 2))
    dy = (a[1] - b[1]) * METRI_PER_GRADO_LAT
    return math.hypot(dx, dy)


def centro(geometria):
    """Il punto medio dei vertici di un tratto: per decidere se è vicino al luogo."""
    punti = geometria["coordinates"] if geometria["type"] == "LineString" else \
        [p for linea in geometria["coordinates"] for p in linea]
    return [sum(p[0] for p in punti) / len(punti), sum(p[1] for p in punti) / len(punti)]


class WhatIf:
    """Carica una volta giornata, rischio e piano; poi risponde in meno di un secondo a ogni evento."""

    def __init__(self, radice: Path = RADICE, cartella: str = "scenario"):
        cfg = yaml.safe_load(open(radice / "config/scenario.yaml", encoding="utf-8"))
        g, o = cfg["giorno"], cfg["operatori"]
        self.ev = cfg["eventi"]
        self.inizio_s, self.fine_s, self.fascia = sec(g["inizio"]), sec(g["fine"]), g["fascia_min"]
        self.args_op = (o["durata_media_intervento_s"], o["attesa_max_s"], o["livello_servizio"])
        dati = radice / "console/data" / cartella
        kpi = json.load(open(dati / "kpi.json", encoding="utf-8"))
        # le passate con le partenze sfasate del piano, come nella giornata con il sistema
        self.passate = passate(carica_giri(radice / "sim/out/giri.json"), kpi.get("spostamenti_min", {}))
        self.rischio = carica_rischio(radice / "data/processed/rischio.csv.gz")
        tratti = json.load(open(radice / "data/processed/tratti.geojson", encoding="utf-8"))
        self.centri = {f["properties"]["seg_id"]: centro(f["geometry"]) for f in tratti["features"]}
        self.nomi = carica_nomi_vie(radice / "data/processed/tratti.geojson")
        self.base = curva_richieste(self.passate, self.rischio, self.inizio_s, self.fine_s, self.fascia)
        self.necessari_base = piano_operatori(self.base, self.fascia, *self.args_op)
        piani = json.load(open(radice / "console/data/scenario/piani.json", encoding="utf-8"))
        self.ore = piani["ore"]
        prev = next(c for c in piani["casi"] if c["chiave"] == "previsto")
        self.piano = prev["piani"]["prudente"]["operatori"]

    def per_ora(self, valori, come=max):
        return [come(valori[i:i + 60]) for i in range(0, len(valori), 60)]

    def calcola(self, luogo: str, ora: str, grandezza: str = "medio", durata_ore: float | None = None) -> dict:
        posto = self.ev["luoghi"][luogo]
        g = self.ev["grandezze"][grandezza]
        durata = durata_ore or self.ev["durata_ore"]
        inizio = sec(ora)
        fine = inizio + round(durata * 3600)
        finestre = [(inizio - self.ev["afflusso_ore"] * 3600, inizio), (fine, fine + self.ev["deflusso_ore"] * 3600)]
        vicini = {s for s, c in self.centri.items() if distanza_m(c, posto["punto"]) <= g["raggio_m"]}

        n = len(self.base)
        extra = [0.0] * n
        per_via: dict[str, float] = {}
        for p in self.passate:
            if p.seg_id not in vicini or not any(a <= p.t < b for a, b in finestre):
                continue
            i = (p.t - self.inizio_s) // 60
            if not 0 <= i < n:
                continue
            q = prob(p, self.rischio, self.fascia)
            di_piu = (1 - (1 - q) * (1 - g["contributo"])) - q
            extra[i] += di_piu
            via = self.nomi.get(p.seg_id) or "via senza nome"
            per_via[via] = per_via.get(via, 0.0) + di_piu

        curva = [b + e for b, e in zip(self.base, extra)]
        necessari = piano_operatori(curva, self.fascia, *self.args_op)
        nec_ora = self.per_ora(necessari)
        base_ora = self.per_ora(self.necessari_base)
        extra_ora = self.per_ora(extra, sum)
        # il piano è verificato simulando la giornata vera, richiesta per richiesta; il conto veloce con Erlang
        # può essere più pessimista anche senza evento (alle 11 dice 5 dove al piano ne bastano 3). Mancano solo
        # le persone che l'evento chiede oltre a quello che il piano copre già.
        mancano = [max(0, ne - max(pi, ba)) for ne, pi, ba in zip(nec_ora, self.piano, base_ora)]
        vie = sorted(per_via.items(), key=lambda x: -x[1])[:3]
        totale = sum(extra)
        risultato = {
            "luogo": luogo, "ora": hm(inizio), "fine": hm(fine), "grandezza": grandezza, "durata_ore": durata,
            "raggio_m": g["raggio_m"], "tratti_vicini": len(vicini),
            "finestre": [[hm(a), hm(b)] for a, b in finestre],
            "ore": self.ore, "piano": self.piano, "necessari_base": base_ora, "necessari_evento": nec_ora,
            "richieste_in_piu_ora": [round(x, 1) for x in extra_ora], "richieste_in_piu": round(totale),
            "vie": [{"via": v, "richieste": round(x, 1)} for v, x in vie],
            "mancano": mancano,
        }
        risultato["frasi"] = frasi(risultato)
        return risultato


def frasi(r: dict) -> list[str]:
    """La risposta in italiano, scritta dal motore con i suoi numeri."""
    if r["tratti_vicini"] == 0:
        return [f"{r['luogo']} è fuori dalla mappa della demo: nessuna strada entro {r['raggio_m']} m.",
                "Il motore non può stimare l'effetto e il piano resta com'è."]
    if r["richieste_in_piu"] < 1:
        return [f"In quelle ore nessun veicolo passa vicino a {r['luogo']}: le richieste quasi non cambiano.",
                "Il piano prudente resta com'è."]
    ore_in_piu = [i for i, x in enumerate(r["richieste_in_piu_ora"]) if x >= 0.5]
    da, a = r["ore"][ore_in_piu[0]][:2], int(r["ore"][ore_in_piu[-1]][:2]) + 1
    vie = [v["via"] for v in r["vie"][:2]]
    prima = (f"Con l'evento: circa {r['richieste_in_piu']} richieste di aiuto in più tra le {int(da)} e le {a}, "
             f"soprattutto in {' e '.join(vie)}.")
    scoperte = [(r["ore"][i][:2], m) for i, m in enumerate(r["mancano"]) if m > 0]
    if not scoperte:
        return [prima, "Il piano prudente regge: ha già abbastanza margine in quelle ore."]
    elenco = ", ".join(f"alle {int(h)}" for h, _ in scoperte)
    massimo = max(m for _, m in scoperte)
    persone = "serve 1 persona in più" if massimo == 1 else f"servono {massimo} persone in più"
    return [prima, f"Il piano prudente è scoperto {elenco}: {persone} (i reperibili), "
                   f"{sum(m for _, m in scoperte)} {'ora' if sum(m for _, m in scoperte) == 1 else 'ore'} operatore in tutto."]


if __name__ == "__main__":
    luogo, ora, grandezza = (sys.argv[1:] + ["San Pietro", "17:00", "grande"][len(sys.argv) - 1:])[:3]
    w = WhatIf()
    r = w.calcola(luogo, ora, grandezza)
    for f in r["frasi"]:
        print(f)
    print("ore      ", " ".join(f"{o[:2]:>3}" for o in r["ore"]))
    print("piano    ", " ".join(f"{x:3}" for x in r["piano"]))
    print("senza ev.", " ".join(f"{x:3}" for x in r["necessari_base"]))
    print("con ev.  ", " ".join(f"{x:3}" for x in r["necessari_evento"]))
