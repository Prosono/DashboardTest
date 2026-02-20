#!/bin/sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "Installing Node dependencies..."
cd "$REPO_ROOT"
npm ci

echo "Installing CocoaPods dependencies..."
cd "$REPO_ROOT/ios/App"
pod install --repo-update

echo "Xcode Cloud post-clone setup complete."
