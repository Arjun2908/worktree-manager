import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { ScanResult, AppSettings } from '../types'

export function useWorktrees(scanRoots: string[]) {
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; repo: string } | null>(null)

  useEffect(() => {
    const cleanup = window.api.onScanProgress((progress) => {
      setScanProgress(progress)
    })
    return cleanup
  }, [])

  const query = useQuery<ScanResult>({
    queryKey: ['worktrees', scanRoots],
    queryFn: () => window.api.scanWorktrees(scanRoots),
    staleTime: 30_000,
    refetchOnWindowFocus: true
  })

  return { ...query, scanProgress }
}

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: ['settings'],
    queryFn: () => window.api.getSettings(),
    staleTime: Infinity
  })
}

export function useSaveSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: AppSettings) => window.api.saveSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    }
  })
}

export function useDeleteWorktree() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, repoPath, force }: { path: string; repoPath: string; force: boolean }) =>
      window.api.deleteWorktree(path, repoPath, force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] })
    }
  })
}

export function usePruneWorktrees() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (repoPath: string) => window.api.pruneWorktrees(repoPath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] })
    }
  })
}

export function useLockWorktree() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, repoPath }: { path: string; repoPath: string }) =>
      window.api.lockWorktree(path, repoPath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] })
    }
  })
}

export function useUnlockWorktree() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, repoPath }: { path: string; repoPath: string }) =>
      window.api.unlockWorktree(path, repoPath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] })
    }
  })
}
