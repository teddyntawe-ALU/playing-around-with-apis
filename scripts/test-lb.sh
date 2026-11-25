#!/usr/bin/env bash
# Sends N requests through the load balancer and counts which server answered each one.
# Works with macOS's default bash 3.2 and Linux bash.
# Usage: bash scripts/test-lb.sh <lb01-address> [requests=10]
set -euo pipefail

LB="${1:?Usage: bash scripts/test-lb.sh <lb01-address> [requests]}"
N="${2:-10}"
results=""

echo "Sending $N requests to http://$LB/api/health"
for ((i = 1; i <= N; i++)); do
  server=$(curl -s -m 10 -o /dev/null -D - "http://$LB/api/health" | tr -d '\r' |
    awk -F': ' 'tolower($1)=="x-served-by"{print $2}')
  server="${server:-<no header / request failed>}"
  printf '%3d  %s\n' "$i" "$server"
  results+="$server"$'\n'
done

echo
echo "Distribution (requests per server):"
printf '%s' "$results" | sort | uniq -c | sort -rn
