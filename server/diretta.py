"""La giornata in diretta: il server tiene l'orologio e lo stato delle richieste e lo manda alle schermate.

Come una piattaforma di teleguida vera, il server dice a ogni schermata che ora è, quali veicoli stanno
chiedendo aiuto e chi li sta gestendo. Un veicolo che chiede aiuto si ferma finché l'intervento non è
finito, poi riparte in ritardo sul suo piano: il ritardo si porta avanti per il resto della giornata.

Lo stato di un istante è una funzione pura dell'ora (`stato_a`): per questo si può fermare, accelerare
o saltare avanti e indietro senza perdere la coerenza. Le richieste vengono da rigioco.json (scenario
con sistema); posizioni e livelli dei veicoli li calcola l'app dai percorsi, spostati del ritardo.

Le giornate sono più d'una: quella prevista (`scenario`) e quella con il temporale un'ora prima del
previsto (`scenario_temporale_prima`, da `engine/pipeline.py --previsione-ore 1`): lì il piano dei turni
è fatto su una previsione sbagliata. Si passa dall'una all'altra senza fermare l'orologio.

L'operatore in console può prendere una richiesta in attesa ("prendi"), chiuderla con un'azione e la causa
confermata ("chiudi") o passarla a un collega ("rilascia"). Le richieste che non prende le gestiscono gli
operatori simulati, con attese e durate del rigioco. Quelle che il motore assegna alla postazione della console
aspettano l'operatore; se non le prende entro `passa_a_collega_dopo_s`, le prende un collega. Gli interventi
chiusi restano in `chiusi` per il registro.
"""
import asyncio
import csv
import json
import time
from collections import defaultdict
from pathlib import Path

import yaml
from fastapi import WebSocket, WebSocketDisconnect

INIZIO_DEMO_S = 15 * 3600 + 40 * 60     # 15:40, poco prima del temporale
GIORNO_S = (6 * 3600, 24 * 3600 - 1)
VELOCITA = (1, 10, 30, 60)
INVIO_S = 0.25                          # ogni quanto si manda lo stato alle schermate


def sec(hhmmss: str) -> int:
    h, m, *s = (int(x) for x in hhmmss.split(":"))
    return h * 3600 + m * 60 + (s[0] if s else 0)


GIORNATE = {"previsto": "scenario", "prima": "scenario_temporale_prima"}


def richieste_per_veicolo(cartella: Path) -> dict:
    """Le richieste di ogni veicolo in ordine: l'ora è quella del piano, il ritardo la sposta.
    Via e motivo previsto vengono dal registro del motore, che ha una riga per richiesta nello stesso ordine."""
    rig = json.load(open(cartella / "rigioco.json", encoding="utf-8"))
    registro = list(csv.DictReader(open(cartella / "registro_interventi.csv", encoding="utf-8")))
    per_veicolo = defaultdict(list)
    for i, e in enumerate(rig["con"]):
        riga = registro[i] if i < len(registro) and registro[i]["veicolo"] == e["veicolo_id"] else {}
        per_veicolo[e["veicolo_id"]].append(
            {"id": i, "veicolo_id": e["veicolo_id"], "seg_id": e["seg_id"], "inizio_piano": sec(e["ora"]),
             "attesa_s": e["attesa_s"], "durata_s": e["durata_s"], "operatore": e["operatore"],
             "via": riga.get("via", ""), "motivo_previsto": riga.get("motivo_previsto", "")})
    return per_veicolo


AZIONI = ("riparte", "deviato", "assistenza", "arresto")


