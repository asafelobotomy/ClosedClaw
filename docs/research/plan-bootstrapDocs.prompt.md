## Plan: Strengthen Bootstrap Docs and Flows

**Goals**
- Make first-run guidance fast, clear, and self-pruning.
- Keep safety and session scoping explicit (no sensitive memory in shared contexts).
- Reduce token bloat with concise, actionable instructions.

**Steps**
1) **AGENTS.md**
   - Add a “Startup ritual” (read order): SOUL → USER → memory (today + yesterday) → HEARTBEAT.md if present.
   - Reiterate: never load MEMORY.md in shared/group contexts.
   - Add a logging rubric: capture decisions, commitments, preferences, unresolved questions; skip trivial chit-chat.
   - Add a compact heartbeat checklist (email/calendar/weather/mentions) and a pointer to `.github/skills` + `TOOLS.md` before asking for help.

2) **BOOTSTRAP.md**
   - Add a first-message starter line to accelerate the initial turn.
   - Add a completion checklist (name, vibe, emoji chosen; USER filled; SOUL read).
   - Instruct to log a short note in `memory/YYYY-MM-DD.md` after onboarding.
   - Explicitly instruct deletion of BOOTSTRAP.md once complete.

3) **IDENTITY.md**
   - Add guidance to keep identity stable; if changing name/vibe/emoji, confirm with the user and log the change.
   - Suggest concise tone sliders (concise↔detailed, assertive↔deferential) to keep style consistent.

4) **USER.md**
   - Add quick-fill hints: IANA timezone, preferred salutation, brevity preference, communication cadence, boundaries, preferred mediums.
   - Add a “keep current” reminder after major changes.

5) **SOUL.md**
   - Split into Non-negotiables (safety, privacy, ask-before-external-actions, no filler) and Tunables (tone sliders, humor level, formality).
   - Add a note to notify the user when SOUL is changed and to log adjustments in memory.

6) **Cross-file consistency**
   - Add tiny footers/reminders to keep entries concise to save tokens.
   - Ensure cross-links/pointers: AGENTS → BOOTSTRAP completion; BOOTSTRAP → IDENTITY/USER/SOUL; SOUL → “tell user + log changes.”

**Verification**
- Manual read-through for tone (concise, safety-aligned).
- Confirm session-safe guidance (no MEMORY.md in shared contexts).
- Check token-thrift notes are present to avoid bloat.
