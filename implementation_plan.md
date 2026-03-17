# Plan: Heartbeat Recursion & Stack Depth Fix

The user is experiencing a `stack depth limit exceeded` error in the Android player when updating the `devices` table. This indicates a recursive loop in the database (triggers or RLS policies). Additionally, the Android app is making multiple redundant heartbeat calls, which increases server load and potential for conflicts.

## Project Context
The system uses a `devices` table for hardware telemetry and a `screens` table for logical display configuration. The Android player updates both, which currently triggers a recursive loop in Supabase.

## Proposed Changes

### Database (PostgreSQL / Supabase)

#### [NEW] [heartbeat_loop_nuclear_fix.sql](file:///c:/Users/Jairan%20Santos/Downloads/SITECODIGOSOBREMIDIA/sobremidiadesigner-main/heartbeat_loop_nuclear_fix.sql)
- Atomic cleanup of all `UPDATE` policies on `devices` and `screens`.
- Removal of any potentially recursive triggers on `devices` and `screens`.
- Implementation of a "Safe-Check" policy for heartbeats that ensures zero recursion by disabling complex `USING` clauses.
- Consolidation of the `pulse_screen` RPC to be more robust.

---

### Android Player (Kotlin)

#### [MODIFY] [RemoteDataSource.kt](file:///c:/Users/Jairan%20Santos/Downloads/SITECODIGOSOBREMIDIA/sobremidiadesigner-main/native-android-player/sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt)
- Improve error logging for `updateDevicesHeartbeat`.
- Add a cooldown or deduplication check to prevent rapid-fire updates to the same table.

#### [MODIFY] [HealthMonitorWorker.kt](file:///c:/Users/Jairan%20Santos/Downloads/SITECODIGOSOBREMIDIA/sobremidiadesigner-main/native-android-player/app/src/main/java/com/antigravity/player/worker/HealthMonitorWorker.kt)
- Consolidate telemetery calls. Instead of separate calls that overlap, use a sequential, synchronized process.
- Remove redundant `syncWithRemote` if `pulse_screen` alone is sufficient for the heartbeat aspect.

#### [MODIFY] [MainActivity.kt](file:///c:/Users/Jairan%20Santos/Downloads/SITECODIGOSOBREMIDIA/sobremidiadesigner-main/native-android-player/app/src/main/java/com/antigravity/player/MainActivity.kt)
- Remove redundant calls to `startSyncAndPlay()` if they overlap with the `HealthMonitorWorker` schedule.

## Verification Plan

### Manual Verification
1.  **Apply SQL Fix**: The user must run `heartbeat_loop_nuclear_fix.sql` in the Supabase SQL Editor.
2.  **Monitor Logcat**: Observe the Android app's logcat to ensure "Realtime Heartbeat Failed" errors no longer appear.
3.  **Dashboard Check**: Verify that the "Last Sync" and "Status" columns in the dashboard update correctly.
