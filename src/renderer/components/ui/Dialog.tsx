import { useEffect, useId, useRef, type ReactNode } from 'react'

interface DialogProps {
  title: string
  description?: string
  children: ReactNode
  footer: ReactNode
  onClose: () => void
  width?: 'sm' | 'md'
}

export function Dialog({ title, description, children, footer, onClose, width = 'sm' }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={`native-dialog ${width === 'md' ? 'native-dialog-md' : ''}`}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="native-dialog-body">
        <div className="native-dialog-heading">
          <h2 id={titleId}>{title}</h2>
          {description && <p id={descriptionId}>{description}</p>}
        </div>
        {children}
      </div>
      <div className="native-dialog-footer">{footer}</div>
    </dialog>
  )
}
