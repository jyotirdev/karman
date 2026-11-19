@AGENTS.md

## Claude Code

- Path-scoped rules for feeds, interface text, rendering and generated files are in `.claude/rules/`.
- `/add-layer` walks through adding a data layer or source.
- `/verify` builds and runs the checks; use it before saying work is finished.
- `/release` prepares a version bump, changelog entry and tag. It never pushes.