class Giornata:
    def __init__(self, dati: Path, config: Path, registro=None):
        self.registro = registro    # server/registro.py: file locale e Supabase
        cfg = yaml.safe_load(open(config, encoding="utf-8")).get("console", {})
        # dopo la chiusura il veicolo resta fermo ancora per un po' con queste azioni
        self.fermo_dopo = {"assistenza": cfg.get("fermo_assistenza_min", 10) * 60,
                           "arresto": cfg.get("fermo_arresto_min", 15) * 60}
        self.cause = cfg.get("cause", [])
        # le richieste che il motore assegna alla postazione della console aspettano l'operatore
        self.postazione = cfg.get("postazione", 3) - 1
        self.passa_dopo = cfg.get("passa_a_collega_dopo_s", 60)
        # interventi dell'operatore in console, per giornata: id richiesta → preso, chiuso, azione, causa
        self.miei = defaultdict(dict)
        self.chiusi = defaultdict(list)
        # le giornate disponibili: la prevista c'è sempre, le altre se il motore le ha preparate
        self.giornate = {k: richieste_per_veicolo(dati / c) for k, c in GIORNATE.items() if (dati / c / "rigioco.json").exists()}
        self.temporale = "previsto"
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
        elif tipo == "temporale" and c.get("valore") in self.giornate:
            self.temporale = c["valore"]
        elif tipo in ("prendi", "chiudi", "rilascia"):
            self._intervento(tipo, c)

    def _intervento(self, tipo: str, c: dict):
        miei = self.miei[self.temporale]
        aperta = next((r for r in self.stato_a(self.t)["richieste"] if r["id"] == c.get("id")), None)
        if aperta is None:
            return
        if tipo == "prendi" and aperta["stato"] == "in_attesa":
            miei[aperta["id"]] = {"preso": self.t, "chiuso": None, "azione": None, "causa": None}
        elif tipo == "rilascia" and aperta["operatore"] == "tu" and aperta["stato"] == "in_gestione":
            # la prende un collega da adesso, con la durata del rigioco: il tempo già passato con te resta
            miei[aperta["id"]]["ceduto"] = self.t
        elif (tipo == "chiudi" and aperta["operatore"] == "tu" and aperta["stato"] == "in_gestione"
              and c.get("azione") in AZIONI):
            m = miei[aperta["id"]]
            m.update(chiuso=self.t, azione=c["azione"], causa=str(c.get("causa") or "Altro"), nota=str(c.get("nota") or "")[:500])
            chiuso = {
                "id": aperta["id"], "veicolo_id": aperta["veicolo_id"], "seg_id": aperta["seg_id"], "via": aperta["via"],
                "chiamata": aperta["inizio"], "attesa_s": round(m["preso"] - aperta["inizio"]),
                "durata_s": round(self.t - m["preso"]), "azione": m["azione"], "causa": m["causa"],
                "motivo_previsto": aperta["motivo_previsto"], "nota": m["nota"], "operatore": "tu"}
            self.chiusi[self.temporale].append(chiuso)
            if self.registro:
                self.registro.aggiungi(self.temporale, chiuso)

    # stato ----------------------------------------------------------------------------------
    def stato_a(self, t: float) -> dict:
        """Ritardo di ogni veicolo e richieste aperte all'ora t.

        Per ogni veicolo si scorrono le sue richieste: la richiesta parte quando l'orologio del veicolo
        (t meno il ritardo accumulato) arriva all'ora del piano; il veicolo resta fermo per attesa + durata."""
        ritardi, aperte = {}, []
        for v, lista in self.giornate[self.temporale].items():
            ritardo = 0.0
            for r in lista:
                partenza = r["inizio_piano"] + ritardo
                if partenza > t:
                    break
                mio = self.miei[self.temporale].get(r["id"])
                if mio and mio["preso"] <= t:
                    ceduto = mio.get("ceduto")
                    if ceduto is not None and ceduto <= t:
                        # passata a un collega: la prende da quel momento e ci mette la durata del rigioco
                        fine = ceduto + r["durata_s"]
                        if t < fine:
                            aperte.append({**r, "inizio": round(partenza, 1), "operatore": self.postazione + 1,
                                           "assegnata": False, "attesa_s": round(ceduto - partenza),
                                           "stato": "in_gestione"})
                            ritardo += t - partenza
                            break
                        ritardo += fine - partenza
                        continue
                    # presa dall'operatore in console: il veicolo resta fermo finché non la chiude, più il fermo
                    # dell'azione scelta (assistenza in strada, arresto)
                    fine = mio["chiuso"] + self.fermo_dopo.get(mio["azione"], 0) if mio["chiuso"] is not None else None
                    if fine is None or t < fine:
                        aperte.append({**r, "inizio": round(partenza, 1), "operatore": "tu",
                                       "attesa_s": round(mio["preso"] - partenza),
                                       "stato": "in_gestione" if mio["chiuso"] is None else mio["azione"],
                                       **({"riparte": round(fine, 1)} if fine is not None else {})})
                        ritardo += t - partenza
                        break
                    ritardo += fine - partenza
                    continue
                attesa = r["attesa_s"]
                assegnata = r["operatore"] == self.postazione
                if assegnata:
                    attesa = max(attesa, self.passa_dopo)   # aspetta l'operatore in console, poi un collega
                fine = partenza + attesa + r["durata_s"]
                if t < fine:
                    trascorsi = t - partenza
                    aperte.append({**r, "inizio": round(partenza, 1), "attesa_s": attesa, "assegnata": assegnata,
                                   "stato": "in_attesa" if trascorsi < attesa else "in_gestione"})
                    ritardo += trascorsi
                    break
                ritardo += attesa + r["durata_s"]
            if ritardo:
                ritardi[v] = round(ritardo, 1)
        aperte.sort(key=lambda r: r["inizio"])
        return {"ritardi": ritardi, "richieste": aperte}

    def messaggio(self) -> dict:
        self.avanza()
        return {"t": round(self.t, 2), "velocita": self.velocita, "in_corsa": self.in_corsa,
                "temporale": self.temporale, "scenario": GIORNATE[self.temporale],
                "temporali": list(self.giornate), "cause": self.cause,
                "chiusi": self.chiusi[self.temporale][-50:],
                "registro": self.registro.stato() if self.registro else None, **self.stato_a(self.t)}


class Diretta:
    """Le schermate collegate: ricevono lo stato a intervalli regolari e possono mandare comandi."""

    def __init__(self, giornata: Giornata):
        self.giornata = giornata
        self.collegate: set[WebSocket] = set()
        self._compito = None

    async def avvia(self):
        self._compito = asyncio.create_task(self._trasmetti())
        if self.giornata.registro:
            self._sincronizza = asyncio.create_task(self.giornata.registro.sincronizza())

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
