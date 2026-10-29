# VS Code Fork Compatibility

VS Code and VSCodium are the target containers for Varro.

Other VS Code forks are technically compatible when they preserve the VS Code extension APIs and user-interface behavior that Varro relies on. Compatibility with forks is limited and may change as those products evolve.

## Cursor, Windsurf, Devin, and Trae

Cursor, Windsurf, Devin, Trae, and Trae CN have limited support. These AI-focused forks may reserve chat surfaces for their own agents or hide third-party chat-agent extensions. On a new installation, Varro attempts a one-time move to their Primary Side Bar. Existing working placements are preserved. If the saved view cannot be revealed, Varro's navigation commands attempt to recover it in the Primary Side Bar, even after an earlier migration. Full integration is not guaranteed.

VS Code and VSCodium register Varro directly in the Secondary Side Bar. Opening or focusing Varro follows its saved location rather than moving it back to the default.

If the host does not expose the required view-moving command or the migration fails:

1. Open the Command Palette with `Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Windows and Linux, enter `Varro: New Session`, and press `Enter`.
2. Once Varro is visible, move it to the Primary Side Bar so it remains accessible.
