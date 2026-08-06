import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Code,
  FolderOpen,
  Lock,
  MoreHorizontal,
  MousePointer2,
  Terminal,
  Trash2,
  Unlock
} from 'lucide-react'
import type { Worktree } from '../../types'

interface WorktreeActionMenuProps {
  worktree: Worktree
  lockPending: boolean
  onLockChange: (worktree: Worktree, shouldLock: boolean) => Promise<boolean>
  onDelete: (worktree: Worktree) => void
}

interface HotModuleApi {
  on: (event: 'vite:beforeUpdate', callback: () => void) => void
  off: (event: 'vite:beforeUpdate', callback: () => void) => void
}

export function WorktreeActionMenu({
  worktree,
  lockPending,
  onLockChange,
  onDelete
}: WorktreeActionMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const initialMenuFocus = useRef<'first' | 'last'>('first')

  useLayoutEffect(() => {
    if (!menuOpen) return

    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return

    const triggerBounds = trigger.getBoundingClientRect()
    const menuBounds = menu.getBoundingClientRect()
    const edge = 8
    const gap = 4
    const top = triggerBounds.bottom + gap + menuBounds.height <= window.innerHeight - edge
      ? triggerBounds.bottom + gap
      : Math.max(edge, triggerBounds.top - menuBounds.height - gap)
    const left = Math.min(
      Math.max(edge, triggerBounds.right - menuBounds.width),
      window.innerWidth - menuBounds.width - edge
    )

    setMenuPosition({ top, left })
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen || !menuPosition) return
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []
    )
    const target = initialMenuFocus.current === 'last' ? items[items.length - 1] : items[0]
    target?.focus()
  }, [menuOpen, menuPosition])

  useEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null)
      return
    }

    const closeFromPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setMenuOpen(false)
      }
    }
    const closeFromViewportChange = () => setMenuOpen(false)
    document.addEventListener('pointerdown', closeFromPointer)
    window.addEventListener('resize', closeFromViewportChange)
    window.addEventListener('scroll', closeFromViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', closeFromPointer)
      window.removeEventListener('resize', closeFromViewportChange)
      window.removeEventListener('scroll', closeFromViewportChange, true)
    }
  }, [menuOpen])

  useEffect(() => {
    const closeForHotUpdate = () => setMenuOpen(false)
    const hot = (import.meta as ImportMeta & { hot?: HotModuleApi }).hot
    hot?.on('vite:beforeUpdate', closeForHotUpdate)
    return () => hot?.off('vite:beforeUpdate', closeForHotUpdate)
  }, [])

  const closeMenu = (restoreFocus = false) => {
    setMenuOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  const menuItems = () => Array.from(
    menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []
  )

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && menuOpen) {
      event.preventDefault()
      closeMenu(true)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    initialMenuFocus.current = event.key === 'ArrowUp' ? 'last' : 'first'
    if (!menuOpen) setMenuOpen(true)
    else {
      const items = menuItems()
      const target = initialMenuFocus.current === 'last' ? items[items.length - 1] : items[0]
      target?.focus()
    }
  }

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = menuItems()
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu(true)
      return
    }
    if (event.key === 'Tab') {
      closeMenu()
      return
    }

    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = items.length - 1
    if (nextIndex != null && items[nextIndex]) {
      event.preventDefault()
      items[nextIndex].focus()
    }
  }

  return (
    <div className="row-actions">
      <button
        ref={triggerRef}
        type="button"
        className="toolbar-icon-button"
        aria-label={`Actions for ${worktree.branch || 'detached worktree'}`}
        aria-haspopup="menu"
        aria-controls={menuOpen ? menuId : undefined}
        aria-expanded={menuOpen}
        aria-busy={lockPending}
        onClick={() => {
          initialMenuFocus.current = 'first'
          setMenuOpen((open) => !open)
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <MoreHorizontal className={lockPending ? 'animate-pulse' : undefined} aria-hidden="true" />
      </button>

      {menuOpen && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          className="row-action-menu"
          role="menu"
          aria-label={`Actions for ${worktree.branch || 'detached worktree'}`}
          onKeyDown={handleMenuKeyDown}
          style={{
            top: menuPosition?.top ?? 0,
            left: menuPosition?.left ?? 0,
            visibility: menuPosition ? 'visible' : 'hidden'
          }}
        >
          <button type="button" role="menuitem" onClick={() => { void window.api.openInFinder(worktree.path); closeMenu() }}>
            <FolderOpen aria-hidden="true" /> Finder
          </button>
          <button type="button" role="menuitem" onClick={() => { void window.api.openInTerminal(worktree.path); closeMenu() }}>
            <Terminal aria-hidden="true" /> Terminal
          </button>
          <button type="button" role="menuitem" onClick={() => { void window.api.openInEditor(worktree.path, 'code'); closeMenu() }}>
            <Code aria-hidden="true" /> VS Code
          </button>
          <button type="button" role="menuitem" onClick={() => { void window.api.openInEditor(worktree.path, 'cursor'); closeMenu() }}>
            <MousePointer2 aria-hidden="true" /> Cursor
          </button>
          {!worktree.isMainWorktree && (
            <>
              <hr role="separator" />
              <button
                type="button"
                role="menuitem"
                disabled={lockPending}
                aria-busy={lockPending}
                onClick={() => {
                  void onLockChange(worktree, !worktree.locked).then((success) => {
                    if (success) closeMenu()
                  })
                }}
              >
                {worktree.locked ? <Unlock aria-hidden="true" /> : <Lock aria-hidden="true" />}
                {lockPending
                  ? worktree.locked ? 'Unlocking…' : 'Locking…'
                  : worktree.locked ? 'Unlock' : 'Lock'}
              </button>
              <button
                type="button"
                role="menuitem"
                className="destructive-menu-item"
                disabled={lockPending}
                onClick={() => { onDelete(worktree); closeMenu() }}
              >
                <Trash2 aria-hidden="true" /> Remove…
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
