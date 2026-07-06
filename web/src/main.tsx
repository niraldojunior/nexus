import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Initialize auth token for development (default bearer token)
if (!localStorage.getItem('authToken')) {
  localStorage.setItem('authToken', 'change-me')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
