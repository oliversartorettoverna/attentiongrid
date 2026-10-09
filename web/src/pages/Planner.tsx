import { useState } from 'react'
import { motion } from 'motion/react'
import { Check, ShieldCheck } from 'lucide-react'
import { useScenario } from '../lib/ScenarioContext'
import { Pagina, Riquadro, Titolo } from '../components/Pagina'

// I tre piani del motore (kpi.json, parita_servizio): stessa giornata, stesso livello di servizio.
const PIANI = [
  { chiave: 'senza', nome: 'Turni fissi', nota: 'Personale del picco tutto il giorno', campo: 'operatori_senza' },
  { chiave: 'solo_turni', nome: 'Piano normale', nota: 'Turni dalla previsione', campo: 'operatori_turni' },
  { chiave: 'con', nome: 'Piano prudente', nota: 'Regge il temporale ±1 ora, partenze sfasate', campo: 'operatori_con' },
] as const

export function Planner() {
  const sc = useScenario()
  const [scelto, setScelto] = useState<(typeof PIANI)[number]['chiave']>('con')
  if (!sc) return null
  const p = sc.kpi.parita_servizio
  const orario = sc.kpi.orario as Record<string, number | string>[]
  const max = Math.max(...orario.map((o) => o.operatori_senza as number))
  const piano = PIANI.find((x) => x.chiave === scelto)!
  return (
    <Pagina>
      <Titolo eyebrow="Domani · giovedì" titolo="Quante persone servono, ora per ora">
        Il motore prevede le richieste dalla mappa del rischio e dal meteo, poi calcola gli operatori per prendere il 90% delle
        richieste entro 20 secondi.
      </Titolo>

      <div className="grid grid-cols-3 gap-3">
        {PIANI.map((x, i) => {
          const b = p[x.chiave]
          const attivo = x.chiave === scelto
          return (
            <motion.button
              key={x.chiave}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => setScelto(x.chiave)}
              className={`relative rounded-2xl p-5 text-left ring-1 transition-colors ${attivo ? 'bg-elevated ring-info/70' : 'bg-surface ring-line hover:ring-line-strong'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium">{x.nome}</span>
                {x.chiave === 'con' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-info/15 px-2 py-0.5 text-[11px] font-medium text-info">
                    <ShieldCheck className="size-3" /> Standard
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-muted">{x.nota}</div>
              <div className="mt-5 flex items-end gap-6">
                <div>
                  <div className="num text-[34px] leading-none font-medium tracking-tight">{b.ore_operatore}</div>
                  <div className="mt-1 text-[11px] text-muted">ore operatore</div>
                </div>
                <div>
                  <div className="num text-xl leading-none font-medium">{b.veicoli_per_operatore}</div>
                  <div className="mt-1 text-[11px] text-muted">veicoli / operatore</div>
                </div>
                <div>
                  <div className="num text-xl leading-none font-medium">{b.ora_peggiore_entro_attesa_max_pct}%</div>
                  <div className="mt-1 text-[11px] text-muted">entro 20 s, ora peggiore</div>
                </div>
              </div>
              {b.costo_veicolo_mese != null && (
                <div className="mt-4 border-t border-line pt-3 text-xs text-secondary">
                  <span className="num text-primary">{b.costo_veicolo_mese} €</span> per veicolo al mese
                </div>
              )}
            </motion.button>
          )
        })}
      </div>

      <Riquadro titolo="Operatori in turno e veicoli attivi" destra={<Legenda />}>
        <div className="flex h-64 items-end gap-1.5 pt-4">
          {orario.map((o, i) => {
            const n = o[piano.campo] as number
            return (
              <div key={o.ora as string} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                <div className="relative flex w-full flex-1 items-end justify-center">
                  <div
                    className="absolute bottom-0 w-full rounded-t-md bg-elevated"
                    style={{ height: `${((o.operatori_senza as number) / max) * 100}%` }}
                  />
                  <motion.div
                    className="relative w-full rounded-t-md"
                    style={{ background: piano.chiave === 'con' ? 'var(--color-info)' : 'var(--color-secondary)' }}
                    initial={false}
                    animate={{ height: `${(n / max) * 100}%` }}
                    transition={{ duration: 0.5, delay: i * 0.015, ease: [0.22, 1, 0.36, 1] }}
                  />
                  <span className="num absolute -top-5 text-[10px] text-muted opacity-0 transition-opacity group-hover:opacity-100">
                    {n}
                  </span>
                </div>
                <span className="num text-[10px] text-muted">{(o.ora as string).slice(0, 2)}</span>
              </div>
            )
          })}
        </div>
      </Riquadro>

      <div className="flex items-center justify-between rounded-2xl bg-surface p-4 ring-1 ring-line">
        <div className="text-sm text-secondary">
          Piano selezionato: <span className="text-primary">{piano.nome}</span> ·{' '}
          <span className="num">{p[piano.chiave].ore_operatore}</span> ore,{' '}
          <span className="num">{p[piano.chiave].entro_attesa_max_pct}%</span> delle richieste entro 20 s sulla giornata
        </div>
        <button className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-base">
          <Check className="size-4" /> Approva e manda i turni
        </button>
      </div>
    </Pagina>
  )
}

function Legenda() {
  return (
    <div className="flex items-center gap-4 text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-sm bg-elevated ring-1 ring-line-strong" /> turni fissi
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-sm bg-info" /> piano scelto
      </span>
    </div>
  )
}
