import {
  useIsFetching,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey
} from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyStashCountDelta,
  getUnhydratedDiskUsagePaths,
  hydrateWorktreeDiskUsage,
  removeStashesByOid,
  removeWorktreesFromScanResult,
  setWorktreeLockState
} from '../lib/worktree-cache'
import type {
  AppSettings,
  DeleteWorktreeInput,
  DeleteWorktreeResult,
  DeleteWorktreesOutcome,
  DeleteWorktreesRequest,
  ScanProgress,
  ScanResult,
  StashDropResult,
  StashEntry
} from '../types'

export const worktreeKeys = {
  all: ['worktrees'] as const,
  scan: (scanRoots: string[], staleThresholdDays: number) =>
    [...worktreeKeys.all, { scanRoots, staleThresholdDays }] as const
}

export const stashKeys = {
  all: ['stashes'] as const,
  repo: (repoPath: string | null) => [...stashKeys.all, repoPath] as const
}

export function useRefreshData(): { refresh: () => Promise<void>; isRefreshing: boolean } {
  const queryClient = useQueryClient()
  const isFetching = useIsFetching({
    predicate: (query) => {
      const root = query.queryKey[0]
      return root === worktreeKeys.all[0] || root === stashKeys.all[0]
    }
  })
  const refresh = useCallback(() => queryClient.refetchQueries({
    type: 'active',
    predicate: (query) => {
      const root = query.queryKey[0]
      return root === worktreeKeys.all[0] || root === stashKeys.all[0]
    }
  }), [queryClient])

  return { refresh, isRefreshing: isFetching > 0 }
}

function reconcileDeletedWorktrees(queryClient: QueryClient, paths: Iterable<string>): void {
  const deletedPaths = paths instanceof Set ? paths : new Set(paths)
  if (deletedPaths.size === 0) return

  queryClient.setQueriesData<ScanResult>(
    { queryKey: worktreeKeys.all },
    (current) => current ? removeWorktreesFromScanResult(current, deletedPaths) : current
  )
}

function reconcileStashCount(queryClient: QueryClient, repoPath: string, delta: number): void {
  if (delta === 0) return

  queryClient.setQueriesData<ScanResult>(
    { queryKey: worktreeKeys.all },
    (current) => current ? applyStashCountDelta(current, repoPath, delta) : current
  )
}

function reconcileWorktreeLock(queryClient: QueryClient, path: string, locked: boolean): void {
  queryClient.setQueriesData<ScanResult>(
    { queryKey: worktreeKeys.all },
    (current) => current ? setWorktreeLockState(current, path, locked) : current
  )
}

function invalidateWorktreesInBackground(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: worktreeKeys.all, refetchType: 'active' })
}

function invalidateStashesInBackground(queryClient: QueryClient, repoPath: string): void {
  void queryClient.invalidateQueries({ queryKey: stashKeys.repo(repoPath), refetchType: 'active' })
}

export function useWorktrees(scanRoots: string[], staleThresholdDays = 30) {
  const queryClient = useQueryClient()
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [isHydratingDiskUsage, setIsHydratingDiskUsage] = useState(false)
  const activeRequestId = useRef<string | null>(null)
  const inFlightDiskPaths = useRef<Set<string>>(new Set())
  const mounted = useRef(true)
  const queryKey = useMemo(
    () => worktreeKeys.scan(scanRoots, staleThresholdDays),
    [scanRoots, staleThresholdDays]
  )

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    return window.api.onScanProgress((progress) => {
      if (progress.requestId === activeRequestId.current) setScanProgress(progress)
    })
  }, [])

  const query = useQuery<ScanResult>({
    queryKey,
    queryFn: () => {
      const requestId = crypto.randomUUID()
      activeRequestId.current = requestId
      setScanProgress(null)
      return window.api.scanWorktrees(scanRoots, staleThresholdDays, requestId)
    },
    enabled: scanRoots.length > 0,
    networkMode: 'always',
    retry: false,
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false
  })

  useEffect(() => {
    if (!query.isFetching) setScanProgress(null)
  }, [query.isFetching])

  useEffect(() => {
    if (!query.data) {
      if (mounted.current) setIsHydratingDiskUsage(inFlightDiskPaths.current.size > 0)
      return
    }

    const paths = getUnhydratedDiskUsagePaths(query.data, inFlightDiskPaths.current)
    if (paths.length === 0) {
      if (mounted.current) setIsHydratingDiskUsage(inFlightDiskPaths.current.size > 0)
      return
    }

    paths.forEach((path) => inFlightDiskPaths.current.add(path))
    setIsHydratingDiskUsage(true)
    void window.api.getDiskUsage(paths)
      .then((sizesByPath) => {
        queryClient.setQueriesData<ScanResult>({ queryKey: worktreeKeys.all }, (current) =>
          current ? hydrateWorktreeDiskUsage(current, sizesByPath) : current
        )
      })
      .catch(() => {
        // Core repository data remains usable when optional disk hydration fails.
      })
      .finally(() => {
        paths.forEach((path) => inFlightDiskPaths.current.delete(path))
        if (mounted.current) setIsHydratingDiskUsage(inFlightDiskPaths.current.size > 0)
      })
  }, [query.data, queryClient])

  return {
    ...query,
    isScanning: query.isFetching,
    isHydratingDiskUsage,
    scanProgress
  }
}

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: ['settings'],
    queryFn: () => window.api.getSettings(),
    networkMode: 'always',
    staleTime: Infinity,
    refetchOnWindowFocus: false
  })
}

