import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBusinessId } from '@/lib/storage-utils'
import { getCurrentFY } from '@/lib/calculations'
import { Plus } from '@phosphor-icons/react'
import { toast } from 'sonner'

interface AddBusinessDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBusinessCreated: (id: string, name: string, startFY: string) => void
}

export function AddBusinessDialog({ open, onOpenChange, onBusinessCreated }: AddBusinessDialogProps) {
  const [businessName, setBusinessName] = useState('')

  const handleCreate = () => {
    if (!businessName.trim()) {
      toast.error('Please enter a business name')
      return
    }

    const id = createBusinessId(businessName)
    onBusinessCreated(id, businessName.trim(), getCurrentFY())
    
    setBusinessName('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="modal-content">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" weight="bold" />
            Add New Business
          </DialogTitle>
          <DialogDescription>
            Create a new business entity
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="business-name">Business Name</Label>
            <Input
              id="business-name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Enter business name"
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
