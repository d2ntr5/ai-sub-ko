#!/usr/bin/env bash
# App Store Connect API 부르기: bash safari/scripts/asc.sh GET /v1/apps  (키 값은 출력하지 않음)
exec uv run -q --no-project --with 'pyjwt[crypto]' python3 "$(dirname "$0")/asc.py" "$@"
