import { useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Calendar } from '@phosphor-icons/react'
import { getFYFromDate } from '@/lib/calculations'

export type PeriodType = 'all' | 'current_month' | 'previous_month' | 'current_fy' | 'previous_fy' | 'custom'

export interface PeriodFilterState {
  periodType: PeriodType
  fromDate: string
  toDate: string
}

export const defaultPeriodFilterState: PeriodFilterState = {
  periodType: 'all',
  fromDate: '',
  toDate: ''
}

interface PeriodDateFilterProps {
  currentFY: string
  value: PeriodFilterState
  onChange: (newState: PeriodFilterState) => void
  className?: string
}

export function getPreviousFY(currentFY: string): string {
  const norm = currentFY.startsWith('FY') ? currentFY.slice(2) : currentFY
  const [startYearStr] = norm.split('-')
  const startYear = parseInt(startYearStr, 10)
  const prevStart = startYear - 1
  const prevEnd = (prevStart + 1).toString().slice(-2)
  return `FY${prevStart}-${prevEnd}`
}

export function PeriodDateFilter({
  currentFY,
  value,
  onChange,
  className = ''
}: PeriodDateFilterProps) {
  const normCurrentFY = currentFY
    ? (currentFY.startsWith('FY') ? currentFY : `FY${currentFY}`)
    : 'FY2026-27'

  const previousFY = useMemo(() => getPreviousFY(normCurrentFY), [normCurrentFY])

  const currentMonthLabel = useMemo(() => {
    const now = new Date()
    return now.toLocaleString('en-IN', { month: 'short', year: 'numeric' })
  }, [])

  const previousMonthLabel = useMemo(() => {
    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return prev.toLocaleString('en-IN', { month: 'short', year: 'numeric' })
  }, [])

  const handlePeriodSelect = (val: string) => {
    onChange({ ...value, periodType: val as PeriodType })
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <div className="flex items-center gap-1.5 bg-background border rounded-md px-2.5 py-1 text-sm shadow-sm">
        <Calendar className="text-muted-foreground w-4 h-4 shrink-0" />
        <span className="text-xs font-medium text-muted-foreground hidden sm:inline">Period:</span>
        <Select value={value.periodType} onValueChange={handlePeriodSelect}>
          <SelectTrigger className="h-7 border-0 bg-transparent p-0 text-xs font-medium focus:ring-0 min-w-[160px] focus:outline-none">
            <SelectValue placeholder="Select Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time (All Transactions)</SelectItem>
            <SelectItem value="current_month">Current Month ({currentMonthLabel})</SelectItem>
            <SelectItem value="previous_month">Previous Month ({previousMonthLabel})</SelectItem>
            <SelectItem value="current_fy">Current FY ({normCurrentFY})</SelectItem>
            <SelectItem value="previous_fy">Previous FY ({previousFY})</SelectItem>
            <SelectItem value="custom">Custom Date Range</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value.periodType === 'custom' && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={value.fromDate}
            onChange={(e) => onChange({ ...value, fromDate: e.target.value })}
            className="h-8 text-xs w-[130px]"
            placeholder="From Date"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={value.toDate}
            onChange={(e) => onChange({ ...value, toDate: e.target.value })}
            className="h-8 text-xs w-[130px]"
            placeholder="To Date"
          />
        </div>
      )}
    </div>
  )
}

/**
 * Returns exact startISO and endISO (YYYY-MM-DD) for a period filter state.
 */
export function getPeriodDateBounds(
  filterState?: PeriodFilterState,
  currentFYSetting?: string
): { startISO: string | null; endISO: string | null } {
  if (!filterState) return { startISO: null, endISO: null }

  const { periodType, fromDate, toDate } = filterState
  const currentFYNorm = currentFYSetting
    ? (currentFYSetting.startsWith('FY') ? currentFYSetting : `FY${currentFYSetting}`)
    : 'FY2026-27'

  if (periodType === 'current_fy') {
    const startYearStr = currentFYNorm.replace('FY', '').split('-')[0]
    const startYear = parseInt(startYearStr, 10) || 2026
    return {
      startISO: `${startYear}-04-01`,
      endISO: `${startYear + 1}-03-31`
    }
  }

  if (periodType === 'previous_fy') {
    const prevFY = getPreviousFY(currentFYNorm)
    const startYearStr = prevFY.replace('FY', '').split('-')[0]
    const startYear = parseInt(startYearStr, 10) || 2025
    return {
      startISO: `${startYear}-04-01`,
      endISO: `${startYear + 1}-03-31`
    }
  }

  if (periodType === 'current_month') {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate()
    const lastDayStr = String(lastDay).padStart(2, '0')
    return {
      startISO: `${y}-${m}-01`,
      endISO: `${y}-${m}-${lastDayStr}`
    }
  }

  if (periodType === 'previous_month') {
    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const y = prev.getFullYear()
    const m = String(prev.getMonth() + 1).padStart(2, '0')
    const lastDay = new Date(y, prev.getMonth() + 1, 0).getDate()
    const lastDayStr = String(lastDay).padStart(2, '0')
    return {
      startISO: `${y}-${m}-01`,
      endISO: `${y}-${m}-${lastDayStr}`
    }
  }

  if (periodType === 'custom') {
    return {
      startISO: fromDate || null,
      endISO: toDate || null
    }
  }

  return { startISO: null, endISO: null }
}

/**
 * Helper function to test if a record date is strictly BEFORE the active period.
 */
export function isRecordBeforePeriod(
  recordDate?: string,
  filterState?: PeriodFilterState,
  currentFYSetting?: string
): boolean {
  if (!filterState || !recordDate) return false
  const { startISO } = getPeriodDateBounds(filterState, currentFYSetting)
  if (!startISO) return false
  return recordDate.slice(0, 10) < startISO
}

/**
 * Helper function to test if a transaction record matches the active period filter.
 */
export function isRecordInPeriod(
  recordDate?: string,
  recordFY?: string,
  filterState?: PeriodFilterState,
  currentFYSetting?: string
): boolean {
  if (!filterState) return true
  const { periodType, fromDate, toDate } = filterState

  if (periodType === 'all') {
    return true
  }

  const currentFYNorm = currentFYSetting
    ? (currentFYSetting.startsWith('FY') ? currentFYSetting : `FY${currentFYSetting}`)
    : 'FY2026-27'

  const computedFY = recordDate ? getFYFromDate(recordDate) : ''
  const normRecordFY = recordFY
    ? (recordFY.startsWith('FY') ? recordFY : `FY${recordFY}`)
    : computedFY

  if (periodType === 'current_fy') {
    return normRecordFY === currentFYNorm || computedFY === currentFYNorm
  }

  if (periodType === 'previous_fy') {
    const prevFY = getPreviousFY(currentFYNorm)
    return normRecordFY === prevFY || computedFY === prevFY
  }

  if (periodType === 'current_month') {
    if (!recordDate) return false
    const now = new Date()
    const recordD = new Date(recordDate)
    return (
      recordD.getFullYear() === now.getFullYear() &&
      recordD.getMonth() === now.getMonth()
    )
  }

  if (periodType === 'previous_month') {
    if (!recordDate) return false
    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const recordD = new Date(recordDate)
    return (
      recordD.getFullYear() === prev.getFullYear() &&
      recordD.getMonth() === prev.getMonth()
    )
  }

  if (periodType === 'custom') {
    if (!recordDate) return false
    const dStr = recordDate.slice(0, 10)
    if (fromDate && dStr < fromDate) return false
    if (toDate && dStr > toDate) return false
    return true
  }

  return true
}
