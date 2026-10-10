"""Le leve in tempo reale sopra il piano dei turni, con i preavvisi che una centrale ha davvero.

Il piano si fa il giorno prima sulla previsione. Durante la giornata la centrale vede le condizioni vere
con un certo anticipo (aggiornamento meteo e radar: `preavviso_meteo_min`) e i veicoli che stanno per
entrare nelle strade a rischio (griglia dell'attenzione). Con queste informazioni usa quattro leve:

1. operatori misti: una quota di chi è in turno fa back-office e passa alla supervisione in 1 minuto
   quando il carico atteso nei prossimi `orizzonte_min` minuti supera la capacità; le ore sono già nel piano;
2. prolungamento turno: chi finisce può restare fino a `prolungamento_max_min` in più, deciso con
   `prolungamento_preavviso_min` di anticipo, pagato con la maggiorazione dello straordinario;
3. reperibilità: `reperibili_per_turno` persone per ogni turno fisso, pagate con un'indennità; chiamate con
   `reperibilita_preavviso_min` di anticipo, restano almeno `reperibilita_durata_min_min`;
4. meno richieste: se il carico supera comunque la capacità, le partenze delle consegne slittano fino a
   `ritardo_partenze_max_min` e i veicoli sostano prima delle vie più a rischio (fino a `sosta_max_min`
   a veicolo nella giornata). Si contano i minuti di ritardo sulle consegne.
"""
import math
from dataclasses import replace

import numpy as np

from erlang import operatori_necessari
from previsione import prob, sec

SOSTA_MAX_S = 600       # come in pipeline: una pausa più lunga separa due giri


def necessari_prossimi(curva_vera: list, orizzonte: int, durata_s: float, attesa_s: float, livello: float) -> list:
    """Operatori che servono per il carico atteso nei prossimi `orizzonte` minuti, minuto per minuto."""
    n = len(curva_vera)
    out = []
    for m in range(n):
        finestra = curva_vera[m:min(n, m + orizzonte)]
        out.append(operatori_necessari(sum(finestra) / len(finestra), durata_s, attesa_s, livello))
    return out


def leve_operatori(piano: list, serve: list, turni_min: list, tr: dict) -> dict:
    """Leve 1–3: capacità minuto per minuto e ore di straordinario e reperibilità usate."""
    n = len(piano)
    straord, reper = [0] * n, [0] * n
    usati = {t: 0 for t in range(len(turni_min))}
    p_pre, p_max = tr["prolungamento_preavviso_min"], tr["prolungamento_max_min"]
    r_pre, r_dur = tr["reperibilita_preavviso_min"], tr["reperibilita_durata_min_min"]

    def capacita(k):
        return piano[k] + straord[k] + reper[k]

    for m in range(n):
        # leva 2: a `p_pre` minuti da un calo del piano, chi esce resta se nell'ora dopo mancheranno operatori
        b = m + p_pre
        if 0 < b < n and piano[b] < piano[b - 1]:
            finestra = range(b, min(n, b + p_max))
            mancanze = [serve[k] - capacita(k) for k in finestra]
            quanti = min(piano[b - 1] - piano[b], max(0, max(mancanze)))
            if quanti > 0:
                ultimo = max(i for i, x in enumerate(mancanze) if x > 0)
                fine = min(n, b + 15 * math.ceil((ultimo + 1) / 15))
                for k in range(b, fine):
                    straord[k] += quanti
        # leva 3: reperibili chiamati con `r_pre` minuti di anticipo, se allora mancheranno operatori
        a = m + r_pre
        if a < n:
            manca = serve[a] - capacita(a)
            if manca > 0:
                turno = next((i for i, (x, y) in enumerate(turni_min) if x <= a < y), None)
                if turno is not None:
                    quanti = min(manca, tr["reperibili_per_turno"] - usati[turno])
                    if quanti > 0:
                        usati[turno] += quanti
                        for k in range(a, min(n, a + r_dur)):
                            reper[k] += quanti
    capacita_tot = [capacita(k) for k in range(n)]
    # leva 1: i misti fanno back-office quando non servono; passano in 1 minuto, quindi la capacità resta
    misti = [round(tr["quota_misti"] * p) for p in piano]
    back_office = sum(max(0, min(misti[k], capacita_tot[k] - serve[k])) for k in range(n)) / 60
    return {"capacita": capacita_tot, "straordinario": straord, "reperibili": reper,
            "reperibili_chiamati": sum(usati.values()), "ore_back_office": round(back_office, 1)}


