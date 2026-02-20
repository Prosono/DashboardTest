#!/bin/sh
set -e

echo "Validating CocoaPods setup before xcodebuild..."
cd ios/App
pod install --repo-update
cd ../..

echo "Xcode Cloud pre-xcodebuild setup complete."
