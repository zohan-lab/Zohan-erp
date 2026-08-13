import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { DotsThreeVertical, PencilSimple, Trash, Clock, User, Crown, UserCircle } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface EditHistoryChange {
  field: string
  from: string
  to: string
}

export interface EditHistoryLog {
  timestamp: string
  action: 'created' | 'updated' | string
  changedBy: string
  /** Role of the actor captured at edit time. Preferred over string-sniffing for badge logic. */
  changedByRole?: string
  details?: string
  changes?: EditHistoryChange[]
}

interface ThreeDotDropdownProps {
  onEdit: () => void
  onDelete: () => void
  history?: EditHistoryLog[]
  entityType?: string
  isLocked?: boolean
}

export function ThreeDotDropdown({
  onEdit,
  onDelete,
  history = [],
  entityType = 'Record',
  isLocked = false
}: ThreeDotDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  // Calculate position of the dropdown relative to the viewport
  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const menuWidth = 176 // w-44 = 11rem = 176px
      const menuHeight = 140 // approximate height of menu

      let top = rect.bottom + 4
      let left = rect.right - menuWidth

      // If menu would overflow bottom of viewport, show above the trigger
      if (top + menuHeight > window.innerHeight) {
        top = rect.top - menuHeight - 4
      }

      // If menu would overflow left edge, align to left of trigger
      if (left < 8) {
        left = rect.left
      }

      setMenuPosition({ top, left })
    }
  }, [])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    function handleScroll() {
      setIsOpen(false)
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      window.addEventListener('scroll', handleScroll, true)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [isOpen])

  // Update position when opened
  useEffect(() => {
    if (isOpen) {
      updatePosition()
    }
  }, [isOpen, updatePosition])

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-slate-500 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer"
        type="button"
      >
        <DotsThreeVertical size={18} weight="bold" />
      </button>

      {/* Portal-rendered dropdown menu */}
      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed w-44 rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-1 duration-150"
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            zIndex: 9999,
          }}
        >
          <button
            type="button"
            disabled={isLocked}
            onClick={() => {
              setIsOpen(false)
              onEdit()
            }}
            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <PencilSimple size={16} className="text-slate-500" />
            Edit
          </button>

          <button
            type="button"
            onClick={() => {
              setIsOpen(false)
              setHistoryOpen(true)
            }}
            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
          >
            <Clock size={16} className="text-slate-500" />
            Edit History
          </button>

          <div className="h-px bg-slate-100 my-1" />

          <button
            type="button"
            disabled={isLocked}
            onClick={() => {
              setIsOpen(false)
              onDelete()
            }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50/50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-medium"
          >
            <Trash size={16} className="text-red-500" />
            Delete
          </button>
        </div>,
        document.body
      )}

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-2xl p-6 bg-white shadow-xl max-h-[90vh] overflow-y-auto" style={{ zIndex: 9999 }}>
          <DialogHeader className="flex flex-row items-center justify-between border-b pb-4 border-slate-100">
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Clock size={20} className="text-blue-600" />
              {entityType} Edit History
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {history && history.length > 0 ? (
              <div className="relative border-l-2 border-slate-200 ml-3.5 pl-5 space-y-6">
                {history.map((log, idx) => {
                  const isCreated = log.action === 'created'
                  return (
                    <div key={idx} className="relative">
                      {/* Circle Indicator */}
                      <div className={`absolute -left-[28px] top-1 h-4 w-4 rounded-full border-2 border-white shadow-sm flex items-center justify-center ${isCreated ? 'bg-emerald-500' : 'bg-blue-600'}`} />

                      <div className="space-y-2">
                        {/* Header: action badge + timestamp */}
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span className={`font-semibold px-2 py-0.5 rounded capitalize ${isCreated ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' : 'text-blue-700 bg-blue-50 border border-blue-200'}`}>
                            {log.action}
                          </span>
                          <span className="font-medium">
                            {new Date(log.timestamp).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'short'
                            })}
                          </span>
                        </div>

                        {/* Changed by */}
                        {(() => {
                          const label = log.changedBy || ''
                          // Authoritative check: use the persisted role field if present (new logs).
                          // Fall back to string-sniff only for legacy entries that predate the schema.
                          const isMaster =
                            log.changedByRole === 'master_admin' ||
                            (!log.changedByRole && (
                              label === 'Master Admin' ||
                              label.toLowerCase().includes('master') ||
                              label.toLowerCase().includes('admin')
                            ))
                          return (
                            <div className="flex items-center gap-1.5 text-sm font-medium">
                              {isMaster ? (
                                <Crown size={15} weight="fill" className="text-amber-500" />
                              ) : (
                                <UserCircle size={15} weight="fill" className="text-blue-500" />
                              )}
                              <span className={isMaster ? 'text-amber-700' : 'text-blue-700'}>{log.changedBy}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${isMaster ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-blue-50 text-blue-600 border border-blue-200'}`}>
                                {isMaster ? 'Master' : 'Agent'}
                              </span>
                            </div>
                          )
                        })()}

                        {/* From → To Changes Table */}
                        {log.changes && log.changes.length > 0 && (
                          <div className="rounded-lg border border-slate-100 overflow-hidden mt-1.5">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-50/80">
                                  <th className="text-left px-3 py-1.5 font-semibold text-slate-500 uppercase tracking-wider">Field</th>
                                  {!isCreated && (
                                    <th className="text-left px-3 py-1.5 font-semibold text-slate-500 uppercase tracking-wider">From</th>
                                  )}
                                  <th className="text-left px-3 py-1.5 font-semibold text-slate-500 uppercase tracking-wider">{isCreated ? 'Value' : 'To'}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {log.changes.map((change, ci) => (
                                  <tr key={ci} className="border-t border-slate-50">
                                    <td className="px-3 py-1.5 font-medium text-slate-600">{change.field}</td>
                                    {!isCreated && (
                                      <td className="px-3 py-1.5 text-red-500 line-through">{change.from || '-'}</td>
                                    )}
                                    <td className="px-3 py-1.5 text-emerald-600 font-medium">{change.to}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Legacy details string fallback */}
                        {log.details && (!log.changes || log.changes.length === 0) && (
                          <p className="text-xs text-slate-500 bg-slate-50/50 p-2 rounded-lg border border-slate-100 mt-1.5">
                            {log.details}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 flex flex-col items-center gap-2">
                <Clock size={32} className="text-slate-300" />
                <p className="text-sm font-medium">No edit history available for this {entityType.toLowerCase()}.</p>
              </div>
            )}
          </div>

          <div className="flex justify-end border-t pt-4 border-slate-100 mt-6">
            <Button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 border-none rounded-xl"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
