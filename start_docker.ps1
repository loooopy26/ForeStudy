$ErrorActionPreference = 'Stop'

if (-not (Test-Path '.env')) {
    Copy-Item '.env.docker.example' '.env'
    throw 'Created .env. Set POSTGRES_PASSWORD, then run this script again.'
}

if (-not (Test-Path 'backend/.env')) {
    Copy-Item 'backend/.env.example' 'backend/.env'
    throw 'Created backend/.env. Add required API keys, then run this script again.'
}

docker compose up --build -d
docker compose ps
Write-Host 'ForeStudy is available at http://localhost'
