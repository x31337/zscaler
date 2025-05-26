#!/bin/sh
set -e

# Wait for any external services if needed
# Add any initialization steps here

# Start the unified service
exec node server/portal-service.js

