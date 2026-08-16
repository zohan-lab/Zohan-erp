import React, { useState } from 'react'
import { WifiSlash, ArrowClockwise, CloudWarning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

interface NetworkBlockerProps {
  isOnline: boolean
  onRetry: () => Promise<boolean>
}

export function NetworkBlocker({ isOnline, onRetry }: NetworkBlockerProps) {
  const [retrying, setRetrying] = useState(false)

  if (isOnline) return null

  const handleRetry = async () => {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setTimeout(() => {
        setRetrying(false)
      }, 500)
    }
  }

  return (
    <div 
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="no-internet-title"
    >
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/80 p-6 sm:p-8 text-center space-y-6 animate-in zoom-in-95 duration-200">
        {/* Glowing Wifi Slash Icon */}
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center rounded-2xl bg-red-50 border border-red-100 text-red-600 shadow-sm">
          <div className="absolute inset-0 rounded-2xl bg-red-400/20 animate-ping opacity-75" />
          <WifiSlash className="h-10 w-10 relative z-10" weight="duotone" />
        </div>

        {/* Title and Description */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold uppercase tracking-wider">
            <CloudWarning className="h-4 w-4 text-amber-600" weight="fill" />
            Pure Cloud Mode Active
          </div>
          <h2 id="no-internet-title" className="text-2xl font-extrabold text-slate-900 tracking-tight">
            No Internet Connection
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed max-w-xs mx-auto">
            To prevent data loss and desynchronization, billing and accounting actions are temporarily paused until you reconnect.
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-2 space-y-3">
          <Button
            onClick={handleRetry}
            disabled={retrying}
            className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
          >
            <ArrowClockwise className={`h-5 w-5 ${retrying ? 'animate-spin' : ''}`} weight="bold" />
            {retrying ? 'Testing Connection...' : 'Check Connection & Retry'}
          </Button>

          <p className="text-xs text-slate-400 font-medium">
            Your data is safely stored in the cloud. Changes will resume instantly once your internet returns.
          </p>
        </div>
      </div>
    </div>
  )
}
