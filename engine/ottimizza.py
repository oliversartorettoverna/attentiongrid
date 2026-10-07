"""Sfasamento delle partenze: sposta di qualche minuto la partenza di ogni veicolo per abbassare
il picco delle richieste attese. Algoritmo greedy, semplice e spiegabile in una frase:
"proviamo per ogni veicolo tutti gli spostamenti ammessi e teniamo quello che abbassa di più il picco".

Limiti: cambia solo l'orario di partenza, non il percorso; non garantisce la soluzione ottima
(un modello di programmazione lineare che minimizza il massimo la darebbe).
"""
from previsione import curva_richieste, media_mobile, passate


def picco(curva: list, finestra: int) -> float:
    liscia = media_mobile(curva, finestra)
    # massimo, più un piccolo termine che premia curve più piatte a parità di massimo
    return max(liscia) + 0.001 * sum(v * v for v in liscia)


def ottimizza(giri: list, rischio: dict, inizio_s: int, fine_s: int, fascia_min: int,
              spostamento_max_min: int = 10, passo_min: int = 1, finestra_min: int = 5,
              flotte: set | None = None) -> dict:
    veicoli = [g["veicolo_id"] for g in giri if not flotte or g["flotta"] in flotte]
    sposta = {v: 0 for v in veicoli}

    def valuta():
        c = curva_richieste(passate(giri, sposta, flotte), rischio, inizio_s, fine_s, fascia_min)
        return picco(c, finestra_min)

    migliore = valuta()
    for _ in range(2):                      # due giri completi bastano quasi sempre
        for v in veicoli:
            scelta = sposta[v]
            for s in range(-spostamento_max_min, spostamento_max_min + 1, passo_min):
                sposta[v] = s
                valore = valuta()
                if valore < migliore - 1e-9:
                    migliore, scelta = valore, s
            sposta[v] = scelta
    return sposta
