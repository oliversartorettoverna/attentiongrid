import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, CloudLightning, ShieldCheck } from 'lucide-react'
import { useScenario } from '../lib/ScenarioContext'
import type { Piani, PianoVerificato } from '../lib/scenario'
import { Pagina, Riquadro, Titolo } from '../components/Pagina'
import { WhatIf } from '../components/WhatIf'

// I tre piani da tools/prova_pianificazione.py (piani.json): fatti sulla previsione del giorno prima e
// verificati sulla giornata vera, anche quando il temporale non arriva all'ora prevista.
const PIANI = [
  { chiave: 'fissi', nome: 'Turni fissi', nota: 'Ogni turno coperto per il suo picco' },
  { chiave: 'normale', nome: 'Piano normale', nota: 'Personale ora per ora dalla previsione' },
  { chiave: 'prudente', nome: 'Piano prudente', nota: 'Regge il temporale un’ora prima o dopo' },
] as const
type ChiavePiano = (typeof PIANI)[number]['chiave']

const CASI = [
  { chiave: 'previsto', breve: 'Come previsto' },
  { chiave: 'prima', breve: 'Un’ora prima' },
  { chiave: 'dopo', breve: 'Un’ora dopo' },
] as const
type ChiaveCaso = (typeof CASI)[number]['chiave']

