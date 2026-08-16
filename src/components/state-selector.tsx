import * as React from 'react'
import {
  INDIAN_STATES,
  DEFAULT_COMPANY_STATE,
  getStateByCode,
  getStateByName,
  formatStateWithCode,
  getStateCode,
  getStateName,
  IndianState
} from '@/lib/constants/indian-states'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { CaretUpDown, Check } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface StateSelectorProps {
  value?: string // Can be state code (e.g. '19') or name (e.g. 'West Bengal')
  onChange: (stateCode: string, stateName: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
}

export function StateSelector({
  value,
  onChange,
  placeholder = 'Select State',
  disabled = false,
  className,
  id
}: StateSelectorProps) {
  const [open, setOpen] = React.useState(false)

  const selectedState = React.useMemo(() => {
    if (!value) return undefined
    return getStateByCode(value) || getStateByName(value)
  }, [value])

  const selectedDisplay = selectedState
    ? `[${selectedState.code}] ${selectedState.name}`
    : ''

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-10 w-full justify-between font-normal text-left px-3',
            !selectedState && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate">{selectedDisplay || placeholder}</span>
          <CaretUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0 z-50" align="start">
        <Command>
          <CommandInput placeholder="Search state by name or code..." className="h-9" />
          <CommandList className="max-h-60 overflow-y-auto">
            <CommandEmpty>No state found.</CommandEmpty>
            <CommandGroup heading="Indian States & Union Territories">
              {INDIAN_STATES.map((state) => {
                const isSelected = selectedState?.code === state.code
                return (
                  <CommandItem
                    key={state.code}
                    value={`${state.code} ${state.name}`}
                    onSelect={() => {
                      onChange(state.code, state.name)
                      setOpen(false)
                    }}
                    className="flex items-center justify-between text-xs py-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-primary w-6 text-right">[{state.code}]</span>
                      <span className="font-medium text-foreground">{state.name}</span>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-primary" />}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
