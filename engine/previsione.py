"""Previsione: da giri simulati e mappa del rischio alla curva delle richieste attese nel tempo.

Una "passata" è l'ingresso di un veicolo in un tratto di strada. La probabilità che quella passata
generi una richiesta di aiuto è il `p_intervento` del tratto nella fascia oraria in cui avviene.
Sommando per minuto si ottiene quante richieste ci aspettiamo.
"""
import csv
import gzip
import json
from dataclasses import dataclass

NOMI_MOTIVI = {
    "c_attraversamenti": "attraversamenti pedonali",
    "c_doppia_fila": "doppia fila",
    "c_scuola": "uscita scuola",
    "c_meteo": "pioggia forte",
    "c_abbagliamento": "sole basso negli occhi",
    "c_sottopasso": "sottopasso allagabile",
    "c_gps": "GPS debole tra palazzi alti",
}


def sec(orario: str) -> int:
    parti = [int(x) for x in orario.split(":")]
    while len(parti) < 3:
        parti.append(0)
    return parti[0] * 3600 + parti[1] * 60 + parti[2]


def hms(s: float) -> str:
    s = int(round(s))
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


def hm(s: float) -> str:
    return hms(s)[:5]


@dataclass(frozen=True)
class Passata:
    veicolo_id: str
    flotta: str
    indice: int      # progressivo della passata nel giro del veicolo (serve per i numeri casuali comuni)
    t: int           # secondi dalla mezzanotte
    seg_id: str


def carica_giri(percorso: str) -> list:
    with open(percorso, encoding="utf-8") as f:
        return json.load(f)


def carica_rischio(percorso: str) -> dict:
    """{(seg_id, fascia): riga}, con i numeri già convertiti. Legge anche il file compresso (.gz)."""
    rischio = {}
    apri = gzip.open if str(percorso).endswith(".gz") else open
    with apri(percorso, "rt", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            chiave = (r.pop("seg_id"), r.pop("fascia"))
            rischio[chiave] = {k: float(v) for k, v in r.items()}
    return rischio


def carica_nomi_vie(percorso_tratti: str) -> dict:
    with open(percorso_tratti, encoding="utf-8") as f:
        gj = json.load(f)
    return {ft["properties"]["seg_id"]: ft["properties"].get("nome", "") for ft in gj["features"]}


def voci_percorso(g: dict):
    """(secondi, seg_id) per ogni voce del percorso. Formato compatto [t, numero_tratto, verso, durata]
    (simulatore della centrale) oppure quello a punti {"ora", "seg_id", ...} (dati di esempio)."""
    for p in g["percorso"]:
        if isinstance(p, dict):
            yield sec(p["ora"]), p["seg_id"]
        else:
            yield p[0], (f"seg_{p[1]:06d}" if p[1] >= 0 else "")


def passate(giri: list, spostamenti_min: dict | None = None, flotte: set | None = None) -> list:
    """Tutte le passate, applicando a ogni veicolo lo spostamento di partenza (in minuti)."""
    spostamenti_min = spostamenti_min or {}
    risultato = []
    for g in giri:
        if flotte and g["flotta"] not in flotte:
            continue
        delta = spostamenti_min.get(g["veicolo_id"], 0) * 60
        precedente, indice = None, 0
        for t, seg in voci_percorso(g):
            if seg != precedente:
                risultato.append(Passata(g["veicolo_id"], g["flotta"], indice, t + delta, seg))
                indice += 1
                precedente = seg
    return risultato


def riga_rischio(p: Passata, rischio: dict, fascia_min: int) -> dict | None:
    minuto = p.t // 60
    fascia = hm((minuto - minuto % fascia_min) * 60)
    return rischio.get((p.seg_id, fascia))


def prob(p: Passata, rischio: dict, fascia_min: int) -> float:
    r = riga_rischio(p, rischio, fascia_min)
    return r["p_intervento"] if r else 0.0


def prob_asciutto(p: Passata, rischio: dict, fascia_min: int, base: float = 0.002) -> float:
    """La stessa probabilità in una giornata senza pioggia forte: senza l'effetto della pioggia
    e senza sottopassi allagati. Serve a chi organizza i turni senza previsione meteo."""
    r = riga_rischio(p, rischio, fascia_min)
    if not r:
        return 0.0
    resto = 1 - base
    for k in ("c_attraversamenti", "c_doppia_fila", "c_scuola", "c_abbagliamento", "c_gps"):
        resto *= 1 - r.get(k, 0.0)
    return min(r["p_intervento"], 1 - resto)


def curva_richieste(lista_passate: list, rischio: dict, inizio_s: int, fine_s: int, fascia_min: int,
                    probabilita=None) -> list:
    """Richieste attese per ogni minuto tra inizio e fine."""
    probabilita = probabilita or prob
    n = (fine_s - inizio_s) // 60
    curva = [0.0] * n
    for p in lista_passate:
        i = (p.t - inizio_s) // 60
        if 0 <= i < n:
            curva[i] += probabilita(p, rischio, fascia_min)
    return curva


def media_mobile(curva: list, finestra: int) -> list:
    out, somma = [], 0.0
    for i, v in enumerate(curva):
        somma += v
        if i >= finestra:
            somma -= curva[i - finestra]
        out.append(somma / min(i + 1, finestra))
    return out


def avvisi(lista_passate: list, rischio: dict, fascia_min: int, nomi_vie: dict,
           soglia: float = 0.08, anticipo_s: int = 240, soglia_motivo: float = 0.004) -> list:
    """Gli avvisi in anticipo per l'operatore: le passate più rischiose, con i motivi."""
    out = []
    for p in lista_passate:
        r = riga_rischio(p, rischio, fascia_min)
        if not r or r["p_intervento"] < soglia:
            continue
        motivi = [NOMI_MOTIVI[k] for k, v in sorted(r.items(), key=lambda kv: -kv[1])
                  if k in NOMI_MOTIVI and v >= soglia_motivo]
        out.append({
            "ora_avviso": hm(p.t - anticipo_s), "ora_evento": hm(p.t),
            "veicolo_id": p.veicolo_id, "seg_id": p.seg_id,
            "nome_via": nomi_vie.get(p.seg_id, ""), "p_intervento": round(r["p_intervento"], 3),
            "motivi": motivi,
        })
    return sorted(out, key=lambda a: a["ora_evento"])
