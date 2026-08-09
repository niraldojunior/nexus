import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { installApiFetchRewrite } from './services/fetch-compat'

// Initialize the auth token on first load. Defaults to 'change-me' (dev/Vercel
// parity); a deploy can override it at build time via VITE_AUTH_TOKEN so the SPA
// matches the backend AUTH_TOKEN on the VPS. Not a secret — it ships in the bundle.
const bootstrapToken = (import.meta.env.VITE_AUTH_TOKEN as string | undefined) ?? 'change-me'
if (!localStorage.getItem('authToken')) {
  localStorage.setItem('authToken', bootstrapToken)
}

installApiFetchRewrite()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
