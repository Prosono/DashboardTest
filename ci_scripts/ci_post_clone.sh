#!/bin/sh
set -e

echo "Installing Node dependencies..."
npm ci

echo "Building web assets..."
npm run build

echo "Syncing Capacitor iOS project..."
npx cap sync ios

echo "Xcode Cloud post-clone setup complete."
