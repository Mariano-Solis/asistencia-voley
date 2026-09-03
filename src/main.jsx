import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import officialLogo from '../Logo.jpg'
import './styles.css'
import './mgsm-topbar.css'
import './mgsm-logo-assets.css'

document.documentElement.style.setProperty('--mgsm-logo-url', `url("${officialLogo}")`)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
