#!/bin/sh
# Container start (the equivalent of `npm run start:prod --workspace=services/api`).
#
# GeoLite2 (B-024) is fetched HERE, at start, never at build: the MaxMind keys are runtime
# environment variables only, so they cannot end up in an image layer. The script ALWAYS
# exits 0 (no keys, or a failed download = "unresolved" country = the stronger safeguarding
# control) and runs in the background so a slow download never delays the health check;
# GeoIpService retries opening the file once a minute and reloads it when it appears.
cd /app/services/api || exit 1
node dist/scripts/fetch-geolite2.js &
exec node dist/main.js
