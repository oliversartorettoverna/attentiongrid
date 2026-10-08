"""Sfasamento delle partenze: sposta di qualche minuto la partenza di ogni veicolo per abbassare
il picco delle richieste attese. Algoritmo greedy, semplice e spiegabile in una frase:
"proviamo per ogni veicolo tutti gli spostamenti ammessi e teniamo quello che abbassa di più il picco".

Si spostano solo le flotte sfasabili (le consegne); le navette seguono il loro orario di linea.
Per andare veloce con molti veicoli, la curva di ogni veicolo per ogni spostamento si calcola una
volta sola; poi il greedy somma e confronta.

Limiti: cambia solo l'orario di partenza, non il percorso; non garantisce la soluzione ottima
(un modello di programmazione lineare che minimizza il massimo la darebbe).
"""
import numpy as np

from previsione import curva_richieste, passate


def media_mobile(curva: np.ndarray, finestra: int) -> np.ndarray:
    somme = np.cumsum(np.concatenate([[0.0], curva]))
    i = np.arange(1, len(curva) + 1)
    inizio = np.maximum(0, i - finestra)
    return (somme[i] - somme[inizio]) / np.minimum(i, finestra)


def picco(curva: np.ndarray, finestra: int) -> float:
    liscia = media_mobile(curva, finestra)
    # massimo, più un piccolo termine che premia curve più piatte a parità di massimo
    return float(liscia.max() + 0.001 * (liscia ** 2).sum())


def ottimizza(giri: list, rischio: dict, inizio_s: int, fine_s: int, fascia_min: int,
              spostamento_max_min: int = 10, passo_min: int = 1, finestra_min: int = 5,
              flotte: set | None = None, sfasabili: set | None = None) -> dict:
    scelte = list(range(-spostamento_max_min, spostamento_max_min + 1, passo_min))
    fissi = np.zeros((fine_s - inizio_s) // 60)
    opzioni = {}
    for g in giri:
        if flotte and g["flotta"] not in flotte:
            continue
        v = g["veicolo_id"]
        if sfasabili is not None and g["flotta"] not in sfasabili:
            fissi += curva_richieste(passate([g]), rischio, inizio_s, fine_s, fascia_min)
            continue
        opzioni[v] = np.array([curva_richieste(passate([g], {v: s}), rischio, inizio_s, fine_s, fascia_min)
                               for s in scelte])
    zero = scelte.index(0)
    scelta = {v: zero for v in opzioni}
    totale = fissi + sum((o[zero] for o in opzioni.values()), np.zeros_like(fissi))
    migliore = picco(totale, finestra_min)
    for _ in range(2):                      # due giri completi bastano quasi sempre
        for v, o in opzioni.items():
            senza_v = totale - o[scelta[v]]
            valori = [picco(senza_v + o[k], finestra_min) for k in range(len(scelte))]
            k = int(np.argmin(valori))
            if valori[k] < migliore - 1e-9:
                migliore, scelta[v] = valori[k], k
            totale = senza_v + o[scelta[v]]
    return {v: scelte[k] for v, k in scelta.items()}
