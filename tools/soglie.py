"""Quali soglie per la griglia dell'attenzione? Confronta coppie di soglie sulla giornata della centrale.

Per ogni coppia (giallo da P ≥ osservazione, rosso da P ≥ intervento) misura:
- quanto tempo i veicoli in movimento passano in giallo e in rosso;
- da che livello arrivano le richieste (stato del veicolo `anticipo` minuti prima);
- quante volte più spesso un rosso chiede aiuto rispetto a un verde;
- quanti veicoli sono in rosso nello stesso momento, in media e al picco (il carico sugli operatori).

Legge console/data/scenario/attenzione.json (campo `p`) e rigioco.json (richieste con il sistema):
non rifà il motore, quindi prova molte coppie in pochi secondi.

Uso:
    python tools/soglie.py
"""
import json
from pathlib import Path

import numpy as np

RADICE = Path(__file__).resolve().parents[1]
SCENARIO = RADICE / "console/data/scenario"
OSSERVAZIONE = [0.10, 0.15, 0.20, 0.25]
INTERVENTO = [0.20, 0.25, 0.30, 0.35, 0.45]


def sec(hhmmss: str) -> int:
    h, m, *s = (int(x) for x in hhmmss.split(":"))
    return h * 3600 + m * 60 + (s[0] if s else 0)


def main():
    att = json.load(open(SCENARIO / "attenzione.json", encoding="utf-8"))
    rig = json.load(open(SCENARIO / "rigioco.json", encoding="utf-8"))
    inizio = sec(att["inizio"])
    anticipo_min = att["validazione"]["anticipo_s"] // 60
    veicoli = sorted(att["p"])
    n_min = max(len(s) for s in att["p"].values()) // 2
    # matrice veicoli × minuti con la probabilità; NaN quando il veicolo è fermo
    P = np.full((len(veicoli), n_min), np.nan)
    for i, v in enumerate(veicoli):
        s = att["p"][v]
        for k in range(len(s) // 2):
            c = s[2 * k:2 * k + 2]
            if c != "--":
                P[i, k] = int(c) / 100
    indice = {v: i for i, v in enumerate(veicoli)}
    # stato di ogni richiesta `anticipo` minuti prima
    p_prima = []
    for e in rig["con"]:
        k = (sec(e["ora"]) - inizio) // 60 - anticipo_min
        i = indice.get(e["veicolo_id"])
        p_prima.append(P[i, k] if i is not None and 0 <= k < n_min else np.nan)
    p_prima = np.array(p_prima)
    in_moto = ~np.isnan(P)
    print(f"{len(rig['con'])} richieste, {in_moto.sum()} minuti-veicolo in movimento, "
          f"stato {anticipo_min} minuti prima della richiesta\n")
    print(f"{'giallo da':>9s} {'rosso da':>8s} {'score':>9s} | {'tempo giallo':>12s} {'tempo rosso':>11s} | "
          f"{'richieste da rosso':>18s} {'da giallo o rosso':>17s} | {'rosso/verde':>11s} | {'in rosso insieme: media':>23s} {'picco':>5s}")
    for oss in OSSERVAZIONE:
        for inter in INTERVENTO:
            if inter <= oss:
                continue
            giallo = in_moto & (P >= oss) & (P < inter)
            rosso = in_moto & (P >= inter)
            verde = in_moto & (P < oss)
            valide = ~np.isnan(p_prima)
            da_rosso = np.sum(p_prima[valide] >= inter) / len(p_prima)
            da_allerta = np.sum(p_prima[valide] >= oss) / len(p_prima)
            da_verde = np.sum(p_prima[valide] < oss)
            freq_rosso = np.sum(p_prima[valide] >= inter) / max(rosso.sum(), 1)
            freq_verde = da_verde / max(verde.sum(), 1)
            rossi_insieme = rosso.sum(axis=0)
            minuti_attivi = in_moto.any(axis=0)
            print(f"{oss:9.2f} {inter:8.2f} {round(100 * (1 - oss)):4d}/{round(100 * (1 - inter)):<4d} | "
                  f"{100 * giallo.sum() / in_moto.sum():11.0f}% {100 * rosso.sum() / in_moto.sum():10.0f}% | "
                  f"{100 * da_rosso:17.0f}% {100 * da_allerta:16.0f}% | {freq_rosso / max(freq_verde, 1e-9):11.1f} | "
                  f"{rossi_insieme[minuti_attivi].mean():23.1f} {rossi_insieme.max():5.0f}")


if __name__ == "__main__":
    main()
