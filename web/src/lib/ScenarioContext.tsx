import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { caricaScenario, type Scenario } from './scenario'
import { useOra } from './orologio'

const Ctx = createContext<Scenario | null>(null)
const ErroreCtx = createContext<string | null>(null)

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [sc, setSc] = useState<Scenario | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  // la giornata la decide il server (diretta): quando cambia si caricano i suoi dati, tenendo i vecchi intanto
  const { scenario } = useOra()
  useEffect(() => {
    caricaScenario(scenario).then(setSc, (e) => setErrore(String(e)))
  }, [scenario])
  return (
    <ErroreCtx.Provider value={errore}>
      <Ctx.Provider value={sc}>{children}</Ctx.Provider>
    </ErroreCtx.Provider>
  )
}

export const useScenario = () => useContext(Ctx)
export const useErroreScenario = () => useContext(ErroreCtx)
