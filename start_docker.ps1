$ErrorActionPreference = 'Stop'

if (-not (Test-Path '.env')) {
    Copy-Item '.env.docker.example' '.env'
    throw 'Created .env. Set POSTGRES_PASSWORD, then run this script again.'
}

if (-not (Test-Path 'backend/.env')) {
  Copy-Item 'backend/.env.example' 'backend/.env'
  throw 'Created backend/.env. Add required API keys, then run this script again.'
}

# The map SDK is compiled into the frontend image. Reuse the backend TMAP key
# for this build unless the caller explicitly supplied a public browser key.
if (-not $env:VITE_TMAP_APP_KEY) {
  $tmapLine = Get-Content 'backend/.env' | Where-Object { $_ -match '^TMAP_APP_KEY=' } | Select-Object -First 1
  if ($tmapLine) { $env:VITE_TMAP_APP_KEY = $tmapLine.Substring('TMAP_APP_KEY='.Length) }
}

docker compose up --build -d
docker compose ps
Write-Host 'ForeStudy is available at http://localhost'
