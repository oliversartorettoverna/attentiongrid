"""Registro degli interventi chiusi dall'operatore: prima su file locale, poi su Supabase.

Ogni intervento si scrive subito in server/registro_locale.jsonl (una riga per intervento), così non si
perde niente se cade la rete. Un compito in background manda a Supabase quelli non ancora inviati e riprova
finché non ci riesce. Ogni intervento ha un codice univoco: un reinvio non crea doppioni.

URL e chiave di Supabase stanno nel file .env alla radice del repository (fuori da git):
    SUPABASE_URL=https://<progetto>.supabase.co
    SUPABASE_CHIAVE=sb_publishable_...
Senza .env il registro resta solo locale.
"""
import asyncio
import json
import os
import urllib.request
import uuid
from pathlib import Path

RIPROVA_S = 5


def leggi_env(percorso: Path) -> dict:
    """Le righe CHIAVE=valore di un file .env, senza librerie in più."""
    if not percorso.exists():
        return {}
    out = {}
    for riga in percorso.read_text(encoding="utf-8").splitlines():
        riga = riga.strip()
        if riga and not riga.startswith("#") and "=" in riga:
            k, v = riga.split("=", 1)
            out[k.strip()] = v.strip()
    return out


class Registro:
    def __init__(self, file_locale: Path, env: Path, data_scenario: str, flotta_di: dict):
        self.file = file_locale
        self.data = data_scenario
        self.flotta_di = flotta_di
        cfg = {**leggi_env(env), **os.environ}
        self.url = cfg.get("SUPABASE_URL", "").rstrip("/")
        self.chiave = cfg.get("SUPABASE_CHIAVE", "")
        self.righe = [json.loads(r) for r in self.file.read_text(encoding="utf-8").splitlines() if r.strip()] \
            if self.file.exists() else []
        self.inviati: set[str] = set()   # codici già su Supabase in questa sessione del server
        self.errore = ""

    # registrazione --------------------------------------------------------------------------
    def aggiungi(self, giornata: str, chiuso: dict) -> dict:
        riga = {"codice": str(uuid.uuid4()), "giornata": giornata, "data": self.data,
                "richiesta_id": chiuso["id"], "veicolo_id": chiuso["veicolo_id"],
                "flotta_id": self.flotta_di.get(chiuso["veicolo_id"]), "via": chiuso.get("via", ""),
                "seg_id": chiuso.get("seg_id", ""), "chiamata_s": round(chiuso["chiamata"]),
                "attesa_s": chiuso["attesa_s"], "durata_s": chiuso["durata_s"], "azione": chiuso["azione"],
                "causa": chiuso["causa"], "motivo_previsto": chiuso.get("motivo_previsto", ""), "nota": chiuso.get("nota", ""),
                "operatore": chiuso.get("operatore", "tu")}
        self.righe.append(riga)
        with open(self.file, "a", encoding="utf-8") as f:
            f.write(json.dumps(riga, ensure_ascii=False) + "\n")
        return riga

    def della_giornata(self, giornata: str) -> list:
        return [r for r in self.righe if r["giornata"] == giornata]

    def stato(self) -> dict:
        return {"salvati": len(self.righe), "su_supabase": len(self.inviati & {r["codice"] for r in self.righe}),
                "collegato": bool(self.url and self.chiave), "errore": self.errore}

    # invio a Supabase -----------------------------------------------------------------------
    def _invia(self, righe: list):
        richiesta = urllib.request.Request(
            f"{self.url}/rest/v1/interventi?on_conflict=codice", data=json.dumps(righe).encode(), method="POST",
            headers={"apikey": self.chiave, "Authorization": f"Bearer {self.chiave}",
                     "Content-Type": "application/json", "Prefer": "resolution=ignore-duplicates,return=minimal"})
        with urllib.request.urlopen(richiesta, timeout=10) as r:
            r.read()

    async def sincronizza(self):
        """Manda a Supabase gli interventi non ancora inviati; se la rete manca riprova più tardi."""
        while True:
            da_inviare = [r for r in self.righe if r["codice"] not in self.inviati]
            if da_inviare and self.url and self.chiave:
                try:
                    await asyncio.to_thread(self._invia, da_inviare)
                    self.inviati.update(r["codice"] for r in da_inviare)
                    self.errore = ""
                except Exception as e:   # rete assente, Supabase non raggiungibile: si riprova
                    self.errore = str(e)[:120]
            await asyncio.sleep(RIPROVA_S)
