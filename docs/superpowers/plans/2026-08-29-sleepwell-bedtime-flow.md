# SleepWell Bedtime Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a reliable 1-3 minute bedtime breathing flow with optional body scan, local outcome trends, sleep sound timers, and privacy controls.

**Architecture:** Keep pages as WeChat view controllers while moving deterministic breathing and timer calculations into pure CommonJS modules. Persist backward-compatible settings and sessions through the existing storage service; keep ambient and completion audio contexts independent.

**Tech Stack:** Native WeChat Mini Program, CommonJS JavaScript, WXML/WXSS, Node built-in test runner, local WAV assets.

## Global Constraints

- No npm packages, cloud services, accounts, notifications, analytics, or network calls.
- Existing sessions remain readable and local data is never migrated destructively.
- The default session is six soothe-rhythm breaths; presses shorter than 300ms do not count.
- Personal content stays on-device and health copy must not claim diagnosis or treatment.
- Existing breathing-world artwork is not redesigned.

---

### Task 1: Pure Breathing State Machine

**Files:**
- Create: `utils/breath-machine.js`
- Create: `tests/breath-machine.test.js`

**Interfaces:**
- Produces: `createInitialState(config)` and `transition(state, event)`.
- Event types: `PRESS_START`, `PRESS_END`, `EXHALE_DUE`, `INTERRUPT`, `SET_TARGET`, `RESTART`.
- Effects: `scheduleExhale`, `cancelExhale`, `persist`, `complete`.

- [ ] Write tests for short presses, complete cycles, deadline calibration, interruption, free mode, target completion, target changes, and restart.
- [ ] Run `node --test tests/breath-machine.test.js` and confirm the missing module failure.
- [ ] Implement the reducer with immutable state and timestamp-based elapsed duration.
- [ ] Run the state-machine tests and confirm all cases pass.

### Task 2: Storage And Seven-Day Trends

**Files:**
- Modify: `services/storage.js`
- Create: `tests/storage-helpers.test.js`

**Interfaces:**
- Produces: `updateSessionOutcome(id, outcome)`, `getSevenDaySummary(now)`, `clearPersonalRecords()`, and `resetSettings()`.
- Session outcomes are `relieved`, `same`, `tense`, or `null`.

- [ ] Write pure-helper tests for old sessions, local-day boundaries, outcome counts, record clearing, and default setting restoration.
- [ ] Implement exported pure summary helpers plus guarded WeChat-storage adapters.
- [ ] Run the storage tests and syntax checks.

### Task 3: Main Breathing Flow

**Files:**
- Modify: `pages/breathe/index.js`
- Modify: `pages/breathe/index.wxml`
- Modify: `pages/breathe/index.wxss`
- Modify: `utils/constants.js`

**Interfaces:**
- Consumes: breath-machine transitions and storage session APIs.
- Produces: outcome selection, tense follow-up actions, target-aware progress, and one-time inline onboarding.

- [ ] Replace page-local cycle timing with reducer dispatch and effect handling.
- [ ] Persist only complete cycles with `targetCycles`, `durationMs`, `completed`, and `outcome`.
- [ ] Add accessible completion and tense-choice layers without changing world artwork.
- [ ] Verify interruption, body navigation, restart, and free-breath body prompts in developer tools.

### Task 4: Audio Timer And Completion Cue

**Files:**
- Modify: `app.js`
- Modify: `pages/sound/index.js`
- Modify: `pages/sound/index.wxml`
- Modify: `pages/sound/index.wxss`
- Modify: `tools/generate-sounds.ps1`
- Create: `utils/sound-timer.js`
- Create: `tests/sound-timer.test.js`
- Create: `assets/audio/complete.wav`

**Interfaces:**
- App methods: `playCompletionCue()`, `setSoundTimer(minutes)`, `syncSoundTimer(now)`, and existing ambient controls.
- Timer choices: 15, 30, and 60 minutes; default 30.

- [ ] Test deadline and remaining-time calculations using injected timestamps.
- [ ] Add persisted sound selection, volume, enabled state, and timer duration.
- [ ] Implement deadline restoration and stepped fade-out without blocking the UI.
- [ ] Generate the short completion WAV and verify ambient audio remains independent.

### Task 5: Records, Privacy, And Secondary Features

**Files:**
- Modify: `pages/breathe/index.*`
- Modify: `pages/settings/index.*`
- Modify: `pages/body/part.js`

**Interfaces:**
- Consumes: seven-day summary and storage clearing methods.
- Produces: low-pressure trend display, separate clear/reset confirmations, and accurate three-cycle body sessions.

- [ ] Add seven-day usage, completion, and outcome distribution to the records sheet without streaks.
- [ ] Add separate confirmed actions for personal-record deletion and preference reset.
- [ ] Add local-only and non-medical boundary copy to settings.
- [ ] Align body-part cycle counting with complete exhalations and interruption cleanup.

### Task 6: Documentation And Release Verification

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/specs/2026-08-29-sleepwell-bedtime-flow-design.md`

- [ ] Document product boundaries, state behavior, local keys, tests, clearing behavior, and the iOS/Android device matrix.
- [ ] Run `node --test tests/*.test.js`, `node --check` for every JavaScript file, JSON parsing, and SVG XML parsing.
- [ ] Confirm no API keys, network endpoints, analytics, or WXSS-invalid selectors are present.
- [ ] Record remaining real-device-only checks for touch, haptics, audio background behavior, safe areas, and mini-program exit.
