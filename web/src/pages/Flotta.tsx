import { useEffect, useState } from 'react'
import { useOra } from '../lib/orologio'
import { useScenario } from '../lib/ScenarioContext'
import { hhmm, sec } from '../lib/scenario'
import { Numero, Pagina, Riquadro, Titolo } from '../components/Pagina'

// Vista cliente: la giornata dei BOXi di Poste, che usa già AttentionGrid con la licenza. Quante richieste di aiuto,
// quanto in fretta sono state prese, perché, dove e quando (dal registro degli interventi), e quanto risparmia
// la sua centrale rispetto ai turni fissi (ore operatore da tools/flotta_da_sola.py, costo del lavoro italiano).
const FLOTTA = 'boxi'
const PAESE = 'italia'
const GIORNI_MESE = 365 / 12

// In italiano il browser non mette il punto nei numeri di quattro cifre (1997): lo forziamo
const intero = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions)
const euro = (x: number) => `${intero.format(x)} €`
const virgola = (x: number, d = 1) => x.toFixed(d).replace('.', ',')

interface Richiesta {
  ora_s: number // secondi dall'inizio del giorno
  via: string
  motivo: string // senza "+ pioggia"
  pioggia: boolean
  attesa_s: number
}

export function Flotta() {
  const sc = useScenario()
  const { scenario, t } = useOra()
  const [tutte, setTutte] = useState<Richiesta[]>([])

  useEffect(() => {
    fetch(`/data/${scenario}/registro_interventi.csv`)
      .then((r) => r.text())
      .then((testo) => {
        const [testa, ...corpo] = testo.trim().split('\n')
        const c = Object.fromEntries(testa.split(',').map((k, i) => [k, i]))
        const nome = sc?.kpi.per_flotta[FLOTTA]?.nome
        setTutte(
          corpo
            .map((l) => l.split(','))
            .filter((v) => v[c.gestore] === nome)
            .map((v) => {
              const m = v[c.motivo_previsto]
              return {
                ora_s: sec(v[c.ora]),
                via: v[c.via] || 'via senza nome',
                motivo: m.replace(' + pioggia', '') || 'altro',
                pioggia: m.endsWith('+ pioggia'),
                attesa_s: Number(v[c.attesa_s]),
              }
            }),
        )
      })
  }, [scenario, sc])

  if (!sc) return null
  const f = sc.kpi.per_flotta[FLOTTA]
  const eco = sc.kpi.economia
  const sola = sc.daSola?.[FLOTTA]
  if (!f || !eco?.paesi) return null // kpi.json di un formato vecchio: si rifà con engine/pipeline.py

  const euroOra = eco.paesi[PAESE].costo_ora_postazione
  const alMese = (oreGiorno: number) => (oreGiorno * euroOra * GIORNI_MESE) / f.veicoli
  const oggi = sola ? alMese(sola.ore_operatore.turni_fissi) : null
  const conNoi = sola ? alMese(sola.ore_operatore.piano) + eco.licenza_veicolo_mese : null

  // solo le richieste arrivate fino all'ora dell'orologio: la pagina segue la simulazione
  const richieste = tutte.filter((r) => r.ora_s <= t)
  const n = richieste.length || 1
  const nulla = richieste.length === 0
  const entro = richieste.filter((r) => r.attesa_s <= (sc.piani?.attesa_max_s ?? 20)).length
  const attesaMedia = richieste.reduce((a, r) => a + r.attesa_s, 0) / n
  const conPioggia = richieste.filter((r) => r.pioggia).length
  const motivi = conta(richieste, (r) => r.motivo)
  const vie = conta(richieste, (r) => r.via).slice(0, 5)
  const ore = f.orario.map((o: any) => o.ora as string)
  const perOra = ore.map((o: string) => richieste.filter((r) => Math.floor(r.ora_s / 3600) === sec(o) / 3600).length)

  return (
    <Pagina>
      <Titolo eyebrow="Vista cliente · Poste Italiane" titolo={`I tuoi ${f.veicoli} BOXi, oggi fino alle ${hhmm(t)}`}>
        Le richieste di aiuto da inizio giornata: quante, quanto in fretta sono state prese, perché, dove e quando.
      </Titolo>

      <div className="grid grid-cols-4 gap-3">
        <Numero etichetta="Richieste di aiuto" valore={intero.format(richieste.length)} sotto={`${virgola(richieste.length / f.veicoli)} per BOXi, ${Math.round((100 * conPioggia) / n)}% con la pioggia`} />
        <Numero etichetta={`Prese entro ${sc.piani?.attesa_max_s ?? 20} secondi`} valore={nulla ? '—' : Math.round((100 * entro) / n)} unita={nulla ? undefined : '%'} sotto={`obiettivo ${sc.piani?.livello_servizio_pct ?? 90}% in ogni ora`} />
        <Numero etichetta="Attesa media" valore={nulla ? '—' : virgola(attesaMedia)} unita={nulla ? undefined : 's'} sotto={`la più lunga ${Math.max(0, ...richieste.map((r) => r.attesa_s))} s`} />
        {oggi !== null && conNoi !== null ? (
          <Numero
            etichetta="Risparmio sulla supervisione"
            valore={euro((oggi - conNoi) * f.veicoli)}
            unita="al mese"
            sotto={`−${Math.round(100 * (1 - conNoi / oggi))}% rispetto ai turni fissi sul picco`}
          />
        ) : (
          <Numero etichetta="Risparmio sulla supervisione" valore="—" sotto="si calcola con tools/flotta_da_sola.py" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Riquadro titolo="Perché chiedono aiuto">
          <div className="mt-4 flex flex-col gap-3">
            {nulla && <p className="text-sm text-muted">Ancora nessuna richiesta di aiuto.</p>}
            {motivi.map(([m, k]) => (
              <Riga key={m} nome={m} valore={k} totale={n} max={motivi[0][1]} />
            ))}
          </div>
        </Riquadro>
        <Riquadro titolo="Dove · le cinque vie con più richieste">
          <div className="mt-4 flex flex-col gap-3">
            {nulla && <p className="text-sm text-muted">Ancora nessuna richiesta di aiuto.</p>}
            {vie.map(([v, k]) => (
              <Riga key={v} nome={v} valore={k} totale={n} max={vie[0][1]} />
            ))}
          </div>
        </Riquadro>
      </div>

      <Riquadro titolo="Quando">
        <Barre etichetta="Richieste di aiuto, ora per ora" valori={perOra} ore={ore} colore="var(--color-secondary)" decimali={0} conOre />
      </Riquadro>
    </Pagina>
  )
}

/** Conteggio per chiave, dal più frequente. */
function conta<T>(xs: T[], chiave: (x: T) => string): [string, number][] {
  const m = new Map<string, number>()
  for (const x of xs) m.set(chiave(x), (m.get(chiave(x)) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

function Riga({ nome, valore, totale, max }: { nome: string; valore: number; totale: number; max: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-secondary first-letter:uppercase">{nome}</span>
        <span className="num text-primary">
          {intero.format(valore)}
          <span className="ml-1.5 text-xs text-muted">{Math.round((100 * valore) / totale)}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
        <div className="h-full rounded-full bg-secondary transition-all duration-500" style={{ width: `${(100 * valore) / max}%` }} />
      </div>
    </div>
  )
}

/** Una riga di barre con la sua scala: veicoli e operatori hanno grandezze diverse, quindi non si sovrappongono. */
function Barre({ etichetta, valori, ore, colore, decimali, conOre = false }: { etichetta: string; valori: number[]; ore: string[]; colore: string; decimali: number; conOre?: boolean }) {
  const max = Math.max(...valori, 1e-9)
  return (
    <div className="mt-4">
      <div className="mb-2 text-xs text-secondary">{etichetta}</div>
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
