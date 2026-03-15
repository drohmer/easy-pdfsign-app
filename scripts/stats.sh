#!/usr/bin/env bash
set -euo pipefail

# === Easy-pdfSign — Usage stats from nginx logs ===
# Usage: ./scripts/stats.sh [days]
#   days: how many days back to analyze (default: 30)

SERVER="root@51.159.164.228"
LOG="/var/log/nginx/easy-pdfsign.access.log"
DAYS="${1:-30}"

echo "=== Easy-pdfSign Usage Stats (last ${DAYS} days) ==="
echo ""

ssh "$SERVER" "awk -v days=$DAYS '
BEGIN {
    # Date threshold
    cmd = \"date -d \\\"\" days \" days ago\\\" +%d/%b/%Y\"
    cmd | getline cutoff
    close(cmd)

    pages = 0
    exports = 0
    unique_ips = 0
    bots = 0
}
{
    # Skip bots
    ua = tolower(\$0)
    if (ua ~ /bot|crawl|spider|curl|wget|python|scan/) { bots++; next }

    # Only count page loads (GET / or GET /index.html) and JS loads
    if (\$6 == \"\\\"GET\" && (\$7 == \"/\" || \$7 == \"/index.html\")) {
        pages++
        ips[\$1]++
    }

    # Count PDF export (the JS bundle is loaded once per session)
    if (\$7 ~ /index-.*\\.js/) {
        sessions[\$1]++
    }
}
END {
    for (ip in ips) unique_ips++

    printf \"  Page views:      %d\\n\", pages
    printf \"  Unique visitors: %d\\n\", unique_ips
    printf \"  Bots filtered:   %d\\n\", bots
    printf \"\\n\"

    # Top 10 days by visits
    print \"  Top visitors by IP:\"
    n = 0
    PROCINFO[\"sorted_in\"] = \"@val_num_desc\"
    for (ip in ips) {
        if (++n > 5) break
        printf \"    %-40s %d visits\\n\", ip, ips[ip]
    }
}
' $LOG"

echo ""
echo "--- Recent activity (last 10 page loads) ---"
ssh "$SERVER" "grep -E 'GET /(index.html)? HTTP' $LOG | grep -iv 'bot\|crawl\|spider' | tail -10 | awk '{print \"  \" \$4 \" \" \$1}' | sed 's/\[//'"
echo ""
