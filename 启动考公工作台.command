#!/bin/zsh
set -e

workspace_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$workspace_dir/Workbench"

if [[ ! -d node_modules ]]; then
  npm install
fi

exec npm run dev -- --open
