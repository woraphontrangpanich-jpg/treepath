import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/base.css'
import App from './App.tsx'
import './index.css'
import { hydrate } from './state/store'
import { hydrateTrees } from './state/trees'

void hydrate()
void hydrateTrees()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
