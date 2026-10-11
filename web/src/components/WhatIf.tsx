import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Riquadro } from "./Pagina";

// E se domani c'è un evento? La frase la capisce il copilota (o un ripiego senza rete), i numeri e la risposta
// li fa il motore (engine/what_if.py) confrontando gli operatori necessari con il piano prudente.

interface Capito {
  luogo: string;
  ora: string | null;
  grandezza: "piccolo" | "medio" | "grande";
  durata_ore: number | null;
  fonte: "copilota" | "ripiego" | "scelta";
}

interface Risultato {
  luogo: string;
  ora: string;
  fine: string;
  grandezza: string;
  raggio_m: number;
  tratti_vicini: number;
  finestre: [string, string][];
  ore: string[];
  piano: number[];
  mancano: number[];
  richieste_in_piu_ora: number[];
  frasi: string[];
}

const ESEMPI = [
  "E se domani c'è un'udienza del Papa a San Pietro alle 10?",
  "E se domani c'è un evento grande a San Pietro alle 17?",
  "E se domani sera c’è un concerto a Piazza Navona alle 21?",
];

export function WhatIf() {
  const [frase, setFrase] = useState("");
  const [attesa, setAttesa] = useState(false);
  const [risposta, setRisposta] = useState<{
    capito: Capito;
    risultato?: Risultato;
    errore?: string;
  } | null>(null);

  const chiedi = async (testo: string) => {
    if (!testo.trim() || attesa) return;
    setFrase(testo);
    setAttesa(true);
    try {
      const r = await fetch("/api/what-if", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ frase: testo }),
      });
      setRisposta(r.ok ? await r.json() : null);
    } catch {
      setRisposta(null);
    } finally {
      setAttesa(false);
    }
  };
  const invia = (e: FormEvent) => {
    e.preventDefault();
    chiedi(frase);
  };

  return (
    <Riquadro
      titolo="E se… un evento domani"
      destra={
        <span className="text-[11px] text-muted">
          la frase la capisce il copilota, i numeri li fa il motore
        </span>
      }
    >
      <form onSubmit={invia} className="mt-4 flex gap-2">
        <div className="flex h-10 flex-1 items-center gap-2 rounded-lg bg-elevated px-3 ring-1 ring-line focus-within:ring-line-strong">
          <Sparkles className="size-4 text-muted" />
          <input
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
            placeholder="E se domani c'è un evento grande a San Pietro alle 17?"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </div>
        <button
          disabled={attesa}
          className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-base disabled:opacity-60"
        >
          {attesa ? "Ricalcolo…" : "Calcola"} <ArrowRight className="size-4" />
        </button>
      </form>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {ESEMPI.map((x) => (
          <button
            key={x}
            onClick={() => chiedi(x)}
            className="rounded-full px-3 py-1 text-xs text-secondary ring-1 ring-line transition-colors hover:bg-elevated hover:text-primary"
          >
            {x}
          </button>
        ))}
      </div>

      {risposta && <Risposta {...risposta} />}
      {!risposta && !attesa && frase && (
        <p className="mt-4 text-sm text-muted">
          Il server non risponde: controlla che sia acceso.
        </p>
      )}
    </Riquadro>
  );
}

function Risposta({
  capito,
  risultato,
  errore,
}: {
  capito: Capito;
  risultato?: Risultato;
  errore?: string;
}) {
  const fonte =
    capito.fonte === "copilota"
      ? "capito dal copilota"
      : capito.fonte === "ripiego"
        ? "capito senza rete"
        : "scelto";
  if (errore || !risultato)
    return (
      <p className="mt-4 text-sm text-secondary">
        {errore} <span className="text-muted">({fonte})</span>
      </p>
    );
  const r = risultato;
  const scoperto = r.mancano.some((m) => m > 0);
  const fuori = r.tratti_vicini === 0; // luogo fuori dalla mappa della demo: il motore non può stimare
  const max = Math.max(...r.piano.map((p, i) => p + r.mancano[i]));

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-5 border-t border-line pt-4"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
        <span className="rounded-full bg-elevated px-2.5 py-1 ring-1 ring-line">
          {r.luogo}
        </span>
        <span className="num rounded-full bg-elevated px-2.5 py-1 ring-1 ring-line">
          {r.ora}–{r.fine}
        </span>
        <span className="rounded-full bg-elevated px-2.5 py-1 ring-1 ring-line">
          evento {r.grandezza}, strade entro {r.raggio_m} m
        </span>
        <span className="text-muted">· {fonte}</span>
      </div>

      <div className="mt-4 flex flex-col gap-1.5 text-sm">
        <p className="text-primary">{r.frasi[0]}</p>
        {r.frasi[1] && (
          <p className="flex items-start gap-2 text-secondary">
            <span
              className="mt-[7px] size-1.5 shrink-0 rounded-full"
              style={{
                background: fuori
                  ? "var(--color-offline)"
                  : scoperto
                    ? "var(--color-critical)"
                    : "var(--color-ok)",
              }}
            />
            <span>
              <span
                className="font-medium"
                style={{
                  color: scoperto ? "var(--color-critical)" : undefined,
                }}
              >
                {fuori ? "Fuori mappa. " : scoperto ? "Scoperto. " : "Regge. "}
              </span>
              {r.frasi[1]}
            </span>
          </p>
        )}
      </div>

      {!fuori && (
        <>
          <div className="mt-5 flex h-32 items-end gap-1.5">
            {r.ore.map((o, i) => (
              <div
                key={o}
                className="group relative flex h-full flex-1 flex-col justify-end"
              >
                {r.mancano[i] > 0 && (
                  <span
                    className="num absolute left-1/2 -translate-x-1/2 text-[10px] text-critical"
                    style={{
                      bottom: `calc(${((r.piano[i] + r.mancano[i]) / max) * 100}% + 4px)`,
                    }}
                  >
                    +{r.mancano[i]}
                  </span>
                )}
                <div
                  className="w-full rounded-t-[4px] bg-critical"
                  style={{ height: `${(r.mancano[i] / max) * 100}%` }}
                />
                <div
                  className={`w-full ${r.mancano[i] ? "" : "rounded-t-[4px]"}`}
                  style={{
                    height: `${(r.piano[i] / max) * 100}%`,
                    background: "var(--color-line-strong)",
                  }}
                />
                <span className="num pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  {r.piano[i]}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            {r.ore.map((o, i) => (
              <span
                key={o}
                className={`num flex-1 rounded-sm text-center text-[10px] ${r.richieste_in_piu_ora[i] >= 0.5 ? "bg-elevated text-primary" : "text-muted"}`}
              >
                {o.slice(0, 2)}
              </span>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-sm"
                style={{ background: "var(--color-line-strong)" }}
              />{" "}
              operatori del piano prudente
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-critical" /> persone che
              mancano con l'evento
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-elevated ring-1 ring-line-strong" />{" "}
              ore toccate dall'evento
            </span>
          </div>
        </>
      )}
    </motion.div>
  );
}
