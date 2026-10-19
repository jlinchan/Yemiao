# SleepWell 4-7-8 And Body Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current two-phase breathing interaction with a shared 4-second inhale, 7-second hold, 8-second exhale flow and rebuild body scanning around a calm bitmap silhouette and device-safe navigation.

**Architecture:** Extend the pure breath reducer with a `hold` phase and absolute phase deadlines. Keep page controllers responsible for countdown display, haptics, and timers; both the home and body-part pages consume the same state transitions. Replace CSS-composed bodies with one transparent bitmap asset plus percentage-based invisible hotspots and a synchronized bottom selector.

**Tech Stack:** Native WeChat Mini Program, CommonJS JavaScript, WXML/WXSS, Node built-in tests, generated transparent PNG/WebP asset.

## Global Constraints

- Use 4 seconds inhale, 7 seconds hold, and 8 seconds exhale on both breathing surfaces.
- A release during inhale or hold starts exhale immediately; a press during exhale abandons that cycle and starts a new inhale.
- Only a complete 8-second exhale increments cycles; presses shorter than 300ms remain accidental taps.
- The home uses a close icon; body selection and body-part breathing use back arrows.
- Navigation is positioned from the actual status-bar and menu-button geometry.
- Body scanning must not show the breathing-world subject, CSS stick figure, or scattered labels.
- Do not add medical claims, external dependencies, network requests, or analytics.

---

### Task 1: 4-7-8 State Machine

**Files:**
- Modify: `utils/breath-machine.js`
- Modify: `tests/breath-machine.test.js`

**Interfaces:**
- Adds phase `PHASES.HOLD`.
- Adds events `INHALE_DUE` and `HOLD_DUE`; `PRESS_START` during exhale restarts the cycle.
- Effects remain timestamp-based and add `scheduleInhale`, `scheduleHold`, `phaseHaptic`, and `cancelPhaseTimers`.

- [ ] Add failing tests for automatic inhale-to-hold, hold completion awaiting release, early release, exhale interruption, complete-exhale counting, and interrupt cleanup.
- [ ] Run `node --test tests/breath-machine.test.js` and confirm failures reflect the old two-phase reducer.
- [ ] Implement immutable phase deadlines and elapsed-duration accounting.
- [ ] Run the state-machine test file and confirm all cases pass.

### Task 2: Shared Page Timing And Copy

**Files:**
- Create: `utils/breath-view.js`
- Create: `tests/breath-view.test.js`
- Modify: `pages/breathe/index.js`
- Modify: `pages/body/part.js`

**Interfaces:**
- `getBreathView(state, now)` returns `{ countdown, phaseLabel, prompt, subPrompt, progress }`.
- Page timer wakeups dispatch reducer deadline events and refresh countdowns without incrementing cycles directly.

- [ ] Test exact countdown labels and prompts for inhale, hold-ready, and exhale.
- [ ] Wire both pages to shared 4-7-8 settings, countdown refresh, phase haptics, and exhale interruption.
- [ ] Save only fully exhaled cycles and cancel incomplete work on navigation/backgrounding.
- [ ] Run all Node tests and JavaScript syntax checks.

### Task 3: Settings Migration And Device-Safe Navigation

**Files:**
- Modify: `utils/constants.js`
- Modify: `services/storage.js`
- Create: `utils/layout.js`
- Modify: `app.js`
- Modify: `app.wxss`
- Modify: `pages/breathe/index.wxml`
- Modify: `pages/body/index.wxml`
- Modify: `pages/body/part.wxml`

**Interfaces:**
- Settings add `holdSeconds: 7` and migration version `breathPatternVersion: 2`.
- `getNavigationMetrics()` returns status-bar, menu-button, navigation height, and inline style values.

- [ ] Migrate only the old untouched soothe default to 4-7-8 while preserving explicit alternative rhythms.
- [ ] Expose navigation metrics globally and bind them to all three page top bars.
- [ ] Save completed work before home close or body back navigation.
- [ ] Verify navigation controls remain below status bars on compact and notched simulator profiles.

### Task 4: Body Silhouette Asset And Selection UI

**Files:**
- Create: `assets/body-silhouette.png`
- Modify: `utils/constants.js`
- Modify: `pages/body/index.wxml`
- Modify: `pages/body/index.wxss`
- Modify: `pages/body/index.js`
- Modify: `pages/body/part.wxml`
- Modify: `pages/body/part.wxss`

**Interfaces:**
- Body parts retain percentage coordinates and add compact selector labels.
- Selecting via silhouette or horizontal selector updates the same `selectedPart` state.

- [ ] Generate a transparent, neutral front-facing standing silhouette with arms slightly separated and no anatomical details.
- [ ] Replace CSS body construction and scattered labels with the bitmap, invisible hotspots, one selected label, and a local glow.
- [ ] Add a horizontal bottom selector and a disabled “把呼吸带到这里” action until selection.
- [ ] Keep random selection visible without auto-navigation and remove world-subject rendering from body selection.
- [ ] Check mobile viewport screenshots for status-bar overlap, clipping, and action visibility.

### Task 5: Final Visual Polish And Verification

**Files:**
- Modify: `pages/breathe/index.wxss`
- Modify: `pages/body/index.wxss`
- Modify: `pages/body/part.wxss`
- Modify: `README.md`

- [ ] Apply near-black blue-green surfaces, warm-white type, gray-green silhouette, and restrained cyan-green highlights.
- [ ] Limit phase animation scale changes to 8-12% and keep all interactive controls at least 44px equivalent.
- [ ] Run all tests, JavaScript syntax checks, JSON/SVG parsing, and the official WeChat DevTools CLI open/compile path.
- [ ] Document 4-7-8 behavior, navigation semantics, migration, and remaining physical-device checks.
