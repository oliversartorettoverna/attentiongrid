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

      <Riquadro titolo="Ora per ora">
        <Barre etichetta="Veicoli in servizio" valori={f.orario.map((o: any) => o.veicoli)} ore={f.orario.map((o: any) => o.ora)} colore="var(--color-secondary)" decimali={0} />
        <Barre etichetta="Operatori dedicati alla flotta" valori={f.orario.map((o: any) => o.operatori)} ore={f.orario.map((o: any) => o.ora)} colore="var(--color-info)" decimali={1} conOre />
      </Riquadro>
    </Pagina>
  )
}

/** Una riga di barre con la sua scala: veicoli e operatori hanno grandezze diverse, quindi non si sovrappongono. */
function Barre({ etichetta, valori, ore, colore, decimali, conOre = false }: { etichetta: string; valori: number[]; ore: string[]; colore: string; decimali: number; conOre?: boolean }) {
  const max = Math.max(...valori, 1e-9)
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-baseline justify-between text-xs">
        <span className="text-secondary">{etichetta}</span>
        <span className="num text-muted">massimo {max.toFixed(decimali).replace('.', ',')}</span>
      </div>
      <div className="flex h-24 items-end gap-1.5">
        {valori.map((v, i) => (
          <div key={ore[i]} className="group relative flex h-full flex-1 items-end">
            <div className="w-full rounded-t-[4px] bg-elevated" style={{ height: '100%', position: 'absolute', opacity: 0.35 }} />
            <div className="relative w-full rounded-t-[4px] transition-all duration-500" style={{ height: `${(v / max) * 100}%`, background: colore, minHeight: v > 0 ? 2 : 0 }} />
            <span className="num pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-primary opacity-0 transition-opacity group-hover:opacity-100">
              {v.toFixed(decimali).replace('.', ',')}
            </span>
          </div>
        ))}
      </div>
      {conOre && (
        <div className="mt-2 flex gap-1.5">
          {ore.map((o) => (
            <span key={o} className="num flex-1 text-center text-[10px] text-muted">{o.slice(0, 2)}</span>
          ))}
        </div>
      )}
    </div>
  )
}
