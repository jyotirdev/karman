---
name: release
description: Prepare a Kármán release by bumping the version, updating the changelog and creating the tag.
disable-model-invocation: true
argument-hint: "[version, for example 1.1.0]"
---

Prepare release $ARGUMENTS.

1. Run `/verify`. Stop if anything fails.
2. Set `"version"` in `package.json` to the new version.
3. Add a section at the top of `CHANGELOG.md`: `## X.Y.Z (YYYY-MM-DD)`, then what a visitor will notice, in plain words, grouped as in earlier entries.
4. Rebuild so `index.html` is current.
5. Show the diff and the proposed commands, then wait for approval:
   ```bash
   git add -A
   git commit -m "chore(release): X.Y.Z"
   git tag -a vX.Y.Z -m "Kármán X.Y.Z"
   ```
6. Do not push. Tell the user to run `git push && git push origin vX.Y.Z`, and that the release notes are the new changelog section.
