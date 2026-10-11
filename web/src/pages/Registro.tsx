import { useEffect, useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { Pagina, Numero, Titolo } from '../components/Pagina'
import { hhmm, sigla } from '../lib/scenario'
import { useRuolo } from '../lib/ruolo'
import { useOra } from '../lib/orologio'

interface Riga {
  ora: string
  gestore: string
  veicolo: string
  via: string
  motivo_previsto: string
  probabilita_prevista: string
  attesa_s: string
  durata_s: string
  operatore: string
  causa_confermata?: string // confermata dall'operatore in console (server/registro.py, Supabase)
  azione?: string
}

interface Confermato {
  richiesta_id: number
  causa: string
  azione: string
  attesa_s: number
  durata_s: number
  operatore: string
  chiamata_s: number
}

const PAGINA = 80

export function Registro() {
  const [righe, setRighe] = useState<Riga[]>([])
  const [ruolo] = useRuolo()
  const { scenario, temporale, chiusi } = useOra()
  const [confermati, setConfermati] = useState<Confermato[]>([])
  const [soloConfermati, setSoloConfermati] = useState(false)
  const [gestore, setGestore] = useState('tutti')
  const [cerca, setCerca] = useState('')
  const [quante, setQuante] = useState(PAGINA)

  useEffect(() => {
    fetch(`/data/${scenario}/registro_interventi.csv`)
      .then((r) => r.text())
      .then((testo) => {
        const [testa, ...corpo] = testo.trim().split('\n')
        const campi = testa.split(',')
        setRighe(corpo.map((l) => Object.fromEntries(l.split(',').map((v, i) => [campi[i], v])) as unknown as Riga))
      })
  }, [scenario])

  // gli interventi chiusi dall'operatore: si ricaricano quando ne chiude uno nuovo
  useEffect(() => {
    fetch(`/api/interventi?giornata=${temporale}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setConfermati, () => setConfermati([]))
  }, [temporale, chiusi.length])

  // ogni riga del registro del motore è una richiesta (stesso ordine di rigioco.json): le confermate prendono
  // causa, azione, attesa e durata dell'operatore
  const unite = useMemo(() => {
    const perId = new Map(confermati.map((c) => [c.richiesta_id, c]))
    return righe.map((r, i) => {
      const c = perId.get(i)
      return c
        ? {
            ...r,
            ora: hhmm(c.chiamata_s, true), // l'ora vera della chiamata, spostata dal ritardo del veicolo
            causa_confermata: c.causa,
            azione: c.azione,
            attesa_s: String(c.attesa_s),
            durata_s: String(c.durata_s),
            operatore: 'tu',
          }
        : r
    })
  }, [righe, confermati])

  const gestori = useMemo(() => [...new Set(righe.map((r) => r.gestore))], [righe])
  const visibili = useMemo(() => {
    const q = cerca.toLowerCase()
    return unite.filter(
      (r) =>
        (!soloConfermati || r.causa_confermata) &&
        (ruolo !== 'cliente' || r.gestore.startsWith('Poste')) &&
        (gestore === 'tutti' || r.gestore === gestore) &&
        (!q || r.via.toLowerCase().includes(q) || r.veicolo.includes(q) || r.motivo_previsto.toLowerCase().includes(q)),
    )
  }, [unite, gestore, cerca, ruolo, soloConfermati])

  const entro20 = visibili.length ? (100 * visibili.filter((r) => +r.attesa_s <= 20).length) / visibili.length : 0
  const attesaMedia = visibili.length ? visibili.reduce((a, r) => a + +r.attesa_s, 0) / visibili.length : 0

  const esporta = () => {
    const testa = Object.keys(visibili[0] ?? {}).join(',')
    const blob = new Blob([[testa, ...visibili.map((r) => Object.values(r).join(','))].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'registro_interventi.csv'
    a.click()
  }

  return (
    <Pagina>
      <Titolo eyebrow="Giovedì 3 ottobre 2024" titolo="Registro degli interventi">
        Ogni richiesta di aiuto, con chi l'ha presa, quanto ha aspettato il veicolo e perché il motore se l'aspettava. Esportabile
        per il cliente e per l'autorità.
      </Titolo>

      <div className="grid grid-cols-3 gap-3">
        <Numero etichetta="Interventi" valore={new Intl.NumberFormat('it-IT', { useGrouping: 'always' } as Intl.NumberFormatOptions).format(visibili.length)} />
        <Numero etichetta="Presi entro 20 s" valore={entro20.toFixed(1).replace('.', ',')} unita="%" sotto="obiettivo 90%" />
        <Numero etichetta="Attesa media" valore={attesaMedia.toFixed(1).replace('.', ',')} unita="s" />
      </div>

      <section className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
        <div className="flex items-center gap-3 border-b border-line p-3">
          <div className="flex h-9 flex-1 items-center gap-2 rounded-lg bg-elevated px-3 ring-1 ring-line">
            <Search className="size-4 text-muted" />
            <input
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="Cerca via, veicolo o causa"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          {ruolo !== 'cliente' && (
            <div className="flex rounded-lg bg-elevated p-0.5 ring-1 ring-line">
              {['tutti', ...gestori].map((g) => (
                <button
                  key={g}
                  onClick={() => setGestore(g)}
                  className={`h-8 rounded-md px-3 text-xs transition-colors ${g === gestore ? 'bg-base text-primary ring-1 ring-line-strong' : 'text-muted hover:text-secondary'}`}
                >
                  {g === 'tutti' ? 'Tutte le flotte' : g.split(' · ')[0]}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setSoloConfermati((x) => !x)}
            className={`flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium ring-1 transition-colors ${soloConfermati ? 'bg-info/15 text-info ring-info/60' : 'ring-line-strong hover:bg-elevated'}`}
          >
            Solo confermati
          </button>
          <button onClick={esporta} className="flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium ring-1 ring-line-strong hover:bg-elevated">
            <Download className="size-4 text-secondary" /> CSV
          </button>
        </div>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="eyebrow border-b border-line">
              {['Ora', 'Veicolo', 'Flotta', 'Via', 'Causa prevista', 'Causa confermata', 'P', 'Attesa', 'Durata', 'Op.'].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibili.slice(0, quante).map((r, i) => {
              const lenta = +r.attesa_s > 20
              return (
                <tr key={i} className={`border-b border-line/60 transition-colors hover:bg-elevated/60 ${r.causa_confermata ? 'bg-info/[0.06]' : ''}`}>
                  <td className="num px-4 py-2 text-secondary">{r.ora}</td>
                  <td className="num px-4 py-2 font-medium">{sigla(r.veicolo)}</td>
                  <td className="px-4 py-2 text-secondary">{r.gestore}</td>
                  <td className="max-w-[220px] truncate px-4 py-2">{r.via}</td>
                  <td className="max-w-[200px] truncate px-4 py-2 text-secondary">{r.motivo_previsto}</td>
                  <td className="max-w-[200px] truncate px-4 py-2">
                    {r.causa_confermata ? (
                      <span className="inline-flex items-center gap-1.5 text-info">
                        <span className="size-1.5 rounded-full bg-info" />
                        {r.causa_confermata}
                      </span>
                    ) : (
                      <span className="text-line-strong">—</span>
                    )}
                  </td>
                  <td className="num px-4 py-2 text-muted">{(+r.probabilita_prevista * 100).toFixed(1)}%</td>
                  <td className="num px-4 py-2" style={{ color: lenta ? 'var(--color-warn)' : undefined }}>
                    {r.attesa_s} s
                  </td>
                  <td className="num px-4 py-2 text-secondary">{r.durata_s} s</td>
                  <td className="num px-4 py-2 text-muted">{r.operatore}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {quante < visibili.length && (
          <button onClick={() => setQuante((q) => q + PAGINA * 3)} className="w-full py-3 text-xs text-muted hover:text-primary">
            Mostra altri · {(visibili.length - quante).toLocaleString('it-IT')} rimanenti
          </button>
        )}
      </section>
    </Pagina>
  )
}
