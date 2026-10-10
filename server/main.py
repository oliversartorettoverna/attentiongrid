"""Server locale di AttentionGrid: dà all'app i dati dello scenario, fa scorrere la giornata in diretta
(server/diretta.py, WebSocket /api/diretta) e, dopo `npm run build`, serve l'app stessa.

Uso (dalla radice del repository):
    .venv/bin/uvicorn server.main:app --port 8001

In sviluppo l'app gira con `npm run dev` in web/ e Vite inoltra qui le chiamate a /api e /data.
Gira tutto sul laptop: se cade la rete, mappa, simulatore e motore continuano.
"""
from pathlib import Path

from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from server.diretta import Diretta, Giornata

RADICE = Path(__file__).resolve().parents[1]
DATI = RADICE / "console" / "data"
APP_COSTRUITA = RADICE / "web" / "dist"

diretta = Diretta(Giornata(DATI / "scenario"))


@asynccontextmanager
async def ciclo_di_vita(_app):
    await diretta.avvia()
    yield


app = FastAPI(title="AttentionGrid", lifespan=ciclo_di_vita)


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