def riduci_richieste(lista_passate: list, giri: list, capacita: list, serve: list, rischio: dict, fascia: int,
                     inizio_s: int, sfasabili: set, tr: dict) -> dict:
    """Leva 4: dove il carico atteso supera la capacità, ritarda le partenze delle consegne e fa sostare i
    veicoli prima delle vie più a rischio. Restituisce le passate spostate e i minuti di ritardo sulle consegne."""
    n = len(capacita)
    sovraccarico = [serve[m] > capacita[m] for m in range(n)]

    def fine_sovraccarico(m):
        while 0 <= m < n and sovraccarico[m]:
            m += 1
        return m

    # soglia delle vie più a rischio, fascia per fascia
    per_fascia = {}
    for (_, f), r in rischio.items():
        per_fascia.setdefault(f, []).append(r["p_intervento"])
    soglia = {f: float(np.quantile(v, 1 - tr["quota_vie_rischio"])) for f, v in per_fascia.items()}

    fermate = {g["veicolo_id"]: [f[0] for f in g["fermate"]] for g in giri}
    per_veicolo = {}
    for p in lista_passate:
        per_veicolo.setdefault(p.veicolo_id, []).append(p)

    nuove, ritardo_consegne, consegne_ritardate, trattenuti = [], 0.0, 0, 0
    for v, lista in per_veicolo.items():
        lista.sort(key=lambda p: p.t)
        consegne = fermate.get(v, [])
        ritardo = 0.0                                   # spostamento accumulato del giro in corso (secondi)
        sosta_usata = 0.0
        inizio_giro = True
        precedente = None
        spostamenti = []                                # (da quando, quanto) per contare le consegne in ritardo
        for p in lista:
            if precedente is not None and p.t - precedente > SOSTA_MAX_S:
                ritardo, inizio_giro = 0.0, True        # nuovo giro: parte dal suo orario
            precedente = p.t
            t = p.t + ritardo
            m = int((t - inizio_s) // 60)
            if 0 <= m < n and sovraccarico[m]:
                attesa_min = fine_sovraccarico(m) - m
                if inizio_giro and p.flotta in sfasabili:
                    d = min(attesa_min, tr["ritardo_partenze_max_min"]) * 60
                    ritardo += d
                    spostamenti.append((p.t, d))
                else:
                    f = f"{int(t // 3600):02d}:{int(t % 3600 // 60) // fascia * fascia:02d}"
                    if prob(replace(p, t=int(t)), rischio, fascia) >= soglia.get(f, 1.0):
                        d = min(attesa_min * 60, tr["sosta_max_min"] * 60 - sosta_usata)
                        if d > 0:
                            ritardo += d
                            sosta_usata += d
                            spostamenti.append((p.t, d))
            inizio_giro = False
            nuove.append(replace(p, t=int(p.t + ritardo)))
        if spostamenti:
            trattenuti += 1
            if lista[0].flotta in sfasabili:
                # fine di ogni giro: l'ultima passata prima di una pausa lunga
                fini = [a.t for a, b in zip(lista, lista[1:]) if b.t - a.t > SOSTA_MAX_S] + [lista[-1].t]
                for tc in consegne:
                    fine_giro = next((x for x in fini if x >= tc), lista[-1].t)
                    d = sum(x for da, x in spostamenti if da <= tc <= fine_giro and
                            next((y for y in fini if y >= da), lista[-1].t) == fine_giro)
                    if d > 0:
                        ritardo_consegne += d / 60
                        consegne_ritardate += 1
    return {"passate": nuove, "ritardo_consegne_min": round(ritardo_consegne), "consegne_ritardate": consegne_ritardate,
            "veicoli_trattenuti": trattenuti}


def costo_giornata(piano: list, leve: dict | None, euro_ora: float, tr: dict, turni_min: list) -> dict:
    """Ore pagate e costo della giornata: piano + straordinario (maggiorato) + reperibili lavorate + indennità."""
    ore_piano = sum(piano) / 60
    ore_straord = sum(leve["straordinario"]) / 60 if leve else 0.0
    ore_reper = sum(leve["reperibili"]) / 60 if leve else 0.0
    indennita = 0.0
    if leve:
        ore_reperibilita = sum((b - a) / 60 for a, b in turni_min) * tr["reperibili_per_turno"]
        indennita = ore_reperibilita * tr["indennita_reperibilita_quota"] * euro_ora
    costo = (ore_piano + ore_straord * (1 + tr["maggiorazione_straordinario"]) + ore_reper) * euro_ora + indennita
    return {"ore_pagate": round(ore_piano + ore_straord + ore_reper, 1), "ore_piano": round(ore_piano, 1),
            "ore_straordinario": round(ore_straord, 1), "ore_reperibili": round(ore_reper, 1),
            "indennita_euro": round(indennita), "costo_euro": round(costo)}


def turni_in_minuti(turni: list, inizio_s: int, n: int) -> list:
    return [(max(0, (sec(a) - inizio_s) // 60), min(n, (sec(b) - inizio_s) // 60)) for a, b in turni]
