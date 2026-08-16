import { useState, useEffect, useCallback } from 'react'

export interface NetworkStatus {
  isOnline: boolean
  lastChangedAt: Date
  checkConnection: () => Promise<boolean>
}

/**
 * Global hook to monitor internet connectivity status in real-time.
 * Uses navigator.onLine and native window event listeners with fallback ping check.
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true
  })
  const [lastChangedAt, setLastChangedAt] = useState<Date>(() => new Date())

  const handleOnline = useCallback(() => {
    setIsOnline(true)
    setLastChangedAt(new Date())
  }, [])

  const handleOffline = useCallback(() => {
    setIsOnline(false)
    setLastChangedAt(new Date())
  }, [])

  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOnline(false)
      return false
    }

    try {
      const response = await fetch('/favicon.ico', {
        method: 'HEAD',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })
      const ok = response.ok || response.type === 'opaque'
      setIsOnline(ok)
      return ok
    } catch {
      const online = typeof navigator !== 'undefined' ? navigator.onLine : false
      setIsOnline(online)
      return online
    }
  }, [])

  useEffect(() => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsOnline(false)
      }
    }, 30000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [handleOnline, handleOffline])

  return {
    isOnline,
    lastChangedAt,
    checkConnection
  }
}
