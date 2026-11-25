#!/usr/bin/env bash
# Sends N requests through the load balancer and counts which server answered each one.
# Works with macOS's default bash 3.2 and Linux bash.
# Usage: bash scripts/test-lb.sh <lb01-address-or-url> [requests=10]
#   e.g. bash scripts/test-lb.sh https://www.teddyntawe.tech 10
#        bash scripts/test-lb.sh 10.0.0.5            (plain address → http://)
set -euo pipefail

TARGET="${1:?Usage: bash scripts/test-lb.sh <lb01-address-or-url> [requests]}"
N="${2:-10}"
[[ "$TARGET" == *://* ]] || TARGET="http://$TARGET"
URL="${TARGET%/}/api/health"
results=""

echo "Sending $N requests to $URL"
for ((i = 1; i <= N; i++)); do
  server=$(curl -s -L -m 10 -o /dev/null -D - "$URL" | tr -d '\r' |
    awk -F': ' 'tolower($1)=="x-served-by"{print $2}')
  server="${server:-<no header / request failed>}"
  printf '%3d  %s\n' "$i" "$server"
  results+="$server"$'\n'
done

echo
echo "Distribution (requests per server):"
printf '%s' "$results" | sort | uniq -c | sort -rn
