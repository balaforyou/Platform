# Whitelabel Badminton Platform — PWA Dev Tunnel & Services Startup Script
# Run this script in PowerShell to boot all backend services, Vite dev server, Caddy proxy, and Cloudflare tunnel.

$ErrorActionPreference = "Stop"

# Constants & Configuration
$DbUrl = "postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public"
$JwtSecret = "test-jwt-secret"
$InternalKey = "test-service-key"
$PlatformDir = "d:\apps\Platform"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Booting Whitelabel Badminton Platform UI & Services    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verify Postgres Database is online
Write-Host "Checking local PostgreSQL database connection..." -ForegroundColor Yellow
try {
    # Simple check to see if database port is open
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect("localhost", 65432)
    $tcp.Close()
    Write-Host "PostgreSQL is online and listening on port 65432." -ForegroundColor Green
} catch {
    Write-Host "ERROR: PostgreSQL database is not reachable on localhost:65432." -ForegroundColor Red
    Write-Host "Please start your database container (e.g., via docker-compose up) before running this script." -ForegroundColor Red
    Exit 1
}

# Directory array of jobs we need to clean up on exit
$Jobs = @()

function Start-Service-Job($Name, $Cwd, $Command, $EnvVars) {
    Write-Host "Starting $Name..." -ForegroundColor Yellow
    
    # Build PowerShell command block with environment variables
    $envPrefix = ""
    foreach ($key in $EnvVars.Keys) {
        $envPrefix += "`$env:$key = '$($EnvVars[$key])'; "
    }
    
    $fullCmd = "Set-Location '$Cwd'; $envPrefix $Command"
    
    # Start process in background job
    $job = Start-Job -ScriptBlock {
        param($cmd)
        Invoke-Expression $cmd
    } -ArgumentList $fullCmd -Name $Name
    
    return $job
}

