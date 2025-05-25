#!/bin/bash

# Installation script for Zscaler native messaging host
# This installs the native messaging host for the Zscaler extension
# to enable ifconfig-based IP detection

# Exit if any command fails
set -e

# Script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Host name
HOST_NAME="com.zscaler.native_host"

# Get extension ID from command line argument or use a placeholder
if [ -z "$1" ]; then
    # Try to find the ID from the extension directory name
    if [ -d "$HOME/.config/google-chrome/Default/Extensions" ]; then
        echo "Searching for Zscaler extension ID..."
        POSSIBLE_ID=$(find "$HOME/.config/google-chrome/Default/Extensions" -name "manifest.json" -exec grep -l "Zscaler" {} \; | head -1 | awk -F'/' '{print $(NF-2)}')
        
        if [ -n "$POSSIBLE_ID" ]; then
            EXTENSION_ID="$POSSIBLE_ID"
            echo "Found extension ID: $EXTENSION_ID"
        else
            EXTENSION_ID="*"
            echo "Warning: Could not automatically find extension ID. Using wildcard."
            echo "For security, it's better to specify your extension ID when installing."
            echo "Usage: $0 <extension-id>"
        fi
    else
        EXTENSION_ID="*"
        echo "Warning: No extension ID provided. Using wildcard for extension ID."
        echo "For security, it's better to specify your extension ID when installing."
        echo "Usage: $0 <extension-id>"
    fi
else
    EXTENSION_ID="$1"
    echo "Using extension ID: $EXTENSION_ID"
fi

# Target directories for Chrome, Chromium, and other Chromium-based browsers
CHROME_TARGET_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
CHROMIUM_TARGET_DIR="$HOME/.config/chromium/NativeMessagingHosts"
BRAVE_TARGET_DIR="$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
EDGE_TARGET_DIR="$HOME/.config/microsoft-edge/NativeMessagingHosts"

# Create target directories if they don't exist
mkdir -p "$CHROME_TARGET_DIR"
mkdir -p "$CHROMIUM_TARGET_DIR"
mkdir -p "$BRAVE_TARGET_DIR"
mkdir -p "$EDGE_TARGET_DIR"

# Host path - absolute path to the Python script
HOST_PATH="$DIR/zscaler_host.py"

# Make the host script executable
chmod +x "$HOST_PATH"

# Create the manifest file
cat > "$DIR/$HOST_NAME.json" << EOF
{
  "name": "$HOST_NAME",
  "description": "Zscaler Native Messaging Host for IP Detection",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF

# Copy the manifest file to target directories
cp "$DIR/$HOST_NAME.json" "$CHROME_TARGET_DIR/"
cp "$DIR/$HOST_NAME.json" "$CHROMIUM_TARGET_DIR/"
cp "$DIR/$HOST_NAME.json" "$BRAVE_TARGET_DIR/"
cp "$DIR/$HOST_NAME.json" "$EDGE_TARGET_DIR/"

# Print success message
echo "Native messaging host installed successfully."
echo "Installed for:"
echo "  - Google Chrome: $CHROME_TARGET_DIR"
echo "  - Chromium: $CHROMIUM_TARGET_DIR"
echo "  - Brave Browser: $BRAVE_TARGET_DIR"
echo "  - Microsoft Edge: $EDGE_TARGET_DIR"
echo ""
echo "To test, navigate to chrome://extensions in your browser, find your Zscaler extension,"
echo "copy its ID, and run this script again with the ID as an argument:"
echo "  $0 <extension-id>"
