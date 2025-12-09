import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// Filter FLV.js audio frame drop warnings (these are normal and can be ignored)
const originalWarn = console.warn
console.warn = (...args: any[]) => {
  const message = args.join(' ')
  // Suppress FLV.js MP4Remuxer audio frame drop warnings
  if (message.includes('MP4Remuxer') && message.includes('Dropping') && message.includes('audio frame')) {
    // These warnings are normal - FLV.js drops audio frames to maintain sync
    // They don't indicate errors, just timing adjustments in the stream
    return
  }
  originalWarn.apply(console, args)
}

// Global error handler - only log unexpected errors
window.addEventListener('error', (event) => {
  // Filter out expected errors (network, WebSocket, etc.)
  const errorMessage = event.error?.message || event.message || ''
  const isExpectedError = 
    errorMessage.includes('WebSocket') ||
    errorMessage.includes('Network') ||
    errorMessage.includes('ERR_CONNECTION_REFUSED') ||
    errorMessage.includes('Failed to fetch')
  
  if (!isExpectedError && event.error) {
    console.error('Unexpected error:', event.error)
  }
}, true)

window.addEventListener('unhandledrejection', (event) => {
  // Filter out expected promise rejections
  const reason = event.reason?.message || String(event.reason) || ''
  const isExpectedRejection =
    reason.includes('Network') ||
    reason.includes('WebSocket') ||
    reason.includes('ERR_CONNECTION_REFUSED') ||
    reason.includes('Failed to fetch')
  
  if (!isExpectedRejection) {
    console.error('Unhandled promise rejection:', event.reason)
  }
})

// Verify root element exists
const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found! Check index.html')
}

try {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  )
} catch (error) {
  rootElement.innerHTML = `
    <div style="padding:50px;color:#ff4444;background:#0a0e27;min-height:100vh;font-family:Arial;text-align:center;">
      <h1 style="font-size:2em;color:#ff4444;">React Error</h1>
      <p style="font-size:1.2em;color:#ffd700;margin:20px 0;">${error instanceof Error ? error.message : String(error)}</p>
      <p style="color:#b8b8b8;">Check browser console (F12) for details.</p>
      <pre style="background:#050812;padding:20px;border-radius:8px;margin-top:20px;text-align:left;overflow:auto;color:#ffd700;max-width:800px;margin-left:auto;margin-right:auto;">${error instanceof Error ? error.stack : String(error)}</pre>
    </div>
  `
}
