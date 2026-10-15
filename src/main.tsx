import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/index.css'

// Web fonts are skipped in the single-file build (they would bloat it by megabytes); Hiragino takes over.
if (import.meta.env.MODE !== 'single') {
  void import('./fonts')
}

if (new URLSearchParams(location.search).has('safe')) document.documentElement.classList.add('debug-safe')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
