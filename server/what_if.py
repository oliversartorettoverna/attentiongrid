"""What-if nel planner a parole: "e se domani c'è un evento grande a San Pietro alle 17?".

Il copilota (Claude) capisce dalla frase luogo, ora, grandezza e durata; i numeri e la risposta li fa il motore
(engine/what_if.py), così sono sempre gli stessi con o senza rete. Senza chiave, senza rete o se Claude non risponde
entro `copilota.attesa_what_if_s`, la frase la legge un ripiego che riconosce l'ora e i nomi dei luoghi di config/scenario.yaml.
"""
import asyncio
import json
import re

import anthropic

ISTRUZIONI = """Il responsabile di una centrale che supervisiona veicoli autonomi a Roma scrive una domanda su un evento
di domani. Estrai dalla frase:
- luogo: uno dei luoghi dell'elenco, oppure "sconosciuto" se non è nessuno di questi;
- ora: l'ora di inizio dell'evento nel formato HH:MM (24 ore), oppure null se manca;
- grandezza: "piccolo", "medio" o "grande" (una partita, un concerto, un'udienza del Papa, un corteo sono grandi;
  se la frase non dà indizi, "medio");
- durata_ore: quante ore dura, se la frase lo dice, altrimenti null.
Non inventare: se un dato manca usa null o "sconosciuto"."""


class Interprete:
    def __init__(self, copilota, luoghi: dict, attesa_max_s: float = 4):
        self.copilota = copilota   # stesso client e modello del copilota della console
        self.luoghi = luoghi
        self.attesa_max_s = attesa_max_s

    def schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "luogo": {"type": "string", "enum": [*self.luoghi, "sconosciuto"]},
                "ora": {"type": ["string", "null"]},
                "grandezza": {"type": "string", "enum": ["piccolo", "medio", "grande"]},
                "durata_ore": {"type": ["number", "null"]},
            },
            "required": ["luogo", "ora", "grandezza", "durata_ore"],
            "additionalProperties": False,
        }

    async def capisci(self, frase: str) -> dict:
        if self.copilota.client:
            try:
                return await asyncio.wait_for(self._chiedi(frase), timeout=self.attesa_max_s)
            except (asyncio.TimeoutError, anthropic.APIError, ValueError, json.JSONDecodeError):
                pass   # rete assente, chiave non valida, risposta lenta o non leggibile
        return self.ripiego(frase)

    async def _chiedi(self, frase: str) -> dict:
        msg = await self.copilota.client.beta.messages.create(
            model=self.copilota.modello,
            max_tokens=1000,
            system=ISTRUZIONI + "\n\nLuoghi: " + ", ".join(self.luoghi),
            messages=[{"role": "user", "content": frase}],
            output_config={"effort": self.copilota.effort, "format": {"type": "json_schema", "schema": self.schema()}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if msg.stop_reason == "refusal":
            raise ValueError("richiesta rifiutata")
        testo = next((b.text for b in msg.content if b.type == "text"), None)
        if testo is None:
            raise ValueError("nessun testo nella risposta")
        dati = json.loads(testo)
        dati["ora"] = normalizza_ora(dati.get("ora"))
        return {**dati, "fonte": "copilota"}

    def ripiego(self, frase: str) -> dict:
        """Senza Claude: l'ora dopo "alle"/"ore", il primo luogo nominato, la grandezza dalle parole chiave."""
        t = frase.lower()
        luogo = next((nome for nome, v in self.luoghi.items() if any(x in t for x in v["nomi"])), "sconosciuto")
        m = re.search(r"(?:alle|ore|dalle|h)\s*(\d{1,2})(?:[:.,](\d{2}))?", t) or re.search(r"\b(\d{1,2})[:.](\d{2})\b", t)
        ora = normalizza_ora(f"{m.group(1)}:{m.group(2) or '00'}") if m else None
        if re.search(r"\bpiccol", t):
            grandezza = "piccolo"
        elif re.search(r"grand|enorm|partit|concert|udienz|angelus|corteo|manifestazion|maratona", t):
            grandezza = "grande"
        else:
            grandezza = "medio"
        d = re.search(r"(\d+(?:[.,]\d+)?)\s*or[ae]\b", t)
        durata = float(d.group(1).replace(",", ".")) if d else None
        return {"luogo": luogo, "ora": ora, "grandezza": grandezza, "durata_ore": durata, "fonte": "ripiego"}


def normalizza_ora(ora) -> str | None:
    """"17" o "17.30" → "17:00" / "17:30"; None se non è un'ora del giorno."""
    if not ora:
        return None
    m = re.match(r"^\s*(\d{1,2})(?:[:.,](\d{2}))?\s*$", str(ora))
    if not m or int(m.group(1)) > 23 or int(m.group(2) or 0) > 59:
        return None
    return f"{int(m.group(1)):02d}:{m.group(2) or '00'}"
