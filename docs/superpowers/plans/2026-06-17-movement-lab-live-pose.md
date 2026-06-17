# Movement Lab Live Pose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Movement Lab's deterministic analyzer path with a native-only, on-device pose landmark pipeline that produces real `MovementSession` data from VisionCamera frames on physical devices.

**Architecture:** Keep the existing analytics and results UI boundary as `MovementSession`. Add a small adapter that converts native pose landmarks into `FootLandmarkFrame`, a live session builder that turns collected frames into events/samples, and a native-only camera bridge that feeds frames through the Nitro pose package while retaining an explicit demo fallback for unsupported devices.

**Tech Stack:** Expo SDK 54, React Native 0.81.5, VisionCamera 5, react-native-vision-camera-worklets 5, react-native-worklets 0.8.1, react-native-nitro-modules, `react-native-nitro-pose-exercises`, `react-native-vision-camera-resizer`, node:test, TypeScript.

---

### File Structure

- Modify: `mobile/package.json` and `mobile/package-lock.json`
  - Add `react-native-nitro-pose-exercises@1.1.18` and `react-native-vision-camera-resizer@5.0.11`.
- Modify: `mobile/lib/movement/nativeMovementAnalyzer.ts`
  - Add pure pose-landmark conversion and live session assembly helpers.
  - Keep runtime package imports out of this file so tests can run in Node.
- Create: `mobile/lib/movement/nativeMovementAnalyzer.test.ts`
  - Cover landmark conversion, missing-foot confidence handling, live event/session assembly, and demo fallback metadata.
- Modify: `mobile/components/movement/MovementCameraView.native.tsx`
  - Add optional `onLandmarkFrame`, `onPoseStatusChange`, and frame-output wiring.
  - Initialize/release native pose inference, process physical-device frames, and send normalized lower-body landmarks back to JS.
- Modify: `mobile/components/movement/MovementCameraView.web.tsx`
  - Accept the same props without using them so shared imports typecheck on web.
- Modify: `mobile/components/movement/MovementCameraView.tsx`
  - Keep the platform export unchanged.
- Modify: `mobile/app/(drawer)/movement-lab.tsx`
  - Collect live frames during the live phase.
  - Finish a real camera run when frames exist; otherwise use clearly labeled demo data.
  - Surface analyzer status, frame count, and latest confidence in the HUD.

