#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  cp .env.docker.example .env
  echo 'Created .env. Set POSTGRES_PASSWORD, then run this script again.' >&2
  exit 1
fi

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo 'Created backend/.env. Add required API keys, then run this script again.' >&2
  exit 1
fi

docker compose up --build -d
docker compose ps
echo 'ForeStudy is available at http://localhost'
