# Worktree Manager

A native macOS desktop app for managing the Git worktrees that pile up from tools like Claude Code and Cursor. Built with Electron, React, and Tailwind CSS.

If you use AI coding tools, you've probably ended up with dozens of orphaned worktrees with cryptic names like `adoring-volhard` scattered across your filesystem. Worktree Manager gives you a single pane of glass to see what they all are, whether they're safe to delete, and clean them up in bulk.

## Getting Started

### Prerequisites

- **Node.js** 18+ and **npm**
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

The `.dmg` and `.zip` will be in the `release/` directory.

### Package with Code Signing + Notarization

For a clean install experience with no Gatekeeper warnings, you need an [Apple Developer account](https://developer.apple.com/) ($99/year).

**One-time setup:**

1. Create a "Developer ID Application" certificate in the Apple Developer portal and install it in your Keychain
2. Set environment variables (add to your shell profile or a `.env` file):

```bash
export APPLE_TEAM_ID="YOUR_10_CHAR_TEAM_ID"     # From developer.apple.com → Membership
export APPLE_ID="your@email.com"                  # Your Apple ID
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # Generate at appleid.apple.com → Sign-In and Security → App-Specific Passwords
```

3. Build:

```bash
npm run dist
```

This will code-sign the app with your Developer ID certificate, submit it to Apple's notarization service, staple the notarization ticket, and produce a `.dmg` ready for distribution.

### Configuration

On first launch, the app scans `~/source` by default. To change scan directories, click the settings gear (or edit `~/.config/worktree-manager/settings.json` directly).

## Features

### Worktree Discovery

Automatically finds worktrees from three sources:
- **Git worktrees** — `git worktree list` in every repo under your scan directories
- **Claude Code worktrees** — `~/.claude/worktrees/<repo>/` and `<repo>/.claude/worktrees/`
- **Cursor worktrees** — `~/.cursor/worktrees/<repo>/`

Cross-references all three to detect orphaned directories that git no longer tracks.

### Work Summary

Each worktree shows a one-line summary of what it contains, generated from the commit messages unique to that branch (e.g. *"Fix auth flow &middot; Add tests &middot; Refactor middleware"*). No more guessing what `adoring-volhard` was for.

### Safety Score (Traffic Light)

A green, yellow, or red dot next to every worktree tells you at a glance whether it's safe to delete:

| Color | Meaning | Criteria |
|-------|---------|----------|
| Green | Safe to delete | Merged + clean, or clean + pushed to remote |
| Yellow | Use caution | Merged but has uncommitted changes, or pushed but dirty |
| Red | Not safe | Uncommitted changes + local-only branch, or unpushed unmerged work |

Hover over the dot to see the specific reasons (e.g. "merged into main, clean working tree, pushed to remote").

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

Overview stats at a glance:
- Total worktrees, disk usage, stale count, prunable count
- Safe-to-delete count and total stashes across all repos
- Disk usage breakdown bar chart by repository
- Repo ranking by worktree count

### Bulk Operations

- Select multiple worktrees and delete them in one action
- Filter by "Safe to Delete" to see only green-light worktrees
- Force delete option for worktrees with uncommitted changes
- Lock/unlock worktrees to prevent accidental pruning

### Views & Filtering

- **Card view** and **table view** with all columns (source, branch, summary, repo, PR, safety, ahead/behind, status, modified, size)
- Filter by source (Git / Claude / Cursor), status (active, stale, locked, prunable, orphan, detached, safe to delete)
- Search across branch names, repo names, and paths
- Sort by name, branch, last modified, disk size, or source
- Toggle main worktree visibility
- Dark and light themes

### Quick Actions

Right-click context menu on any worktree:
- Open in Finder
- Open in Terminal
- Open in VS Code
- Open in Cursor
- Lock / Unlock
- Delete (with force option)

## Tech Stack

- **Electron** 35 — native desktop shell
- **React** 19 — UI framework
- **Vite** 7 + electron-vite — build tooling with hot reload
- **Tailwind CSS** 3 — styling with semantic design tokens for dark/light themes
- **Zustand** — client state management
- **React Query** — server state (IPC data fetching)
- **Framer Motion** — animations and transitions
- **Lucide React** — icons

All git operations use `child_process.execFile` (not `exec`) to avoid shell injection. No data leaves your machine — everything runs locally via git commands.

## License

ISC
