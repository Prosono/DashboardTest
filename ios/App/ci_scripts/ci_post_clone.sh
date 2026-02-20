#!/bin/sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

ensure_npm() {
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  if command -v npm >/dev/null 2>&1; then
    return 0
  fi
  if command -v brew >/dev/null 2>&1; then
    echo "npm not found, installing Node.js via Homebrew..."
    brew install node@20 >/dev/null 2>&1 || brew install node >/dev/null 2>&1
    if [ -d "$(brew --prefix node@20 2>/dev/null)/bin" ]; then
      export PATH="$(brew --prefix node@20)/bin:$PATH"
    elif [ -d "$(brew --prefix node 2>/dev/null)/bin" ]; then
      export PATH="$(brew --prefix node)/bin:$PATH"
    fi
    if command -v npm >/dev/null 2>&1; then
      return 0
    fi
  fi
  echo "npm not found on PATH. Node.js is required for Capacitor iOS pods." >&2
  exit 1
}

echo "Installing Node dependencies..."
cd "$REPO_ROOT"
ensure_npm
npm ci

echo "Installing CocoaPods dependencies..."
cd "$REPO_ROOT/ios/App"
pod install --repo-update

echo "Xcode Cloud post-clone setup complete."