export function useSaveSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    networkMode: 'always',
    scope: { id: 'settings-save' },
    mutationFn: async (settings: AppSettings) => {
      await window.api.saveSettings(settings)
      return settings
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(['settings'], settings)
    }
  })
}

interface DeleteWorktreeContext {
  snapshots: Array<[QueryKey, ScanResult | undefined]>
}

export class DeleteWorktreeError extends Error {
  readonly path: string

  constructor(path: string, message?: string) {
    super(message || `Failed to delete worktree at ${path}`)
    this.name = 'DeleteWorktreeError'
    this.path = path
  }
}

export function useDeleteWorktree() {
  const queryClient = useQueryClient()

  return useMutation<DeleteWorktreeResult, Error, DeleteWorktreeInput, DeleteWorktreeContext>({
    networkMode: 'always',
    scope: { id: 'worktree-delete' },
    mutationFn: async ({ path, repoPath, force }) => {
      const result = await window.api.deleteWorktree(path, repoPath, force)
      if (!result.success) throw new DeleteWorktreeError(path, result.error)
      return { path, repoPath, success: true }
    },
    onMutate: async ({ path }) => {
      await queryClient.cancelQueries({ queryKey: worktreeKeys.all })
      const snapshots = queryClient.getQueriesData<ScanResult>({ queryKey: worktreeKeys.all })
      reconcileDeletedWorktrees(queryClient, [path])
      return { snapshots }
    },
    onError: (_error, _variables, context) => {
      for (const [queryKey, snapshot] of context?.snapshots ?? []) {
        if (snapshot) queryClient.setQueryData(queryKey, snapshot)
      }
    },
    onSettled: () => {
      invalidateWorktreesInBackground(queryClient)
    }
  })
}

function deletionKey(item: Pick<DeleteWorktreeInput, 'path' | 'repoPath'>): string {
  return `${item.repoPath}\u0000${item.path}`
}

function normalizeDeleteResults(
  request: DeleteWorktreesRequest,
  responseResults: DeleteWorktreeResult[]
): DeleteWorktreesOutcome {
  const resultsByItem = new Map<string, DeleteWorktreeResult[]>()
  for (const result of responseResults) {
    const key = deletionKey(result)
    const results = resultsByItem.get(key) ?? []
    results.push(result)
    resultsByItem.set(key, results)
  }

  const results = request.items.map((item) => {
    const matchingResults = resultsByItem.get(deletionKey(item))
    const result = matchingResults?.shift()
    return result ?? {
      path: item.path,
      repoPath: item.repoPath,
      success: false,
      error: 'The delete operation did not return a result for this worktree.'
    }
  })
  const successful = results.filter((result) => result.success)
  const failures = results.filter((result) => !result.success)

  return { results, successful, failures }
}

