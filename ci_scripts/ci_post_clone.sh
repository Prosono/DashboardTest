#!/bin/sh
set -e

echo "Installing CocoaPods dependencies..."
cd ios/App
pod install --repo-update
cd ../..

echo "Xcode Cloud post-clone setup complete."
