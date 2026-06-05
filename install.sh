#!/usr/bin/env bash
set -euo pipefail

# ─── MultiMail + MultiCal Installer ─────────────────────────────────────────
# One-command setup for both MCP connectors on a new machine.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/billshoap/claude-multimail/main/install.sh | bash
#
# Or with your Google credentials:
#   bash install.sh --client-id YOUR_ID --client-secret YOUR_SECRET

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_BASE="${SCRIPT_DIR}"

CLIENT_ID=""
CLIENT_SECRET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --client-id)    CLIENT_ID="$2";    shift 2 ;;
    --client-secret) CLIENT_SECRET="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ─── Gather credentials ──────────────────────────────────────────────────────
if [[ -z "$CLIENT_ID" || -z "$CLIENT_SECRET" ]]; then
  if [[ -n "${GOOGLE_CLIENT_ID:-}" && -n "${GOOGLE_CLIENT_SECRET:-}" ]]; then
    echo "Using GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from environment"
    CLIENT_ID="$GOOGLE_CLIENT_ID"
    CLIENT_SECRET="$GOOGLE_CLIENT_SECRET"
  else
    echo ""
    echo "┌──────────────────────────────────────────────────────────────────┐"
    echo "│ Need Google credentials?                                        │"
    echo "│                                                                  │"
    echo "│ 1. Go to https://console.cloud.google.com/apis/credentials      │"
    echo "│ 2. Select your project                                          │"
    echo "│ 3. Click 'Create Credentials' → 'OAuth Client ID'               │"
    echo "│ 4. Application type: 'Desktop app', name: 'MultiMail'          │"
    echo "│ 5. Add redirect URI: http://localhost                           │"
    echo "│ 6. Copy the Client ID and Client Secret                         │"
    echo "└──────────────────────────────────────────────────────────────────┘"
    echo ""
    read -rp "Client ID:    " CLIENT_ID
    read -rp "Client Secret: " CLIENT_SECRET
  fi
fi

if [[ -z "$CLIENT_ID" || -z "$CLIENT_SECRET" ]]; then
  echo "Error: Client ID and Client Secret are required"
  exit 1
fi

# ─── Detect or clone repos ───────────────────────────────────────────────────
setup_repo() {
  local name="$1"
  local url="$2"
  local dir="${REPO_BASE}/${name}"

  if [[ -d "$dir" ]]; then
    echo "• $name — found at $dir"
  else
    echo "• $name — cloning..."
    git clone "$url" "$dir"
  fi

  echo "  Installing dependencies..."
  (cd "$dir" && npm install --silent && npm run build)
}

setup_repo "claude-multimail" "https://github.com/billshoap/claude-multimail.git"
setup_repo "claude-multical"  "https://github.com/billshoap/claude-multical.git"

# ─── Write Claude Desktop config ─────────────────────────────────────────────
CONFIG_DIR="${HOME}/Library/Application Support/Claude"
CONFIG_FILE="${CONFIG_DIR}/claude_desktop_config.json"
mkdir -p "$CONFIG_DIR"

# Merge into existing config, or create new one
if [[ -f "$CONFIG_FILE" ]]; then
  echo "• Merging into existing config at $CONFIG_FILE"
  # Use jq to merge if available, otherwise python3
  if command -v jq &>/dev/null; then
    jq --arg mm "${REPO_BASE}/claude-multimail/build/index.js" \
       --arg mc "${REPO_BASE}/claude-multical/build/index.js" \
       --arg cid "$CLIENT_ID" \
       --arg cs "$CLIENT_SECRET" \
       '.mcpServers.MultiMail = {"command":"node","args":[$mm],"env":{"GOOGLE_CLIENT_ID":$cid,"GOOGLE_CLIENT_SECRET":$cs}} |
        .mcpServers.MultiCal  = {"command":"node","args":[$mc],"env":{"GOOGLE_CLIENT_ID":$cid,"GOOGLE_CLIENT_SECRET":$cs}}' \
       "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
  else
    python3 -c "
import json, os
path = os.path.expanduser('$CONFIG_FILE')
with open(path) as f: cfg = json.load(f)
cfg.setdefault('mcpServers', {})
cfg['mcpServers']['MultiMail'] = {'command': 'node', 'args': ['${REPO_BASE}/claude-multimail/build/index.js'], 'env': {'GOOGLE_CLIENT_ID': '$CLIENT_ID', 'GOOGLE_CLIENT_SECRET': '$CLIENT_SECRET'}}
cfg['mcpServers']['MultiCal'] = {'command': 'node', 'args': ['${REPO_BASE}/claude-multical/build/index.js'], 'env': {'GOOGLE_CLIENT_ID': '$CLIENT_ID', 'GOOGLE_CLIENT_SECRET': '$CLIENT_SECRET'}}
with open(path, 'w') as f: json.dump(cfg, f, indent=2)
"
  fi
else
  echo "• Creating new config at $CONFIG_FILE"
  cat > "$CONFIG_FILE" <<JSON
{
  "mcpServers": {
    "MultiMail": {
      "command": "node",
      "args": ["${REPO_BASE}/claude-multimail/build/index.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "${CLIENT_ID}",
        "GOOGLE_CLIENT_SECRET": "${CLIENT_SECRET}"
      }
    },
    "MultiCal": {
      "command": "node",
      "args": ["${REPO_BASE}/claude-multical/build/index.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "${CLIENT_ID}",
        "GOOGLE_CLIENT_SECRET": "${CLIENT_SECRET}"
      }
    }
  }
}
JSON
fi

echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│ ✅  MultiMail + MultiCal installed                     │"
echo "│                                                       │"
echo "│  Next steps:                                          │"
echo "│  1. Restart Claude Desktop                            │"
echo "│  2. Say:  \"Add my Gmail account\"                     │"
echo "│  3. Say:  \"Add my calendar account\"                  │"
echo "│                                                       │"
echo "│  Or run the installer on another machine with:        │"
echo "│    curl -fsSL https://tinyurl.com/multimail-install | bash  │"
echo "└─────────────────────────────────────────────────────────┘"
