# Worktree Manager app icon

The production icon is generated artwork rather than the former hand-authored SVG. The final
transparent source is committed at `build/icon.png`; Electron Builder derives the platform icon
formats from that file.

## Art direction

- One graphite macOS tile with a single ivory-to-mint worktree silhouette.
- The trunk and three connected panes represent one repository with multiple working trees.
- The silhouette must remain identifiable at 16 px, without status dots, text, or Git-brand marks.
- The icon uses generous canvas padding so macOS can apply its own presentation consistently.

## Generation prompt

Generated with the built-in ImageGen workflow as a 1024 px macOS application icon. The prompt
requested a deep graphite rounded-square tile, a bold connected trunk with three offset workspace
panes, warm ivory and restrained mint materials, and a flat `#ff00ff` chroma-key background. It
explicitly excluded text, letters, checkmarks, terminal symbols, GitHub branding, tiny nodes,
multiple concepts, and shadows outside the tile.

The generated source is `design/app-icon-chroma.png`. Chroma removal used the bundled ImageGen
`remove_chroma_key.py` helper with border sampling, a soft matte, and despill. The final image was
resampled to 1024 px and checked at 128 px, 32 px, and 16 px using the previews in this directory.
