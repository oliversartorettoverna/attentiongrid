"""Il BOXi in sala: un telefono manda posizione e precisione del GPS a Supabase, il server le legge e lo tratta
come un veicolo della flotta.

All'aperto il GPS è preciso e il veicolo è nominale; entrando al chiuso la precisione peggiora davvero e lo
score scende (attenzione, poi critico); se il telefono smette di mandare segnali per `offline_dopo_s` il veicolo
è offline, collegamento perso. Quando diventa critico o va offline il server apre una richiesta per la postazione
della console, che l'operatore prende come le altre.

Paracadute per il palco: un comando forza "GPS debole" o "offline" se dal vivo qualcosa non va.
"""
import asyncio
import json
import time
import urllib.request
from datetime import datetime

ID = "boxi_sala"
ID_RICHIESTE = 1_000_000   # le richieste del BOXi in sala hanno numeri sopra quelli del rigioco


class DalVivo:
    def __init__(self, cfg: dict, cfg_gps: dict, url: str, chiave: str, sede: dict):
        self.cfg, self.gps = cfg, cfg_gps
        self.url, self.chiave = url.rstrip("/"), chiave
        self.sede = sede
        self.posizione = None          # ultima riga letta da Supabase
        self.ricevuto = 0.0            # quando (orologio del server) è arrivata l'ultima posizione nuova
        self.paracadute = None         # None, "gps" o "offline"
        self.episodio = None           # la richiesta aperta dal BOXi in sala: {"id", "inizio"}
        self.episodi = 0
        self.errore = ""

    # lettura da Supabase ------------------------------------------------------------------------
    def _leggi(self):
        req = urllib.request.Request(f"{self.url}/rest/v1/posizioni_live?veicolo=eq.{ID}&select=*",
                                     headers={"apikey": self.chiave, "Authorization": f"Bearer {self.chiave}"})
        with urllib.request.urlopen(req, timeout=4) as r:
            righe = json.loads(r.read())
        return righe[0] if righe else None

    async def segui(self):
        while True:
            if self.url and self.chiave:
                try:
                    riga = await asyncio.to_thread(self._leggi)
                    if riga and (not self.posizione or riga["aggiornato_il"] != self.posizione["aggiornato_il"]):
                        self.posizione, self.ricevuto = riga, time.monotonic()
                    self.errore = ""
                except Exception as e:   # rete assente: il veicolo andrà offline, come davvero
                    self.errore = str(e)[:120]
            await asyncio.sleep(self.cfg.get("lettura_ogni_s", 1))

    # stato --------------------------------------------------------------------------------------
    def stato(self) -> dict | None:
        """Posizione, precisione, stato e score del BOXi in sala; None se il telefono non si è mai collegato."""
        if not self.posizione and self.paracadute is None:
            return None
        pos = self.posizione or {"lat": self.sede["punto"][0], "lon": self.sede["punto"][1], "precisione_m": 5}
        eta = time.monotonic() - self.ricevuto if self.posizione else 0
        precisione = float(pos["precisione_m"])
        if self.paracadute == "gps":
            precisione = max(precisione, 60.0)
        offline = self.paracadute == "offline" or (self.posizione is not None and eta > self.cfg["offline_dopo_s"])
        if offline:
            livello, p = "offline", None
        else:
            extra = (self.cfg["contributo_critico"] if precisione >= self.cfg["critico_da_m"]
                     else self.gps["contributo_degradato"] if precisione >= self.cfg["attenzione_da_m"] else 0.0)
            p = 1 - (1 - self.cfg["probabilita_base"]) * (1 - extra)
            livello = "critico" if precisione >= self.cfg["critico_da_m"] else "attenzione" if extra else "nominale"
        return {"id": ID, "lat": pos["lat"], "lon": pos["lon"], "precisione_m": round(precisione, 1),
                "ultimo_segnale_s": round(eta, 1), "stato": livello, "p": None if p is None else round(p, 3),
                "paracadute": self.paracadute}

    def richiesta(self, t: float, stato: dict | None, miei: dict) -> dict | None:
        """La richiesta aperta dal BOXi in sala: nasce quando diventa critico o va offline, resta finché
        l'operatore non la chiude (o il veicolo torna normale prima che qualcuno la prenda)."""
        critico = stato is not None and stato["stato"] in ("critico", "offline")
        if self.episodio is None and critico:
            self.episodi += 1
            self.episodio = {"id": ID_RICHIESTE + self.episodi, "inizio": t, "reale": time.monotonic()}
        if self.episodio is None:
            return None
        mio = miei.get(self.episodio["id"])
        if mio and mio.get("chiuso") is not None:
            self.episodio = None       # chiusa: un nuovo episodio partirà alla prossima crisi
            return None
        if not mio and not critico:
            self.episodio = None       # tornato normale da solo prima che qualcuno la prendesse
            return None
        perso = stato is not None and stato["stato"] == "offline"
        return {"id": self.episodio["id"], "veicolo_id": ID, "seg_id": "", "inizio_piano": self.episodio["inizio"],
                "inizio": round(self.episodio["inizio"], 1), "attesa_s": 10**6, "durata_s": 0,
                "operatore": "tu" if mio else 2, "assegnata": not mio,
                "via": self.sede["nome"], "stato": "in_gestione" if mio else "in_attesa",
                "motivo_previsto": "collegamento perso" if perso else "GPS debole al chiuso",
                # il telefono vive nel tempo reale: attesa e gestione si contano in secondi veri, non sull'orologio
                # della giornata simulata (che può essere in pausa o accelerato)
                "secondi_reali": round(time.monotonic() - self.episodio["reale"], 1),
                "in_gestione_da_s": round(time.monotonic() - mio["preso_reale"], 1) if mio and mio.get("preso_reale") else None}

    def comando(self, valore):
        self.paracadute = valore if valore in ("gps", "offline") else None
