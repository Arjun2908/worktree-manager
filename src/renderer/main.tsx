import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true
    }
  }
})

function RendererReadyReporter() {
  useEffect(() => {
    let active = true
    const reportReady = async () => {
      // This handshake is the packaged smoke-test boundary. It proves React
      // committed, the sandboxed preload bridge loaded, and trusted IPC works.
      await window.api.getUpdateStatus()
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const root = document.getElementById('root')
      if (!active || !root || root.childElementCount === 0 || !root.textContent?.trim()) return
      await window.api.reportRendererReady()
    }
    void reportReady().catch((error) => {
      console.error('Renderer readiness check failed', error)
    })
    return () => {
      active = false
    }
  }, [])

  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <RendererReadyReporter />
    </QueryClientProvider>
  </React.StrictMode>
)
