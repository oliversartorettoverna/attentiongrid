import { useState } from 'react'
import { useScenario } from '../lib/ScenarioContext'
import { useRuolo } from '../lib/ruolo'
import { Numero, Pagina, Riquadro, Titolo } from '../components/Pagina'

export function Flotta() {
  const sc = useScenario()
  const [ruolo] = useRuolo()
  const [scelta, setScelta] = useState('boxi')
  if (!sc) return null
  const chiave = ruolo === 'cliente' ? 'boxi' : scelta
  const f = sc.kpi.per_flotta[chiave]
  const eco = sc.kpi.economia
  // Costo 1:1: un operatore dedicato per ogni ora di servizio del veicolo, allo stesso costo orario di postazione
  const costoUnoAUno = eco ? Math.round(f.ore_servizio_per_veicolo * eco.costo_ora_postazione * 365 / 12) : null
  const risparmio = costoUnoAUno ? Math.round(100 * (1 - f.costo_veicolo_mese / costoUnoAUno)) : null
  const maxV = Math.max(...f.orario.map((o: any) => o.veicoli))

  return (
    <Pagina>
      <div className="flex items-end justify-between">
        <Titolo eyebrow="Vista cliente" titolo={f.nome}>
          Il servizio di supervisione della tua flotta: quanto aiuto chiedono i veicoli e quanto costa rispetto a un operatore per
          veicolo.
        </Titolo>
        {ruolo !== 'cliente' && (
          <div className="mb-2 flex rounded-lg bg-surface p-0.5 ring-1 ring-line">
            {Object.entries(sc.kpi.per_flotta).map(([k, v]: [string, any]) => (
              <button
                key={k}
                onClick={() => setScelta(k)}
                className={`h-8 rounded-md px-3 text-xs transition-colors ${k === chiave ? 'bg-elevated text-primary ring-1 ring-line-strong' : 'text-muted hover:text-secondary'}`}
              >
                {v.nome.split(' · ')[0] === 'Poste' ? 'BOXi' : v.nome.split(' · ')[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Numero etichetta="Veicoli" valore={f.veicoli} sotto={`${f.ore_servizio_per_veicolo} ore di servizio ciascuno`} />
        <Numero etichetta="Richieste per veicolo" valore={f.richieste_per_veicolo} sotto={`assistito il ${f.assistenza_pct_tempo}% del tempo`} />
        <Numero etichetta="Veicoli per operatore" valore={f.veicoli_per_operatore} sotto={`${f.ore_operatore} ore operatore nella giornata`} />
        <Numero
          etichetta="Costo per veicolo"
          valore={f.costo_veicolo_mese}
          unita="€/mese"
          sotto={
            costoUnoAUno && (
              <>
                contro <span className="num text-primary">{costoUnoAUno.toLocaleString('it-IT')} €</span> con l'1:1 ·{' '}
                <span className="text-ok">−{risparmio}%</span>
              </>
            )
          }
        />
      </div>

      <Riquadro titolo="Veicoli in strada e operatori dedicati, ora per ora">
        <div className="mt-4 flex h-56 items-end gap-1.5">
          {f.orario.map((o: any) => (
            <div key={o.ora} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div className="relative flex w-full flex-1 items-end">
                <div className="w-full rounded-t-md bg-elevated" style={{ height: `${(o.veicoli / (maxV || 1)) * 100}%` }} />
                <div
                  className="absolute bottom-0 left-1/2 w-1.5 -translate-x-1/2 rounded-t-full bg-info"
                  style={{ height: `${(o.operatori / (maxV || 1)) * 100 * 4}%` }}
                />
              </div>
              <span className="num text-[10px] text-muted">{o.ora.slice(0, 2)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-elevated ring-1 ring-line-strong" /> veicoli in servizio
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-info" /> operatori dedicati (×4 per leggibilità)
          </span>
        </div>
      </Riquadro>
    </Pagina>
  )
}
