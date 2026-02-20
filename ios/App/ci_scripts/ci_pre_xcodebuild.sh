#!/bin/sh
set -e

echo "Validating CocoaPods setup before xcodebuild..."
pod install --repo-update

echo "Xcode Cloud pre-xcodebuild setup complete."