export function useDeleteWorktrees() {
  const queryClient = useQueryClient()

  return useMutation<DeleteWorktreesOutcome, Error, DeleteWorktreesRequest>({
    networkMode: 'always',
    scope: { id: 'worktree-delete' },
    mutationFn: async (request) => {
      if (request.items.length === 0) {
        return { results: [], successful: [], failures: [] }
      }
      const response = await window.api.deleteWorktrees(request)
      return normalizeDeleteResults(request, response.results)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: worktreeKeys.all })
    },
    onSuccess: (outcome) => {
      reconcileDeletedWorktrees(
        queryClient,
        outcome.successful.map((result) => result.path)
      )
    },
    onSettled: () => {
      invalidateWorktreesInBackground(queryClient)
    }
  })
}

export function usePruneWorktrees() {
  const queryClient = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: (repoPath: string) => window.api.pruneWorktrees(repoPath),
    onSuccess: () => {
      invalidateWorktreesInBackground(queryClient)
    }
  })
}

export function useLockWorktree() {
  const queryClient = useQueryClient()
  return useMutation({
    networkMode: 'always',
    scope: { id: 'worktree-lock' },
    mutationFn: ({ path, repoPath }: { path: string; repoPath: string }) =>
      window.api.lockWorktree(path, repoPath),
    onSuccess: (_result, { path }) => {
      reconcileWorktreeLock(queryClient, path, true)
      invalidateWorktreesInBackground(queryClient)
    }
  })
}

export function useUnlockWorktree() {
  const queryClient = useQueryClient()
  return useMutation({
    networkMode: 'always',
    scope: { id: 'worktree-lock' },
    mutationFn: ({ path, repoPath }: { path: string; repoPath: string }) =>
      window.api.unlockWorktree(path, repoPath),
    onSuccess: (_result, { path }) => {
      reconcileWorktreeLock(queryClient, path, false)
      invalidateWorktreesInBackground(queryClient)
    }
  })
}

export function useStashes(repoPath: string | null) {
  return useQuery<StashEntry[]>({
    queryKey: stashKeys.repo(repoPath),
    queryFn: () => repoPath ? window.api.listStashes(repoPath) : Promise.resolve([]),
    enabled: repoPath !== null,
    networkMode: 'always',
    retry: false,
    staleTime: 10_000,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false
  })
}

export interface DropStashVariables {
  repoPath: string
  oid: string
}

export interface DropStashResult extends DropStashVariables {
  droppedCount: 1
}

export function useDropStash() {
  const queryClient = useQueryClient()
  return useMutation<DropStashResult, Error, DropStashVariables>({
    networkMode: 'always',
    scope: { id: 'stash-drop' },
    mutationFn: async (variables) => {
      await window.api.dropStash(variables.repoPath, variables.oid)
      return { ...variables, droppedCount: 1 }
    },
    onSuccess: ({ repoPath, oid, droppedCount }) => {
      queryClient.setQueryData<StashEntry[]>(stashKeys.repo(repoPath), (current) =>
        current ? removeStashesByOid(current, [oid]) : current
      )
      reconcileStashCount(queryClient, repoPath, -droppedCount)
    },
    onSettled: (_data, _error, variables) => {
      invalidateStashesInBackground(queryClient, variables.repoPath)
    }
  })
}

export interface DropStashesBeforeVariables {
  repoPath: string
  beforeDate: string
}

export interface DropStashesBeforeResult extends DropStashesBeforeVariables {
  results: StashDropResult[]
  successful: StashDropResult[]
  failures: StashDropResult[]
  droppedCount: number
}

export function useDropStashesBefore() {
  const queryClient = useQueryClient()
  return useMutation<DropStashesBeforeResult, Error, DropStashesBeforeVariables>({
    networkMode: 'always',
    scope: { id: 'stash-drop' },
    mutationFn: async (variables) => {
      const response = await window.api.dropStashesBefore(
        variables.repoPath,
        variables.beforeDate
      )
      const successful = response.results.filter((result) => result.success)
      const failures = response.results.filter((result) => !result.success)
      return {
        ...variables,
        results: response.results,
        successful,
        failures,
        droppedCount: successful.length
      }
    },
    onSuccess: ({ repoPath, successful, droppedCount }) => {
      if (droppedCount === 0) return
      queryClient.setQueryData<StashEntry[]>(stashKeys.repo(repoPath), (current) =>
        current ? removeStashesByOid(current, successful.map((result) => result.oid)) : current
      )
      reconcileStashCount(queryClient, repoPath, -droppedCount)
    },
    onSettled: (_data, _error, variables) => {
      invalidateStashesInBackground(queryClient, variables.repoPath)
    }
  })
}
