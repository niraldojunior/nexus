import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { installApiFetchRewrite } from './services/fetch-compat'

// A sessão do usuário (JWT) é gravada em localStorage pelo fluxo de login (ver
// services/session.ts). Não há mais token estático semeado no bundle: antes de logar, a SPA
// não tem credencial e o App renderiza a tela de login.
installApiFetchRewrite()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
