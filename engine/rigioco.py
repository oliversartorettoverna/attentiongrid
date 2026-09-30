"""Rigioco: estrae le richieste "vere" dalle probabilità e le mette in coda davanti agli operatori.

Per un confronto giusto tra "senza" e "con" si usano numeri casuali comuni: ogni passata ha il suo
numero casuale fisso (dipende da seme, veicolo e indice della passata), quindi le differenze
vengono solo dal sistema, non dalla fortuna.
"""
import random

from previsione import hms, prob


def estrai_richieste(lista_passate: list, rischio: dict, fascia_min: int, seme: int,
                     durata_media_s: float) -> list:
    richieste = []
    for p in lista_passate:
        chiave = f"{seme}|{p.veicolo_id}|{p.indice}"
        if random.Random(chiave).random() < prob(p, rischio, fascia_min):
            ritardo = random.Random(chiave + "|t").uniform(0, 30)
            durata = random.Random(chiave + "|d").expovariate(1 / durata_media_s)
            richieste.append({"t": p.t + ritardo, "veicolo_id": p.veicolo_id,
                              "seg_id": p.seg_id, "durata": max(15.0, durata)})
    return sorted(richieste, key=lambda r: r["t"])


def simula_coda(richieste: list, operatori_al_tempo, massimo_operatori: int = 60) -> list:
    """Coda unica, primo arrivato primo servito. `operatori_al_tempo(t)` dice quanti
    operatori sono in turno all'istante t (secondi)."""
    liberi_da = [0.0] * massimo_operatori
    eventi = []
    for r in richieste:
        n = max(1, min(massimo_operatori, operatori_al_tempo(r["t"])))
        i = min(range(n), key=lambda k: liberi_da[k])
        inizio = max(r["t"], liberi_da[i])
        liberi_da[i] = inizio + r["durata"]
        eventi.append({"ora": hms(r["t"]), "veicolo_id": r["veicolo_id"], "seg_id": r["seg_id"],
                       "tipo": "richiesta", "attesa_s": round(inizio - r["t"]),
                       "durata_s": round(r["durata"]), "operatore": i})
    return eventi


def kpi(eventi: list, n_veicoli: int, operatori_medi: float, operatori_picco: int) -> dict:
    if not eventi:
        return {"richieste": 0, "picco_richieste_insieme": 0, "attesa_media_s": 0, "attesa_max_s": 0,
                "veicoli_fermi_oltre_60s": 0, "operatori_medi": round(operatori_medi, 1),
                "operatori_necessari_al_picco": operatori_picco,
                "veicoli_per_operatore": round(n_veicoli / max(operatori_medi, 1e-9), 1)}
    from previsione import sec
    # richieste aperte nello stesso momento (in attesa o in gestione)
    intervalli = []
    for e in eventi:
        t0 = sec(e["ora"])
        intervalli += [(t0, 1), (t0 + e["attesa_s"] + e["durata_s"], -1)]
    aperte = picco = 0
    for _, d in sorted(intervalli):
        aperte += d
        picco = max(picco, aperte)
    attese = [e["attesa_s"] for e in eventi]
    return {
        "richieste": len(eventi),
        "picco_richieste_insieme": picco,
        "attesa_media_s": round(sum(attese) / len(attese)),
        "attesa_max_s": max(attese),
        "veicoli_fermi_oltre_60s": sum(1 for a in attese if a > 60),
        "operatori_medi": round(operatori_medi, 1),
        "operatori_necessari_al_picco": operatori_picco,
        "veicoli_per_operatore": round(n_veicoli / max(operatori_medi, 1e-9), 1),
    }
