import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './theme.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Service worker minimal (aucun cache, voir public/sw.js) -- requis par
// Chrome/Android pour proposer l'installation sur l'écran d'accueil (PWA).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