### Task 1: Dependencies

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/package-lock.json`

- [ ] **Step 1: Install native pose dependencies**

Run:

```bash
cd /Users/elmerlin/Documents/Shinsa/mobile
npm install react-native-nitro-pose-exercises@1.1.18 react-native-vision-camera-resizer@5.0.11
```

Expected: `package.json` and `package-lock.json` update without peer dependency failure.

- [ ] **Step 2: Inspect dependency changes**

Run:

```bash
cd /Users/elmerlin/Documents/Shinsa
git diff -- mobile/package.json mobile/package-lock.json
```

Expected: only the two package additions plus their transitive lockfile entries.

### Task 2: Pose Adapter and Session Builder

**Files:**
- Create: `mobile/lib/movement/nativeMovementAnalyzer.test.ts`
- Modify: `mobile/lib/movement/nativeMovementAnalyzer.ts`

- [ ] **Step 1: Write failing tests**

Add tests that assert:
- MediaPipe-compatible landmarks 27, 28, 29, 30, 31, and 32 become Shinsa left/right ankle, heel, and foot-index landmarks.
- Low-confidence or missing foot landmarks do not produce impossible foot frames.
- A live frame buffer builds a non-demo `MovementSession` through `detectMovementOnsets` and `computeReactionSamples`.
- Empty live input falls back to a demo session with explicit demo notes.

Run:

```bash
cd /Users/elmerlin/Documents/Shinsa/mobile
npm test -- lib/movement/nativeMovementAnalyzer.test.ts
```

Expected: FAIL because the new exports do not exist yet.

- [ ] **Step 2: Implement minimal pure helpers**

Add these exports in `nativeMovementAnalyzer.ts`:
- `normalizePoseLandmarksToFootFrame`
- `buildLiveMovementSession`
- `buildMovementSessionFromFrames`
- `buildDemoFallbackMovementSession`
- updated `getNativeMovementAnalyzerAvailability`

Implementation rules:
- Use landmark indices 27/28/29/30/31/32.
- Treat x/y as normalized camera coordinates.
- Confidence comes from `visibility`.
- Generate movement events with `detectMovementOnsets`.
- Generate reaction samples with `computeReactionSamples`.
- Use demo fallback only when no frames/events are available.

- [ ] **Step 3: Verify tests pass**

Run:

```bash
cd /Users/elmerlin/Documents/Shinsa/mobile
npm test -- lib/movement/nativeMovementAnalyzer.test.ts
```

Expected: PASS.

### Task 3: Native Camera Frame Wiring

**Files:**
- Modify: `mobile/components/movement/MovementCameraView.native.tsx`
- Modify: `mobile/components/movement/MovementCameraView.web.tsx`

- [ ] **Step 1: Add props before native work**

Add optional props:
- `onLandmarkFrame?: (frame: FootLandmarkFrame) => void`
- `onPoseStatusChange?: (status: PoseAnalyzerStatus) => void`
- `enablePoseInference?: boolean`

Run:

```bash
cd /Users/elmerlin/Documents/Shinsa/mobile
npm run typecheck
```

Expected: if implementation is incomplete, type errors point at missing status/types.

- [ ] **Step 2: Wire VisionCamera frame output**

Use VisionCamera v5 APIs:
- `useFrameOutput`
- `useAsyncRunner`
- `outputs={[frameOutput]}`
- `frame.dispose()` in every accepted/dropped path
- `pixelFormat: 'native'`
- `dropFramesWhileBusy: true`

Use `react-native-nitro-pose-exercises` only in the native file:
- `nitroPoseExercises.initialize('')`
- `nitroPoseExercises.processFrameAndroid(frame)` on Android
- `nitroPoseExercises.processFrameIOS(frame)` on iOS
- Read `nitroPoseExercises.landmarks` after processing and bridge it back with `runOnJS`.

Expected: physical devices can emit normalized foot landmark frames; simulator/no-camera/web can keep rendering the existing unavailable/fallback states.

### Task 4: Movement Lab Live Session Integration

**Files:**
- Modify: `mobile/app/(drawer)/movement-lab.tsx`

- [ ] **Step 1: Collect live frames**

Add state for:
- `liveFrames: FootLandmarkFrame[]`
- `poseStatus`
- `latestFootFrame`

Reset these when a run starts or mode changes.

- [ ] **Step 2: Finish live run from frames**

Change `finishRun`:
- If live frames are present, call `buildMovementSessionFromFrames`.
- If not, call `buildDemoFallbackMovementSession`.
- Save calibration and session as before.
- Select first sample as before.

- [ ] **Step 3: Update status copy**

Change visible live status from `Mock analyzer` to real statuses such as:
- `Pose ready`
- `Waiting for pose`
- `No pose frames yet`
- `Demo fallback`

Expected: the app no longer silently claims deterministic camera results.

### Task 5: Local Verification

**Files:**
- No source edits unless failures require fixes.

- [ ] **Step 1: Run focused tests**

```bash
cd /Users/elmerlin/Documents/Shinsa/mobile
npm test -- lib/movement/nativeMovementAnalyzer.test.ts lib/movement/analytics.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full mobile tests and typecheck**

```bash
cd /Users/elmerlin/Documents/Shinsa/mobile
npm test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run local Android build without cloud credits**

```bash
cd /Users/elmerlin/Documents/Shinsa/mobile
SHINSA_ANDROID_ARCHITECTURES=arm64-v8a SHINSA_GRADLE_WORKERS_MAX=2 npx expo prebuild -p android --clean
cd /Users/elmerlin/Documents/Shinsa/mobile/android
EXPO_PUBLIC_API_URL=https://pumpshinsa.com ./gradlew :app:assembleDebug --console=plain --no-daemon
```

Expected: local debug APK is produced under `mobile/android/app/build/outputs/apk/debug` and no EAS cloud credits are used.

For a signed release APK smoke build:

```bash
cd /Users/elmerlin/Documents/Shinsa/mobile
SKIP_PUBLISH=1 VERSION_CODE=999 bash scripts/build-apk-local.sh "pose inference local smoke"
```

Expected: local release APK is produced by the script and no EAS cloud credits are used.

### Task 6: Commit and Push

**Files:**
- Stage only Movement Lab/native pose files and mobile dependency files.
- Do not stage unrelated dirty files in the repository root.

- [ ] **Step 1: Review status**

```bash
cd /Users/elmerlin/Documents/Shinsa
git status --short
```

Expected: unrelated dirty files are still visible and left untouched.

- [ ] **Step 2: Commit**

```bash
cd /Users/elmerlin/Documents/Shinsa
git add mobile/package.json mobile/package-lock.json mobile/lib/movement/nativeMovementAnalyzer.ts mobile/lib/movement/nativeMovementAnalyzer.test.ts mobile/components/movement/MovementCameraView.native.tsx mobile/components/movement/MovementCameraView.web.tsx 'mobile/app/(drawer)/movement-lab.tsx' docs/superpowers/plans/2026-06-17-movement-lab-live-pose.md
git commit -m "Add native Movement Lab pose inference"
```

Expected: commit succeeds.

- [ ] **Step 3: Push**

```bash
cd /Users/elmerlin/Documents/Shinsa
git push
```

Expected: `codex/movement-lab-native` pushes to origin.
