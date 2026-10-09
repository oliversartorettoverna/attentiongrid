"""Analisi di sensibilità: il risultato regge se i pesi del rischio sono sbagliati?

Rilancia mappa del rischio e motore cambiando un parametro alla volta (−50% e +50% per ogni peso,
poi tutti insieme, poi durata degli interventi e attesa massima) e confronta i numeri del pitch.

Uso:
    python tools/sensibilita.py

Output: console/data/scenario/sensibilita.json (formato in docs/formati-dati.md) e una tabella a schermo.
Ci mette qualche minuto: ogni variante rifà rischio, ottimizzazione e rigioco.
"""
import contextlib
import copy
import importlib.util
import io
import json
import shutil
import sys
import tempfile
from pathlib import Path

import pandas as pd
import yaml

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE / "engine"))
sys.path.insert(0, str(RADICE / "data" / "scripts"))
from comune import PROCESSED, leggi_pesi, leggi_scenario  # noqa: E402
from pipeline import esegui  # noqa: E402

spec = importlib.util.spec_from_file_location("mappa_rischio", RADICE / "data/scripts/04_mappa_rischio.py")
mappa_rischio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mappa_rischio)

# Peso → dove sta in pesi_rischio.yaml. La pioggia moltiplica: si scala la parte sopra 1.
PESI = {
    "base": ("base",),
    "attraversamenti": ("attraversamenti", "per_attraversamento"),
    "doppia fila": ("doppia_fila", "contributo"),
    "uscita scuola": ("scuola", "contributo"),
    "pioggia": ("pioggia", "moltiplicatore"),
    "sottopasso": ("sottopasso", "contributo"),
    "GPS canyon": ("gps_canyon", "contributo"),
}
OPERATIVI = {
    "durata intervento": ("operatori", "durata_media_intervento_s"),
    "attesa massima": ("operatori", "attesa_max_s"),
}


def scala(diz: dict, chiave: tuple, k: float, moltiplicatore=False):
    d = diz
    for c in chiave[:-1]:
        d = d[c]
    d[chiave[-1]] = 1 + (d[chiave[-1]] - 1) * k if moltiplicatore else d[chiave[-1]] * k


def varianti():
    yield "riferimento", "", 1.0, {}, {}
    for nome, chiave in PESI.items():
        for k in (0.5, 1.5):
            yield nome, "pesi", k, {chiave: k}, {}
    for k in (0.5, 1.5):
        yield "tutti i pesi", "pesi", k, dict.fromkeys(PESI.values(), k), {}
    for nome, chiave in OPERATIVI.items():
        for k in (0.5, 1.5):
            yield nome, "operativi", k, {}, {chiave: k}


def main():
    sc, pesi = leggi_scenario(), leggi_pesi()
    tratti = mappa_rischio.carica_tratti()
    meteo = pd.read_csv(PROCESSED / "meteo.csv")
    righe = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        shutil.copy(PROCESSED / "meteo.csv", tmp / "meteo.csv")
        for nome, gruppo, k, su_pesi, su_scenario in varianti():
            p, s = copy.deepcopy(pesi), copy.deepcopy(sc)
            for chiave, f in su_pesi.items():
                scala(p, chiave, f, moltiplicatore=chiave == ("pioggia", "moltiplicatore"))
            for chiave, f in su_scenario.items():
                scala(s, chiave, f)
            mappa_rischio.calcola(tratti, meteo, s, p).to_csv(tmp / "rischio.csv", index=False)
            yaml.safe_dump(s, open(tmp / "scenario.yaml", "w", encoding="utf-8"), allow_unicode=True)
            with contextlib.redirect_stdout(io.StringIO()):
                r = esegui(RADICE / "sim/out/giri.json", tmp / "rischio.csv", PROCESSED / "tratti.geojson",
                           tmp / "out", tmp / "scenario.yaml")
            ps, pc = r["parita_servizio"]["senza"], r["parita_servizio"]["con"]
            riga = {
                "parametro": nome, "gruppo": gruppo, "fattore": k,
                "richieste": r["con"]["richieste"],
                "risparmio_ore_pct": round(100 * (1 - pc["ore_operatore"] / ps["ore_operatore"])),
                "veicoli_per_operatore_senza": ps["veicoli_per_operatore"],
                "veicoli_per_operatore_con": pc["veicoli_per_operatore"],
                "fermi_oltre_60s_senza": r["senza"]["veicoli_fermi_oltre_60s"],
                "fermi_oltre_60s_con": r["con"]["veicoli_fermi_oltre_60s"],
                "richieste_da_rosso_pct": r["attenzione"]["richieste_da_pct"]["rosso"],
            }
            righe.append(riga)
            print(f"{nome:18s} ×{k:<4} richieste {riga['richieste']:4d}  risparmio ore {riga['risparmio_ore_pct']:3d}%  "
                  f"veicoli/op {riga['veicoli_per_operatore_senza']} → {riga['veicoli_per_operatore_con']}  "
                  f"fermi>60s {riga['fermi_oltre_60s_senza']} → {riga['fermi_oltre_60s_con']}  "
                  f"dal rosso {riga['richieste_da_rosso_pct']}%", flush=True)

    varianti_ = [x for x in righe if x["gruppo"]]
    sintesi = {c: [min(x[c] for x in varianti_), max(x[c] for x in varianti_)]
               for c in ("risparmio_ore_pct", "veicoli_per_operatore_con", "fermi_oltre_60s_con", "richieste_da_rosso_pct")}
    out = RADICE / "console/data/scenario/sensibilita.json"
    json.dump({"varianti": righe, "intervalli": sintesi}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("\nIntervalli su tutte le varianti:", sintesi)
    print("Scritto", out)


if __name__ == "__main__":
    main()
