import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBusinessId } from '@/lib/storage-utils'
import { getCurrentFY } from '@/lib/calculations'
import { DEFAULT_COMPANY_STATE } from '@/lib/constants/indian-states'
import { StateSelector } from '@/components/state-selector'
import { Plus } from '@phosphor-icons/react'
import { toast } from 'sonner'

interface AddBusinessDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBusinessCreated: (id: string, name: string, startFY: string, stateCode?: string, stateName?: string) => void
}

export function AddBusinessDialog({ open, onOpenChange, onBusinessCreated }: AddBusinessDialogProps) {
  const [businessName, setBusinessName] = useState('')
  const [stateCode, setStateCode] = useState(DEFAULT_COMPANY_STATE.code)
  const [stateName, setStateName] = useState(DEFAULT_COMPANY_STATE.name)

  const handleCreate = () => {
    if (!businessName.trim()) {
      toast.error('Please enter a business name')
      return
    }

    const id = createBusinessId(businessName)
    onBusinessCreated(id, businessName.trim(), getCurrentFY(), stateCode, stateName)
    
    setBusinessName('')
    setStateCode(DEFAULT_COMPANY_STATE.code)
    setStateName(DEFAULT_COMPANY_STATE.name)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="modal-content sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" weight="bold" />
            Add New Business
          </DialogTitle>
          <DialogDescription>
            Create a new business entity with base GST jurisdiction
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="business-name">Business Name</Label>
            <Input
              id="business-name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Enter business name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="business-state">Primary GST State</Label>
            <StateSelector
              id="business-state"
              value={stateCode}
              onChange={(code, name) => {
                setStateCode(code)
                setStateName(name)
              }}
              placeholder="Select State"
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate}>
            Create Business
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
