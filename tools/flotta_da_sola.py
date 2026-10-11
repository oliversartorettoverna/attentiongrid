"""Quanto spende ogni flotta se si tiene una centrale tutta sua, senza le altre?

È l'alternativa del cliente al servizio: il motore gira su una flotta alla volta e dà le ore operatore
al giorno con i turni fissi sul picco di ogni turno e con il nostro piano prudente (chi compra la licenza).
I costi in euro li fa l'app, per ogni paese: ore × costo orario × 365 / 12 / veicoli.

Uso:
    python tools/flotta_da_sola.py

Scrive console/data/scenario/da_sola.json (formato in docs/formati-dati.md).
"""
import contextlib
import io
import json
import sys
import tempfile
from pathlib import Path

import yaml

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE / "engine"))
from pipeline import esegui  # noqa: E402


def main():
    flotte = yaml.safe_load(open(RADICE / "config/scenario.yaml", encoding="utf-8"))["flotte"]
    risultato = {}
    for f in flotte:
        with tempfile.TemporaryDirectory() as cartella, contextlib.redirect_stdout(io.StringIO()):
            r = esegui(RADICE / "sim/out/giri.json", RADICE / "data/processed/rischio.csv.gz",
                       RADICE / "data/processed/tratti.geojson", cartella, RADICE / "config/scenario.yaml",
                       {f}, RADICE / "config/economia.yaml")
        d, p = r["per_flotta"][f], r["parita_servizio"]
        risultato[f] = {"veicoli": d["veicoli"], "ore_servizio_per_veicolo": d["ore_servizio_per_veicolo"],
                        "ore_operatore": {"turni_fissi": p["senza_turni"]["ore_operatore"],
                                          "piano": p["con"]["ore_operatore"]}}
        print(f"{d['nome']:24s} turni fissi {p['senza_turni']['ore_operatore']:6} ore operatore  "
              f"piano prudente {p['con']['ore_operatore']:6}  "
              f"(€{p['senza_turni']['costo_veicolo_mese']} / €{p['con']['costo_veicolo_mese']} per veicolo al mese)")
    out = RADICE / "console/data/scenario/da_sola.json"
    out.write_text(json.dumps(risultato, ensure_ascii=False, separators=(",", ":")))
    print(f"Scritto {out.relative_to(RADICE)}")


if __name__ == "__main__":
    main()
