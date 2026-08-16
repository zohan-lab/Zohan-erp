import { ComponentProps } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import XIcon from "lucide-react/dist/esm/icons/x"

import { cn } from "@/lib/utils"

function Dialog({
  ...props
}: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  fullScreen,
  hideClose,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { fullScreen?: boolean; hideClose?: boolean }) {
  const isFullScreen = fullScreen || (typeof className === 'string' && (className.includes('w-screen') || className.includes('inset-0') || className.includes('fullscreen')))

  return (
    <DialogPortal data-slot="dialog-portal">
      {!isFullScreen && <DialogOverlay />}
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-fullscreen={isFullScreen ? "true" : undefined}
        className={cn(
          "bg-background z-50 duration-200",
          isFullScreen
            ? "!fixed !inset-0 !top-0 !left-0 !right-0 !bottom-0 !w-screen !h-screen !max-w-none !max-h-none !m-0 !p-0 !rounded-none !border-0 !shadow-none !flex !flex-col !overflow-hidden !translate-x-0 !translate-y-0 !transform-none !z-[99999]"
            : "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-responsive-md rounded-lg border modal-spacing-responsive shadow-lg sm:max-w-lg modal-content",
          className
        )}
        style={isFullScreen ? {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          maxWidth: '100vw',
          maxHeight: '100vh',
          margin: 0,
          padding: 0,
          borderRadius: 0,
          border: 'none',
          transform: 'none',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        } : undefined}
        {...props}
      >
        {children}
        {!hideClose && !isFullScreen && (
          <DialogPrimitive.Close className="absolute top-3 right-3 sm:top-4 sm:right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 flex items-center justify-center border border-slate-200/80 shadow-2xs transition-all focus:outline-none focus:ring-2 focus:ring-[#5B5FEF]/30 z-50 cursor-pointer p-0 shrink-0">
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-responsive-sm text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-responsive-sm sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
