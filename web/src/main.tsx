import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import { Shell } from './components/Shell'
import { ScenarioProvider } from './lib/ScenarioContext'
import { RUOLI, useRuolo } from './lib/ruolo'
import { Console } from './pages/Console'
import { Planner } from './pages/Planner'
import { Registro } from './pages/Registro'
import { Flotta } from './pages/Flotta'
import { Configurazione } from './pages/Configurazione'

function Home() {
  const [ruolo] = useRuolo()
  return <Navigate to={RUOLI[ruolo].home} replace />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ScenarioProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="console" element={<Console />} />
            <Route path="planner" element={<Planner />} />
            <Route path="registro" element={<Registro />} />
            <Route path="flotta" element={<Flotta />} />
            <Route path="configurazione" element={<Configurazione />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ScenarioProvider>
  </StrictMode>,
)
