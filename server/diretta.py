"""La giornata in diretta: il server tiene l'orologio e lo stato delle richieste e lo manda alle schermate.

Come una piattaforma di teleguida vera, il server dice a ogni schermata che ora è, quali veicoli stanno
chiedendo aiuto e chi li sta gestendo. Un veicolo che chiede aiuto si ferma finché l'intervento non è
finito, poi riparte in ritardo sul suo piano: il ritardo si porta avanti per il resto della giornata.

Lo stato di un istante è una funzione pura dell'ora (`stato_a`): per questo si può fermare, accelerare
o saltare avanti e indietro senza perdere la coerenza. Le richieste vengono da rigioco.json (scenario
con sistema); posizioni e livelli dei veicoli li calcola l'app dai percorsi, spostati del ritardo.
"""
import asyncio
import json
import time
from collections import defaultdict
from pathlib import Path

from fastapi import WebSocket, WebSocketDisconnect

INIZIO_DEMO_S = 15 * 3600 + 40 * 60     # 15:40, poco prima del temporale
GIORNO_S = (6 * 3600, 24 * 3600 - 1)
VELOCITA = (1, 10, 30, 60)
INVIO_S = 0.25                          # ogni quanto si manda lo stato alle schermate


def sec(hhmmss: str) -> int:
    h, m, *s = (int(x) for x in hhmmss.split(":"))
    return h * 3600 + m * 60 + (s[0] if s else 0)


class Giornata:
    def __init__(self, cartella: Path):
        rig = json.load(open(cartella / "rigioco.json", encoding="utf-8"))
        # le richieste di ogni veicolo in ordine: l'ora è quella del piano, il ritardo la sposta
        self.per_veicolo = defaultdict(list)
        for i, e in enumerate(rig["con"]):
            self.per_veicolo[e["veicolo_id"]].append(
                {"id": i, "veicolo_id": e["veicolo_id"], "seg_id": e["seg_id"], "inizio_piano": sec(e["ora"]),
                 "attesa_s": e["attesa_s"], "durata_s": e["durata_s"], "operatore": e["operatore"]})
        self.t = float(INIZIO_DEMO_S)
        self.velocita = 30
        self.in_corsa = False
        self._ultimo = time.monotonic()

    # orologio -------------------------------------------------------------------------------
    def avanza(self):
        ora = time.monotonic()
        if self.in_corsa:
            self.t = min(GIORNO_S[1], self.t + (ora - self._ultimo) * self.velocita)
            if self.t >= GIORNO_S[1]:
                self.in_corsa = False
        self._ultimo = ora

    def comando(self, c: dict):
        self.avanza()
        tipo = c.get("comando")
        if tipo == "avvia":
            self.in_corsa = not self.in_corsa if "valore" not in c else bool(c["valore"])
        elif tipo == "velocita" and c.get("valore") in VELOCITA:
            self.velocita = c["valore"]
        elif tipo == "vai" and isinstance(c.get("valore"), (int, float)):
            self.t = float(min(GIORNO_S[1], max(GIORNO_S[0], c["valore"])))

    # stato ----------------------------------------------------------------------------------
    def stato_a(self, t: float) -> dict:
        """Ritardo di ogni veicolo e richieste aperte all'ora t.

        Per ogni veicolo si scorrono le sue richieste: la richiesta parte quando l'orologio del veicolo
        (t meno il ritardo accumulato) arriva all'ora del piano; il veicolo resta fermo per attesa + durata."""
        ritardi, aperte = {}, []
        for v, lista in self.per_veicolo.items():
            ritardo = 0.0
            for r in lista:
                partenza = r["inizio_piano"] + ritardo
                if partenza > t:
                    break
                fine = partenza + r["attesa_s"] + r["durata_s"]
                if t < fine:
                    trascorsi = t - partenza
                    aperte.append({**r, "inizio": round(partenza, 1),
                                   "stato": "in_attesa" if trascorsi < r["attesa_s"] else "in_gestione"})
                    ritardo += trascorsi
                    break
                ritardo += r["attesa_s"] + r["durata_s"]
            if ritardo:
                ritardi[v] = round(ritardo, 1)
        aperte.sort(key=lambda r: r["inizio"])
        return {"ritardi": ritardi, "richieste": aperte}

    def messaggio(self) -> dict:
        self.avanza()
        return {"t": round(self.t, 2), "velocita": self.velocita, "in_corsa": self.in_corsa, **self.stato_a(self.t)}


class Diretta:
    """Le schermate collegate: ricevono lo stato a intervalli regolari e possono mandare comandi."""

    def __init__(self, giornata: Giornata):
        self.giornata = giornata
        self.collegate: set[WebSocket] = set()
        self._compito = None

    async def avvia(self):
        self._compito = asyncio.create_task(self._trasmetti())

    async def _trasmetti(self):
        while True:
            if self.collegate:
                testo = json.dumps(self.giornata.messaggio(), separators=(",", ":"))
                for ws in list(self.collegate):
                    try:
                        await ws.send_text(testo)
                    except Exception:
                        self.collegate.discard(ws)
            await asyncio.sleep(INVIO_S)

    async def collega(self, ws: WebSocket):
        await ws.accept()
        self.collegate.add(ws)
        await ws.send_text(json.dumps(self.giornata.messaggio(), separators=(",", ":")))
        try:
            while True:
                self.giornata.comando(json.loads(await ws.receive_text()))
                # dopo un comando lo stato nuovo arriva subito a tutte le schermate
                testo = json.dumps(self.giornata.messaggio(), separators=(",", ":"))
                for altra in list(self.collegate):
                    try:
                        await altra.send_text(testo)
                    except Exception:
                        self.collegate.discard(altra)
        except (WebSocketDisconnect, json.JSONDecodeError, RuntimeError):
            self.collegate.discard(ws)