export function Planner() {
  const sc = useScenario()
  const [caso, setCaso] = useState<ChiaveCaso>('previsto')
  const [scelto, setScelto] = useState<ChiavePiano>('prudente')
  if (!sc) return null
  if (!sc.piani)
    return (
      <Pagina>
        <Titolo eyebrow="Planner" titolo="Manca piani.json">
          Lancia <code className="num">python tools/prova_pianificazione.py</code> per verificare i piani sulla giornata.
        </Titolo>
      </Pagina>
    )
  const pn: Piani = sc.piani
  const c = pn.casi.find((x) => x.chiave === caso)!
  const obiettivo = pn.livello_servizio_pct

  return (
    <Pagina>
      <div className="flex items-end justify-between gap-6">
        <Titolo eyebrow="Domani · giovedì" titolo="Quante persone servono, ora per ora">
          Il motore prevede le richieste dalla mappa del rischio e dal meteo, poi calcola gli operatori per prendere il {obiettivo}%
          delle richieste entro {pn.attesa_max_s} secondi. Ogni piano è verificato sulla giornata vera.
        </Titolo>
        <div className="mb-2 shrink-0">
          <div className="eyebrow mb-2 flex items-center gap-1.5">
            <CloudLightning className="size-3.5" /> Il temporale arriva
          </div>
          <div className="flex rounded-lg bg-surface p-0.5 ring-1 ring-line">
            {CASI.map((x) => (
              <button
                key={x.chiave}
                onClick={() => setCaso(x.chiave)}
                className={`relative h-8 rounded-md px-3 text-xs transition-colors ${x.chiave === caso ? 'text-primary' : 'text-muted hover:text-secondary'}`}
              >
                {x.chiave === caso && <motion.span layoutId="caso" className="absolute inset-0 rounded-md bg-elevated ring-1 ring-line-strong" />}
                <span className="relative">{x.breve}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {PIANI.map((x, i) => (
          <Scheda key={x.chiave} piano={x} b={c.piani[x.chiave]} attivo={x.chiave === scelto} obiettivo={obiettivo} indice={i} onClick={() => setScelto(x.chiave)} />
        ))}
      </div>

      <WhatIf />

      <Riquadro titolo={`Richieste prese entro ${pn.attesa_max_s} s, ora per ora`} destra={<Legenda obiettivo={obiettivo} />}>
        <div className="mt-4 grid gap-1.5" style={{ gridTemplateColumns: `128px repeat(${pn.ore.length}, minmax(0, 1fr))` }}>
          <span />
          {pn.ore.map((o) => (
            <span key={o} className="num text-center text-[10px] text-muted">
              {o.slice(0, 2)}
            </span>
          ))}
          {PIANI.map((x) => (
            <Riga key={x.chiave} nome={x.nome} valori={c.piani[x.chiave].entro_pct_ora} obiettivo={obiettivo} evidenzia={x.chiave === scelto} caso={caso} />
          ))}
        </div>
      </Riquadro>

      <Riquadro titolo={`Operatori in turno · ${PIANI.find((x) => x.chiave === scelto)!.nome.toLowerCase()}`}>
        <div className="mt-4 flex h-40 items-end gap-1.5">
          {c.piani[scelto].operatori.map((n, i) => {
            const max = Math.max(...pn.casi.flatMap((k) => Object.values(k.piani).flatMap((p) => p.operatori)))
            const sotto = (c.piani[scelto].entro_pct_ora[i] ?? 100) < obiettivo
            return (
              <div key={pn.ore[i]} className="group relative flex h-full flex-1 flex-col justify-end">
                <motion.div
                  className="w-full rounded-t-md"
                  style={{ background: sotto ? 'var(--color-critical)' : scelto === 'prudente' ? 'var(--color-info)' : 'var(--color-secondary)' }}
                  initial={false}
                  animate={{ height: `${(n / max) * 100}%` }}
                  transition={{ duration: 0.5, delay: i * 0.012, ease: [0.22, 1, 0.36, 1] }}
                />
                <span className="num pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  {n}
                </span>
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex gap-1.5">
          {pn.ore.map((o) => (
            <span key={o} className="num flex-1 text-center text-[10px] text-muted">
              {o.slice(0, 2)}
            </span>
          ))}
        </div>
      </Riquadro>

      <div className="flex items-center justify-between rounded-2xl bg-surface p-4 ring-1 ring-line">
        <div className="text-sm text-secondary">
          Piano selezionato: <span className="text-primary">{PIANI.find((x) => x.chiave === scelto)!.nome}</span> ·{' '}
          <span className="num">{c.piani[scelto].ore_pagate}</span> ore pagate,{' '}
          <span className="num">{c.piani[scelto].costo_veicolo_mese} €</span> per veicolo al mese
        </div>
        <button className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-base">
          <Check className="size-4" /> Approva e manda i turni
        </button>
      </div>
    </Pagina>
  )
}

function Scheda({ piano, b, attivo, obiettivo, indice, onClick }: { piano: (typeof PIANI)[number]; b: PianoVerificato; attivo: boolean; obiettivo: number; indice: number; onClick: () => void }) {
  const crolla = b.ora_peggiore_pct < obiettivo
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: indice * 0.06 }}
      onClick={onClick}
      className={`relative rounded-2xl p-5 text-left ring-1 transition-colors ${attivo ? 'bg-elevated ring-info/70' : 'bg-surface ring-line hover:ring-line-strong'}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium">{piano.nome}</span>
        {piano.chiave === 'prudente' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-info/15 px-2 py-0.5 text-[11px] font-medium text-info">
            <ShieldCheck className="size-3" /> Standard
          </span>
        )}
      </div>
      <div className="mt-0.5 text-xs text-muted">{piano.nota}</div>
      <div className="mt-5 flex items-end gap-6">
        <div>
          <div className="num text-[34px] leading-none font-medium tracking-tight">{b.ore_pagate}</div>
          <div className="mt-1 text-[11px] text-muted">ore pagate</div>
        </div>
        <div>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={b.ora_peggiore_pct}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="num text-xl leading-none font-medium"
              style={{ color: crolla ? 'var(--color-critical)' : undefined }}
            >
              {b.ora_peggiore_pct}%
            </motion.div>
          </AnimatePresence>
          <div className="mt-1 text-[11px] text-muted">entro 20 s, ora peggiore</div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-secondary">
        <span>
          <span className="num text-primary">{b.costo_veicolo_mese} €</span> per veicolo al mese
        </span>
        {crolla ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-critical/15 px-2 py-0.5 font-medium text-critical">
            <span className="size-1.5 rounded-full bg-critical" /> Non regge
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-secondary">
            <span className="size-1.5 rounded-full bg-ok" /> Regge
          </span>
        )}
      </div>
    </motion.button>
  )
}

/** Una riga per piano: ogni cella è un'ora. Neutra se rispetta l'obiettivo, colorata solo se no. */
function Riga({ nome, valori, obiettivo, evidenzia, caso }: { nome: string; valori: (number | null)[]; obiettivo: number; evidenzia: boolean; caso: string }) {
  return (
    <>
      <span className={`flex items-center text-xs ${evidenzia ? 'text-primary' : 'text-secondary'}`}>{nome}</span>
      {valori.map((v, i) => {
        const colore = v == null ? null : v < 75 ? 'var(--color-critical)' : v < obiettivo ? 'var(--color-warn)' : null
        return (
          <motion.span
            key={`${caso}-${i}`}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: i * 0.01 }}
            className="num grid h-9 place-items-center rounded-md text-[10px]"
            style={
              colore
                ? { color: colore, background: `color-mix(in srgb, ${colore} 16%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${colore} 40%, transparent)` }
                : { color: v == null ? 'var(--color-line-strong)' : 'var(--color-muted)', background: 'var(--color-elevated)' }
            }
            title={v == null ? 'Meno di 20 richieste in quest’ora' : `${v}% entro 20 s`}
          >
            {v == null ? '·' : v}
          </motion.span>
        )
      })}
    </>
  )
}

function Legenda({ obiettivo }: { obiettivo: number }) {
  return (
    <div className="flex items-center gap-4 text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-sm bg-elevated ring-1 ring-line-strong" /> ≥ {obiettivo}%
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-sm bg-warn" /> sotto obiettivo
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-sm bg-critical" /> sotto 75%
      </span>
    </div>
  )
}
