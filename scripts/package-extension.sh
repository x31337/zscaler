#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Version from manifest
VERSION=$(cat extension/manifest.json | grep '"version"' | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[:space:]')

# Create build directory
BUILD_DIR="build"
ZIP_NAME="zscaler-extension-v$VERSION.zip"

echo -e "${YELLOW}Packaging Zscaler Extension v$VERSION${NC}"

# Clean previous build
if [ -d "$BUILD_DIR" ]; then
    echo "Cleaning previous build..."
    rm -rf "$BUILD_DIR"
fi

mkdir -p "$BUILD_DIR"

# Copy extension files
echo "Copying extension files..."
cp -r extension/* "$BUILD_DIR/"

# Remove development files
echo "Removing development files..."
rm -rf "$BUILD_DIR"/*.map
find "$BUILD_DIR" -name "*.test.js" -type f -delete
find "$BUILD_DIR" -name ".DS_Store" -type f -delete

# Create zip archive
echo "Creating zip archive..."
cd "$BUILD_DIR"
zip -r "../$ZIP_NAME" ./* -x "*.git*" -x "*.DS_Store" >/dev/null

cd ..

# Verify zip creation
if [ -f "$ZIP_NAME" ]; then
    echo -e "${GREEN}Successfully created $ZIP_NAME${NC}"
    echo "Archive contents:"
    unzip -l "$ZIP_NAME"
else
    echo -e "${RED}Failed to create extension package${NC}"
    exit 1
fi
