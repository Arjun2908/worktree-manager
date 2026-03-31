import { useState, useEffect } from 'react'
import { RefreshCw, LayoutGrid, List, Search, Moon, Sun, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../stores/app-store'
import { Tooltip } from '../ui/Tooltip'
import { cn } from '../../lib/utils'

interface HeaderProps {
  isLoading: boolean
  scanProgress: { current: number; total: number; repo: string } | null
  onRefresh: () => void
  worktreeCount: number
  totalCount: number
}

export function Header({ isLoading, scanProgress, onRefresh, worktreeCount, totalCount }: HeaderProps) {
  const { searchQuery, setSearchQuery, viewMode, setViewMode, currentView, selectedRepo, theme, setTheme, hideMainWorktrees } = useAppStore()
  const [showDone, setShowDone] = useState(false)
  const [wasLoading, setWasLoading] = useState(false)

  // Track loading -> done transition for refresh feedback
  useEffect(() => {
    if (isLoading) {
      setWasLoading(true)
    } else if (wasLoading) {
      setWasLoading(false)
      setShowDone(true)
      const timer = setTimeout(() => setShowDone(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [isLoading])

  const breadcrumb = currentView === 'dashboard'
    ? 'Dashboard'
    : selectedRepo
      ? `${selectedRepo}`
      : 'All Worktrees'

  return (
    <div className="flex-shrink-0 px-6 py-3 border-b border-border flex items-center gap-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-text-primary">{breadcrumb}</h2>
        {currentView === 'worktrees' && (
          <span className="text-xs text-text-tertiary">
            {worktreeCount} worktrees{hideMainWorktrees ? ' (excluding main)' : ''}
          </span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Scan progress / completion toast */}
      <AnimatePresence mode="wait">
        {isLoading && scanProgress ? (
          <motion.div
            key="progress"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="flex items-center gap-2 text-xs text-text-tertiary"
          >
            <div className="w-3.5 h-3.5 border-2 border-border border-t-primary rounded-full animate-spin" />
            <span>Scanning {scanProgress.repo}...</span>
            <span className="text-text-faint">{scanProgress.current}/{scanProgress.total}</span>
          </motion.div>
        ) : showDone ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="flex items-center gap-1.5 text-xs text-emerald-500"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Scan complete</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Search */}
      {currentView === 'worktrees' && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-faint" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48 pl-8 pr-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-text-primary placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all"
          />
        </div>
      )}

      {/* View toggle */}
      {currentView === 'worktrees' && (
        <div className="flex items-center bg-surface rounded-lg p-0.5 border border-border">
          <Tooltip text="Card view" position="below">
            <button
              onClick={() => setViewMode('card')}
              className={cn(
                'p-1.5 rounded-md transition-all',
                viewMode === 'card' ? 'bg-surface-active text-text-primary' : 'text-text-faint hover:text-text-secondary'
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
          <Tooltip text="Table view" position="below">
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'p-1.5 rounded-md transition-all',
                viewMode === 'table' ? 'bg-surface-active text-text-primary' : 'text-text-faint hover:text-text-secondary'
              )}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>
      )}

      {/* Theme toggle */}
      <Tooltip text={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} position="below">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-all"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </Tooltip>

      {/* Refresh */}
      <Tooltip text="Rescan all repositories (Cmd+R)" position="below">
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className={cn(
            'p-2 rounded-lg transition-all disabled:opacity-50',
            isLoading
              ? 'text-primary bg-primary/10'
              : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
          )}
        >
          <motion.div
            animate={isLoading ? { rotate: 360 } : { rotate: 0 }}
            transition={isLoading ? { duration: 1, repeat: Infinity, ease: 'linear' } : { duration: 0.3 }}
          >
            <RefreshCw className="w-4 h-4" />
          </motion.div>
        </button>
      </Tooltip>
    </div>
  )
}