try {
    # 2. Boot Backend Services
    $Jobs += Start-Service-Job -Name "Slot-Engine" -Cwd "$PlatformDir\services\slot-engine" -Command "npx tsx src/index.ts" -EnvVars @{
        DATABASE_URL = $DbUrl
        INTERNAL_SERVICE_KEY = $InternalKey
        PORT = "3001"
    }

    $Jobs += Start-Service-Job -Name "Identity-Auth" -Cwd "$PlatformDir\services\identity-auth" -Command "npx tsx src/index.ts" -EnvVars @{
        DATABASE_URL = $DbUrl
        JWT_SECRET = $JwtSecret
        INTERNAL_SERVICE_KEY = $InternalKey
        PORT = "3002"
    }

    $Jobs += Start-Service-Job -Name "Tenant-Management" -Cwd "$PlatformDir\services\tenant-management" -Command "npx tsx src/index.ts" -EnvVars @{
        DATABASE_URL = $DbUrl
        JWT_SECRET = $JwtSecret
        INTERNAL_SERVICE_KEY = $InternalKey
        PORT = "3003"
    }

    $Jobs += Start-Service-Job -Name "Payment-Service" -Cwd "$PlatformDir\services\payment" -Command "npx tsx src/index.ts" -EnvVars @{
        DATABASE_URL = $DbUrl
        INTERNAL_SERVICE_KEY = $InternalKey
        RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret"
        NOTIFICATION_SERVICE_URL = "http://localhost:3005"
        PORT = "3004"
    }

    $Jobs += Start-Service-Job -Name "Notification-Service" -Cwd "$PlatformDir\services\notification" -Command "npx tsx src/index.ts" -EnvVars @{
        DATABASE_URL = $DbUrl
        INTERNAL_SERVICE_KEY = $InternalKey
        IDENTITY_SERVICE_URL = "http://localhost:3002"
        PORT = "3005"
    }

    # 3. Boot PWA Vite Dev Server
    $Jobs += Start-Service-Job -Name "PWA-Vite-Dev" -Cwd "$PlatformDir\apps\guest-member-pwa" -Command "pnpm run dev" -EnvVars @{}

    # 4. Boot Caddy Reverse Proxy
    # Look for Caddy binary in bin directory
    $caddyPath = "$PlatformDir\bin\caddy.exe"
    if (!(Test-Path $caddyPath)) {
        Write-Host "ERROR: Caddy binary not found at $caddyPath." -ForegroundColor Red
        Exit 1
    }
    $Jobs += Start-Service-Job -Name "Caddy-Proxy" -Cwd $PlatformDir -Command "& '$caddyPath' run --config Caddyfile" -EnvVars @{}

    # 5. Boot Cloudflare Tunnel
    # Check which cloudflared executable exists (use cloudflared_new.exe if available, otherwise cloudflared.exe)
    $cfPath = "$PlatformDir\bin\cloudflared_new.exe"
    if (!(Test-Path $cfPath)) {
        $cfPath = "$PlatformDir\bin\cloudflared.exe"
    }
    if (!(Test-Path $cfPath)) {
        Write-Host "ERROR: Cloudflared binary not found in $PlatformDir\bin." -ForegroundColor Red
        Exit 1
    }

    # Temp log file to capture the tunnel URL output
    $tunnelLog = New-TemporaryFile
    $Jobs += Start-Service-Job -Name "Cloudflare-Tunnel" -Cwd $PlatformDir -Command "& '$cfPath' tunnel --url http://localhost:8080 > '$($tunnelLog.FullName)' 2>&1" -EnvVars @{}

    Write-Host "All background services started." -ForegroundColor Green
    Write-Host "Awaiting Cloudflare Tunnel URL generation..." -ForegroundColor Yellow

    # 6. Extract and print Cloudflare Tunnel URL
    $tunnelUrl = $null
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Path $tunnelLog.FullName) {
            $content = Get-Content $tunnelLog.FullName -Raw
            # Look for lines containing .trycloudflare.com
            if ($content -match "(https:\/\/[a-zA-Z0-9\-]+\.trycloudflare\.com)") {
                $tunnelUrl = $Matches[1]
                break
            }
        }
    }

    if ($tunnelUrl) {
        Write-Host "`n==========================================================" -ForegroundColor Green
        Write-Host "   Cloudflare Tunnel is live!                             " -ForegroundColor Green
        Write-Host "   PWA Public URL: $tunnelUrl" -ForegroundColor Cyan
        Write-Host "==========================================================`n" -ForegroundColor Green
    } else {
        Write-Host "`nWARNING: Cloudflare Tunnel URL could not be detected automatically." -ForegroundColor Red
        Write-Host "Please check the tunnel log file at: $($tunnelLog.FullName)" -ForegroundColor Red
    }

    Write-Host "Press Ctrl+C to terminate all services and exit." -ForegroundColor Gray
    
    # Wait loop
    while ($true) {
        Start-Sleep -Seconds 1
    }

} finally {
    # 7. Cleanup Job on interruption/exit
    Write-Host "`nShutting down all services..." -ForegroundColor Red
    foreach ($job in $Jobs) {
        Write-Host "Stopping $($job.Name)..." -ForegroundColor Gray
        Stop-Job $job -ErrorAction SilentlyContinue | Out-Null
        Remove-Job $job -ErrorAction SilentlyContinue | Out-Null
    }
    if (Get-Process -Name "caddy" -ErrorAction SilentlyContinue) {
        Stop-Process -Name "caddy" -Force -ErrorAction SilentlyContinue
    }
    if (Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue) {
        Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
    }
    if (Get-Process -Name "cloudflared_new" -ErrorAction SilentlyContinue) {
        Stop-Process -Name "cloudflared_new" -Force -ErrorAction SilentlyContinue
    }
    if (Get-Process -Name "node" -ErrorAction SilentlyContinue) {
        # Optional: We could kill node but that might affect other things. Let's let Jobs handle node.
    }
    Write-Host "Cleanup complete." -ForegroundColor Green
}
