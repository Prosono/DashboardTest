#!/bin/sh
set -e

echo "Installing CocoaPods dependencies..."
pod install --repo-update

echo "Xcode Cloud post-clone setup complete."
