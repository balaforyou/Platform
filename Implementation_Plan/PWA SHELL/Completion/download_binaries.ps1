$binDir = "d:\apps\Platform\bin"
if (!(Test-Path $binDir)) {
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    Write-Host "Created bin directory at $binDir"
}

# 1. Download Caddy
$caddyExe = Join-Path $binDir "caddy.exe"
if (!(Test-Path $caddyExe)) {
    Write-Host "Downloading Caddy..."
    $caddyZip = Join-Path $binDir "caddy.zip"
    $caddyUrl = "https://github.com/caddyserver/caddy/releases/download/v2.8.4/caddy_2.8.4_windows_amd64.zip"
    
    # Use TLS 1.2
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $caddyUrl -OutFile $caddyZip -UseBasicParsing
    
    Write-Host "Extracting Caddy..."
    Expand-Archive -Path $caddyZip -DestinationPath $binDir -Force
    Remove-Item $caddyZip -Force
    Write-Host "Caddy successfully installed at $caddyExe"
} else {
    Write-Host "Caddy already exists at $caddyExe"
}

# 2. Download Cloudflared
$cloudflaredExe = Join-Path $binDir "cloudflared.exe"
if (!(Test-Path $cloudflaredExe)) {
    Write-Host "Downloading Cloudflared..."
    $cloudflaredUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    
    Invoke-WebRequest -Uri $cloudflaredUrl -OutFile $cloudflaredExe -UseBasicParsing
    Write-Host "Cloudflared successfully installed at $cloudflaredExe"
} else {
    Write-Host "Cloudflared already exists at $cloudflaredExe"
}
