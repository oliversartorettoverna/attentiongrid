import { useScenario } from '../lib/ScenarioContext'
import { score } from '../lib/scenario'
import { Pagina, Riquadro, Titolo } from '../components/Pagina'
import { coloreLivello } from '../components/Stato'

export function Configurazione() {
  const sc = useScenario()
  if (!sc) return null
  const v = sc.validazione
  return (
    <Pagina>
      <Titolo eyebrow="Amministrazione" titolo="Flotte, soglie e livello di servizio">
        Quello che cambia da un cliente all'altro. Le soglie dello score decidono quando un veicolo va tenuto d'occhio e quando
        serve un intervento.
      </Titolo>

      <div className="grid grid-cols-2 gap-3">
        <Riquadro titolo="Flotte collegate">
          <div className="mt-3 divide-y divide-line">
            {Object.entries(sc.flotte).map(([k, f]) => (
              <div key={k} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium">{f.nome}</div>
                  <div className="num text-xs text-muted">{k}</div>
                </div>
                <div className="num text-sm text-secondary">{f.veicoli} veicoli</div>
              </div>
            ))}
          </div>
        </Riquadro>

        <Riquadro titolo="Soglie dell'Autonomy Confidence Score">
          <div className="mt-4 space-y-4">
            <Soglia livello={1} nome="Osservazione" valore={score(sc.soglie.osservazione)} nota="sotto questo score il veicolo sale nella lista da tenere d'occhio" />
            <Soglia livello={2} nome="Intervento" valore={score(sc.soglie.intervento)} nota="sotto questo score l'intervento è probabile" />
            <div className="rounded-xl bg-elevated p-3 text-xs text-secondary">
              Lo score è 100 meno la probabilità (in %) che il veicolo chieda aiuto nei prossimi {sc.soglie.orizzonte_min} minuti.
              Con queste soglie i veicoli passano il <span className="num text-primary">{v.tempo_pct.rosso}%</span> del tempo in
              critico, e il critico anticipa il <span className="num text-primary">{v.richieste_da_pct.rosso}%</span> delle
              richieste ({v.anticipo_s} s prima).
            </div>
          </div>
        </Riquadro>

        <Riquadro titolo="Livello di servizio">
          <div className="mt-3 flex items-baseline gap-2">
            <span className="num text-[32px] font-medium">90%</span>
            <span className="text-sm text-secondary">delle richieste prese entro</span>
            <span className="num text-[32px] font-medium">20 s</span>
          </div>
        </Riquadro>
      </div>
    </Pagina>
  )
}

function Soglia({ livello, nome, valore, nota }: { livello: 1 | 2; nome: string; valore: number; nota: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="num w-14 text-2xl font-medium" style={{ color: coloreLivello(livello) }}>
        {valore}
      </div>
      <div>
        <div className="text-sm font-medium">{nome}</div>
        <div className="text-xs text-muted">{nota}</div>
      </div>
    </div>
  )
}
