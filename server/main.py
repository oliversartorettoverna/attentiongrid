"""Server locale di AttentionGrid: dà all'app i dati dello scenario, fa scorrere la giornata in diretta
(server/diretta.py, WebSocket /api/diretta), salva gli interventi chiusi in locale e su Supabase
(server/registro.py, /api/interventi) e, dopo `npm run build`, serve l'app stessa.

Uso (dalla radice del repository):
    .venv/bin/uvicorn server.main:app --port 8001

In sviluppo l'app gira con `npm run dev` in web/ e Vite inoltra qui le chiamate a /api e /data.
Gira tutto sul laptop: se cade la rete, mappa, simulatore e motore continuano.
"""
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from fastapi import Body, FastAPI, HTTPException, WebSocket
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from server.diretta import Diretta, Giornata
from server.copilota import Copilota, sigla
from server.registro import Registro, leggi_env

RADICE = Path(__file__).resolve().parents[1]
DATI = RADICE / "console" / "data"
APP_COSTRUITA = RADICE / "web" / "dist"

CONFIG = RADICE / "config" / "scenario.yaml"
# AG_REGISTRO: un altro file locale (per esempio per un server di prova che non deve toccare quello vero)
registro = Registro(Path(os.environ.get("AG_REGISTRO", Path(__file__).with_name("registro_locale.jsonl"))), RADICE / ".env",
                    str(yaml.safe_load(open(CONFIG, encoding="utf-8"))["giorno"]["data"]),
                    {v["veicolo_id"]: v["flotta"] for v in json.load(open(DATI / "scenario" / "veicoli.json"))["veicoli"]})
diretta = Diretta(Giornata(DATI, CONFIG, registro))
_cfg = yaml.safe_load(open(CONFIG, encoding="utf-8"))
_veicoli = json.load(open(DATI / "scenario" / "veicoli.json"))
NOME_FLOTTA = {v["veicolo_id"]: _veicoli["flotte"][v["flotta"]]["nome"] for v in _veicoli["veicoli"]}
copilota = Copilota(_cfg.get("copilota", {}), leggi_env(RADICE / ".env"))


@asynccontextmanager
async def ciclo_di_vita(_app):
    await diretta.avvia()
    yield


app = FastAPI(title="AttentionGrid", lifespan=ciclo_di_vita)


@app.get("/api/interventi")
def interventi(giornata: str = "previsto"):
    """Gli interventi chiusi dall'operatore in console in quella giornata, con la causa confermata."""
    return registro.della_giornata(giornata)


@app.post("/api/copilota/{richiesta_id}")
async def suggerimento(richiesta_id: int, dati: dict = Body(default={})):
    """Il copilota legge la richiesta aperta e quello che si sa della via, e suggerisce un'azione."""
    g = diretta.giornata
    aperta = next((r for r in g.stato_a(g.t)["richieste"] if r["id"] == richiesta_id), None)
    if aperta is None:
        raise HTTPException(404, "richiesta non più aperta")
    via = aperta["via"]
    oggi = [r for lista in g.giornate[g.temporale].values() for r in lista
            if r["via"] == via and r["inizio_piano"] < aperta["inizio_piano"]]
    confermate = [r["causa"] for r in registro.della_giornata(g.temporale) if r["via"] == via]
    ctx = {"veicolo": sigla(aperta["veicolo_id"]), "flotta": NOME_FLOTTA.get(aperta["veicolo_id"], ""), "via": via,
           "motivo_previsto": aperta["motivo_previsto"], "score": dati.get("score"), "pioggia_mm": dati.get("pioggia_mm"),
           "ora": f"{int(g.t) // 3600:02d}:{int(g.t) % 3600 // 60:02d}", "secondi_di_attesa": round(g.t - aperta["inizio"]),
           "richieste_oggi_sulla_via": len(oggi), "cause_confermate_oggi_sulla_via": confermate[-5:]}
    return await copilota.suggerisci((g.temporale, richiesta_id), ctx)


@app.websocket("/api/diretta")
async def giornata_in_diretta(ws: WebSocket):
    await diretta.collega(ws)


@app.get("/api/salute")
def salute():
    scenari = sorted(p.name for p in DATI.iterdir() if p.is_dir())
    return {"stato": "ok", "scenari": scenari}


app.mount("/data", StaticFiles(directory=DATI), name="dati")
if APP_COSTRUITA.exists():
    app.mount("/assets", StaticFiles(directory=APP_COSTRUITA / "assets"), name="assets")

    @app.get("/{percorso:path}")
    def pagina(percorso: str):
        """I file della build se esistono, altrimenti index.html: le schermate (/console, /planner…) le gestisce React."""
        file = (APP_COSTRUITA / percorso).resolve()
        if percorso and file.is_file() and file.is_relative_to(APP_COSTRUITA):
            return FileResponse(file)
        return FileResponse(APP_COSTRUITA / "index.html")
