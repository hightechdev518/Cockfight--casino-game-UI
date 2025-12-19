import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { setInitParams } from './utils/urlParams'
import './index.css'
import { LanguageProvider } from './i18n/LanguageContext'

// Expose utility functions globally for browser console access
if (typeof window !== 'undefined') {
  (window as any).setInitParams = setInitParams
}

// Verify root element exists
const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found! Check index.html')
}

try {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <React.StrictMode>
      <LanguageProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </LanguageProvider>
    </React.StrictMode>,
  )
} catch (error) {
  rootElement.innerHTML = `
    <div style="padding:50px;color:#ff4444;background:#0a0e27;min-height:100vh;font-family:Arial;text-align:center;">
      <h1 style="font-size:2em;color:#ff4444;">React Error</h1>
      <p style="font-size:1.2em;color:#ffd700;margin:20px 0;">${error instanceof Error ? error.message : String(error)}</p>
      <p style="color:#b8b8b8;">Please refresh the page or try again later.</p>
      <pre style="background:#050812;padding:20px;border-radius:8px;margin-top:20px;text-align:left;overflow:auto;color:#ffd700;max-width:800px;margin-left:auto;margin-right:auto;">${error instanceof Error ? error.stack : String(error)}</pre>
    </div>
  `
}
