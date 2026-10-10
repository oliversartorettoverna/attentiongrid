import { useEffect, useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { Pagina, Numero, Titolo } from '../components/Pagina'
import { sigla } from '../lib/scenario'
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
}

const PAGINA = 80

export function Registro() {
  const [righe, setRighe] = useState<Riga[]>([])
  const [ruolo] = useRuolo()
  const { scenario } = useOra()
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

  const gestori = useMemo(() => [...new Set(righe.map((r) => r.gestore))], [righe])
  const visibili = useMemo(() => {
    const q = cerca.toLowerCase()
    return righe.filter(
      (r) =>
        (ruolo !== 'cliente' || r.gestore.startsWith('Poste')) &&
        (gestore === 'tutti' || r.gestore === gestore) &&
        (!q || r.via.toLowerCase().includes(q) || r.veicolo.includes(q) || r.motivo_previsto.toLowerCase().includes(q)),
    )
  }, [righe, gestore, cerca, ruolo])

  const entro20 = visibili.length ? (100 * visibili.filter((r) => +r.attesa_s <= 20).length) / visibili.length : 0
  const attesaMedia = visibili.length ? visibili.reduce((a, r) => a + +r.attesa_s, 0) / visibili.length : 0
  const perMotivo = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of visibili) m.set(r.motivo_previsto, (m.get(r.motivo_previsto) ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 4)
  }, [visibili])

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

      <div className="grid grid-cols-4 gap-3">
        <Numero etichetta="Interventi" valore={visibili.length.toLocaleString('it-IT')} />
        <Numero etichetta="Presi entro 20 s" valore={entro20.toFixed(1).replace('.', ',')} unita="%" sotto="obiettivo 90%" />
        <Numero etichetta="Attesa media" valore={attesaMedia.toFixed(1).replace('.', ',')} unita="s" />
        <div className="rounded-2xl bg-surface p-5 ring-1 ring-line">
          <div className="text-xs text-muted">Causa prevista più frequente</div>
          <div className="mt-2 space-y-1.5">
            {perMotivo.map(([m, n]) => (
              <div key={m} className="flex items-center gap-2 text-xs">
                <div className="h-1 rounded-full bg-secondary" style={{ width: `${(n / (perMotivo[0]?.[1] || 1)) * 60}px` }} />
                <span className="truncate text-secondary">{m}</span>
              </div>
            ))}
          </div>
        </div>
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
          <button onClick={esporta} className="flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium ring-1 ring-line-strong hover:bg-elevated">
            <Download className="size-4 text-secondary" /> CSV
          </button>
        </div>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="eyebrow border-b border-line">
              {['Ora', 'Veicolo', 'Flotta', 'Via', 'Causa prevista', 'P', 'Attesa', 'Durata', 'Op.'].map((h) => (
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
                <tr key={i} className="border-b border-line/60 transition-colors hover:bg-elevated/60">
                  <td className="num px-4 py-2 text-secondary">{r.ora}</td>
                  <td className="num px-4 py-2 font-medium">{sigla(r.veicolo)}</td>
                  <td className="px-4 py-2 text-secondary">{r.gestore}</td>
                  <td className="max-w-[220px] truncate px-4 py-2">{r.via}</td>
                  <td className="max-w-[240px] truncate px-4 py-2 text-secondary">{r.motivo_previsto}</td>
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
