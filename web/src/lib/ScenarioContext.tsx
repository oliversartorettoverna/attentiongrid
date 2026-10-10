import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { caricaScenario, type Scenario } from './scenario'

const Ctx = createContext<Scenario | null>(null)
const ErroreCtx = createContext<string | null>(null)

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [sc, setSc] = useState<Scenario | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  useEffect(() => {
    caricaScenario().then(setSc, (e) => setErrore(String(e)))
  }, [])
  return (
    <ErroreCtx.Provider value={errore}>
      <Ctx.Provider value={sc}>{children}</Ctx.Provider>
    </ErroreCtx.Provider>
  )
}

export const useScenario = () => useContext(Ctx)
export const useErroreScenario = () => useContext(ErroreCtx)
