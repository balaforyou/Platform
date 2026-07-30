@echo off
REM =====================================================================================
REM WARNING: Do NOT use this script in non-interactive or CI environments (like the
REM Antigravity sandbox). Spawning detached windows using "start" will terminate
REM immediately because there is no desktop session/window manager.
REM Use daemon-style launching instead (e.g. `run_command` with IsDaemon: true).
REM =====================================================================================
set DATABASE_URL=postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public
set JWT_SECRET=test-jwt-secret
set INTERNAL_SERVICE_KEY=test-service-key
set RAZORPAY_WEBHOOK_SECRET=test-webhook-secret
set NOTIFICATION_SERVICE_URL=http://localhost:3005
set IDENTITY_SERVICE_URL=http://localhost:3002

start "identity" /min cmd /c "cd /d d:\apps\Platform\services\identity-auth && set PORT=3002 && npx tsx src/index.ts > %TEMP%\identity_svc.log 2>&1"
start "slot" /min cmd /c "cd /d d:\apps\Platform\services\slot-engine && set PORT=3001 && npx tsx src/index.ts > %TEMP%\slot_svc.log 2>&1"
start "payment" /min cmd /c "cd /d d:\apps\Platform\services\payment && set PORT=3004 && npx tsx src/index.ts > %TEMP%\payment_svc.log 2>&1"
start "notification" /min cmd /c "cd /d d:\apps\Platform\services\notification && set PORT=3005 && npx tsx src/index.ts > %TEMP%\notification_svc.log 2>&1"
echo All services started
