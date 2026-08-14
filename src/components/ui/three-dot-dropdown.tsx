import React, { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { DotsThreeVertical, PencilSimple, Trash, Clock, Crown, UserCircle } from '@phosphor-icons/react'
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
  const [historyOpen, setHistoryOpen] = useState(false)

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer flex items-center justify-center"
            type="button"
            title="More actions"
          >
            <DotsThreeVertical size={18} weight="bold" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="w-44 rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden py-1 z-[99999] focus:outline-none animate-in fade-in-0 zoom-in-95"
          >
            <DropdownMenu.Item
              disabled={isLocked}
              onSelect={() => {
                onEdit()
              }}
              className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:bg-slate-50 flex items-center gap-2 outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PencilSimple size={15} className="text-slate-500" />
              Edit
            </DropdownMenu.Item>

            <DropdownMenu.Item
              onSelect={() => {
                setTimeout(() => setHistoryOpen(true), 50)
              }}
              className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:bg-slate-50 flex items-center gap-2 outline-none cursor-pointer"
            >
              <Clock size={15} className="text-slate-500" />
              Edit History
            </DropdownMenu.Item>

            <DropdownMenu.Separator className="h-px bg-slate-100 my-1" />

            <DropdownMenu.Item
              disabled={isLocked}
              onSelect={() => {
                onDelete()
              }}
              className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 focus:bg-red-50 flex items-center gap-2 outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash size={15} className="text-red-500" />
              Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-2xl p-6 bg-white shadow-xl max-h-[90vh] overflow-y-auto z-[99999]">
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
