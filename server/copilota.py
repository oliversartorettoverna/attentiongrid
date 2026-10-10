"""Copilota AI nella scheda intervento: riassume la situazione, suggerisce un'azione, scrive la nota per il registro.

Claude legge quello che il motore sa del veicolo fermo (via, motivo previsto, score, pioggia) e lo storico della
via nella giornata (richieste già arrivate e cause confermate dall'operatore). La decisione resta all'operatore:
il copilota suggerisce, non agisce. Lo score resta quello deterministico del motore.

Senza chiave (ANTHROPIC_API_KEY nel file .env) o senza rete, o se Claude non risponde entro `attesa_max_s`,
si usa un ripiego costruito dai dati del motore: la scheda non resta mai vuota.
"""
import asyncio
import json
import os

import anthropic

AZIONI = ("riparte", "deviato", "assistenza", "arresto")
PREFISSI = {"boxi": "BX", "corriere_a": "CA", "corriere_b": "CB", "navette": "NV"}


def sigla(veicolo_id: str) -> str:
    """Il nome breve del veicolo, come in console: boxi_07 → BX-07, navette_104 → NV-104."""
    flotta, _, numero = veicolo_id.rpartition("_")
    return f"{PREFISSI.get(flotta, flotta[:2].upper())}-{numero}"

ISTRUZIONI = """Sei il copilota di un operatore che supervisiona da remoto veicoli autonomi di consegna e navette a Roma.
Un veicolo si è fermato e ha chiesto aiuto; l'operatore ha pochi secondi per decidere.
Con i dati che ricevi scrivi, in italiano semplice e senza gergo:
- situazione: al massimo due frasi brevi su dove è il veicolo e perché probabilmente si è fermato;
- azione: una tra "riparte" (si può ripartire), "deviato" (meglio un percorso alternativo),
  "assistenza" (serve qualcuno in strada), "arresto" (fermo per un controllo, solo se c'è un rischio serio);
- perche_azione: una frase sul motivo dell'azione suggerita;
- nota_registro: una frase neutra per il registro degli interventi, che resta all'autorità.
Usa solo i dati ricevuti: se un dato manca non inventarlo. Decide l'operatore: tu suggerisci."""

SCHEMA = {
    "type": "object",
    "properties": {
        "situazione": {"type": "string"},
        "azione": {"type": "string", "enum": list(AZIONI)},
        "perche_azione": {"type": "string"},
        "nota_registro": {"type": "string"},
    },
    "required": ["situazione", "azione", "perche_azione", "nota_registro"],
    "additionalProperties": False,
}


def ripiego(ctx: dict) -> dict:
    """Il suggerimento costruito dai dati del motore, quando Claude non è raggiungibile."""
    motivo = ctx.get("motivo_previsto") or "un motivo non prevalente"
    m = motivo.lower()
    azione = "deviato" if ("sottopasso" in m or "doppia fila" in m) else "riparte"
    pioggia = ctx.get("pioggia_mm")
    meteo = f" Pioggia {pioggia:.1f} mm/h." if isinstance(pioggia, (int, float)) and pioggia > 0 else ""
    storia = ctx.get("richieste_oggi_sulla_via", 0)
    return {
        "situazione": f"{ctx['veicolo']} fermo in {ctx.get('via') or 'una via senza nome'}: il motore prevedeva {motivo}.{meteo}"
                      + (f" Oggi su questa via ci sono già state {storia} richieste." if storia else ""),
        "azione": azione,
        "perche_azione": "Ostacolo sulla corsia: conviene un percorso alternativo." if azione == "deviato"
                         else "Causa tipica e passeggera: di solito basta far ripartire con cautela.",
        "nota_registro": f"Fermo in {ctx.get('via') or 'via senza nome'}, causa prevista: {motivo}.",
        "fonte": "ripiego",
    }


class Copilota:
    def __init__(self, cfg: dict, env: dict):
        self.modello = cfg.get("modello", "claude-opus-5-5")
        self.effort = cfg.get("effort", "low")
        self.attesa_max_s = cfg.get("attesa_max_s", 8)
        chiave = os.environ.get("ANTHROPIC_API_KEY") or env.get("ANTHROPIC_API_KEY")
        self.client = anthropic.AsyncAnthropic(api_key=chiave, max_retries=1) if chiave else None
        self.memoria: dict[tuple, dict] = {}   # un suggerimento per richiesta: non si richiama Claude a ogni clic

    @property
    def attivo(self) -> bool:
        return self.client is not None

    async def suggerisci(self, chiave: tuple, ctx: dict) -> dict:
        if chiave in self.memoria:
            return self.memoria[chiave]
        if not self.client:
            return ripiego(ctx)
        try:
            risposta = await asyncio.wait_for(self._chiedi(ctx), timeout=self.attesa_max_s)
        except (asyncio.TimeoutError, anthropic.APIError, ValueError):
            return ripiego(ctx)   # rete assente, chiave non valida, risposta lenta o non leggibile
        self.memoria[chiave] = risposta
        return risposta

    async def _chiedi(self, ctx: dict) -> dict:
        msg = await self.client.beta.messages.create(
            model=self.modello,
            max_tokens=2000,
            system=ISTRUZIONI,
            messages=[{"role": "user", "content": "Dati del veicolo fermo:\n" + json.dumps(ctx, ensure_ascii=False, indent=1)}],
            output_config={"effort": self.effort, "format": {"type": "json_schema", "schema": SCHEMA}},
            # se un filtro di sicurezza rifiuta la richiesta, l'API riprova da sola con un altro modello
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if msg.stop_reason == "refusal":
            raise ValueError("richiesta rifiutata")
        testo = next((b.text for b in msg.content if b.type == "text"), None)
        if testo is None:
            raise ValueError("nessun testo nella risposta")
        dati = json.loads(testo)
        if dati.get("azione") not in AZIONI:
            raise ValueError("azione non valida")
        return {**dati, "fonte": "claude", "modello": msg.model}
