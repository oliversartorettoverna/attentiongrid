"""Server locale di AttentionGrid: dà all'app i dati dello scenario e, dopo `npm run build`, l'app stessa.

Uso (dalla radice del repository):
    .venv/bin/uvicorn server.main:app --port 8001

In sviluppo l'app gira con `npm run dev` in web/ e Vite inoltra qui le chiamate a /api e /data.
Gira tutto sul laptop: se cade la rete, mappa, simulatore e motore continuano.
"""
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

RADICE = Path(__file__).resolve().parents[1]
DATI = RADICE / "console" / "data"
APP_COSTRUITA = RADICE / "web" / "dist"

app = FastAPI(title="AttentionGrid")


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
