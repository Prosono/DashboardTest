#!/bin/sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [ ! -d "$REPO_ROOT/node_modules/@capacitor/ios" ]; then
  echo "Node dependencies missing, installing..."
  cd "$REPO_ROOT"
  npm ci
fi

echo "Validating CocoaPods setup before xcodebuild..."
cd "$REPO_ROOT/ios/App"
pod install --repo-update

echo "Xcode Cloud pre-xcodebuild setup complete."
