# Worktree Manager

A native macOS desktop app for managing the Git worktrees that pile up from tools like Claude Code and Cursor. Built with Electron, React, and Tailwind CSS.

If you use AI coding tools, you've probably ended up with dozens of orphaned worktrees with cryptic names like `adoring-volhard` scattered across your filesystem. Worktree Manager gives you a single pane of glass to see what they all are, whether they're safe to delete, and clean them up in bulk.

## Getting Started

### Prerequisites

- **Node.js** 22.23.2 LTS and **npm** (`.nvmrc` and `.node-version` pin the patched build runtime)
- **Git** (used under the hood for all worktree operations)
- **macOS** (Electron is configured for macOS — Linux/Windows may work but are untested)
- **GitHub CLI** (`gh`) — optional, enables PR detection per worktree

### Install & Run

```bash
git clone https://github.com/Arjun2908/worktree-manager.git
cd worktree-manager
npm install
npm run dev
```

This starts the Electron app in development mode with hot reload.

### Build for Production

```bash
npm run build
npm run start
```

### Package as `.dmg` (unsigned)

Creates a distributable `.dmg` without code signing — recipients will need to right-click and "Open" on first launch to bypass Gatekeeper.

```bash
npm run dist:unsigned
```

The `.dmg` and `.zip` will be in the `release/` directory. Unsigned builds are for local testing only and are never published by CI.

### Verified Releases and Automatic Updates

Production releases use an automated GitHub Actions pipeline. It refuses missing credentials, signs and notarizes both the universal app and final DMG, staples Apple tickets, exercises Gatekeeper, launches the packaged app from both the DMG and updater ZIP, verifies updater metadata, generates checksums and provenance, and only then publishes the draft release. Installed production builds expose update checks, downloads, and restart-to-install status in the sidebar.

> **Distribution note:** the existing `v1.0.0` release predates this verification pipeline, is not notarized, and has no updater. Do not redistribute it as a trusted build. Existing users must manually install the first release produced by the new `Release` workflow once; automatic updates begin from that release onward.

See [docs/releasing.md](docs/releasing.md) for repository setup, required secrets, semantic versioning, verification evidence, release repair, and rollback.

### Configuration

On first launch, the app scans `~/source` by default. To change scan directories, click **Settings** in the sidebar and add/remove directories. Settings are stored at `~/.config/worktree-manager/settings.json`.

## Features

### Worktree Discovery

Automatically finds worktrees from three sources:
- **Git worktrees** — `git worktree list` in every repo under your scan directories
- **Claude Code worktrees** — `~/.claude/worktrees/<repo>/` and `<repo>/.claude/worktrees/`
- **Cursor worktrees** — `~/.cursor/worktrees/<repo>/`

Cross-references all three to detect orphaned directories that git no longer tracks.

### Work Summary

Each worktree shows a one-line summary of what it contains, generated from the commit messages unique to that branch (e.g. *"Fix auth flow &middot; Add tests &middot; Refactor middleware"*). No more guessing what `adoring-volhard` was for.

### Safety Status

Every worktree is labeled **Safe**, **Review**, or **Unsafe** so cleanup decisions do not rely on color alone:

| Status | Meaning | Criteria |
|--------|---------|----------|
| Safe | Recoverable | Merged + clean, or clean with the complete branch tip pushed to its upstream |
| Review | Check local state | Detached HEAD, or recoverable commits with uncommitted changes |
| Unsafe | Local work could be lost | Unpushed commits, local-only work, or unregistered non-empty directories |

Hover or focus the status to see the exact reasons (for example, "merged into main, clean working tree, pushed to origin/main").

### Branch Divergence

Shows how many commits each branch is ahead/behind the default branch with a compact `↑3 ↓12` indicator. Quickly spot branches that have drifted far from main or have already been merged.

### PR Integration

If you have the GitHub CLI (`gh`) installed and authenticated, the app automatically detects which worktree branches have associated pull requests. PR badges are color-coded by state (open/merged/closed) and link directly to GitHub.

### Stash Dashboard

Surfaces the hidden stashes accumulating in your repos:
- Browse stashes grouped by time period (This week / This month / Older)
- See which branch each stash was created on
- Drop individual stashes with confirmation
- Bulk drop presets: older than 30, 60, 90, or 180 days
- Stash counts shown in the sidebar next to each repo

### Dashboard

A cleanup-first overview shows:

- Linked worktrees and their total disk use
- Safety-verified reclaimable space
- Worktrees that still need review
- Saved stashes and per-repository cleanup totals

### Bulk Operations

- Select multiple worktrees and remove them in one batch
- Successful removals update every cached count and disk total immediately
- Partial failures remain selected and are reported individually
- Filter by "Safe to remove" or "Needs review"
- Force delete option for worktrees with uncommitted changes
- Lock/unlock worktrees to prevent accidental pruning

### Views & Filtering

- A cleanup-first safety board is the default, grouping worktrees into safe, review, and local-risk lanes with a persistent inspector
- A dense comparison list remains available for source, branch, summary, repo, PR, safety, ahead/behind, status, modified time, and size
- Filter by source (Git / Claude / Cursor), status (active, stale, locked, prunable, orphan, detached, safe to remove, needs review)
- Search across branch names, repo names, and paths
- Sort by name, branch, last modified, disk size, or source
- Toggle main worktree visibility
- System, dark, and light appearances

### Scan Performance

- Repositories and linked worktrees are deduplicated by their canonical Git common directory
- Core repository and safety data renders first; slower disk totals hydrate in the background without blocking the board
- Git enrichment and disk measurement use bounded concurrency, including bounded per-path fallback after a slow batch
- Disk sizes are cached for five minutes, making repeat and post-cleanup scans substantially faster
- Identical in-flight scans are coalesced instead of running duplicate work

### Quick Actions

Use the action menu on any worktree to:

- Open in Finder
- Open in Terminal
- Open in VS Code
- Open in Cursor
- Lock / Unlock
- Delete (with force option)

## Tech Stack

- **Electron** 43 — native desktop shell
- **React** 19 — UI framework
- **Vite** 7 + electron-vite — build tooling with hot reload
- **Tailwind CSS** 3 — styling with semantic design tokens for dark/light themes
- **Zustand** — client state management
- **React Query** — server state (IPC data fetching)
- **Lucide React** — icons

All git operations use `child_process.execFile` (not `exec`) to avoid shell injection. Repository contents and worktree data stay local. Update checks and optional pull-request enrichment contact GitHub for public release and PR metadata.

## License

[ISC](LICENSE). Commercial use, modification, and redistribution are permitted under its terms.
