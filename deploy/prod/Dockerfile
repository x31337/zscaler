# Use a lightweight base image
FROM golang:1.20-alpine AS builder

# Set working directory for the build stage
WORKDIR /app

# Create basic server directory structure
RUN mkdir -p /app/src \
    /app/config \
    /app/logs \
    /app/scripts \
    /app/internal \
    /app/pkg

# Use a minimal base image for the final stage
FROM alpine:latest

# Create a non-root user
RUN adduser -D appuser

# Create and set permissions for application directories
RUN mkdir -p /app/src \
    /app/config \
    /app/logs \
    /app/scripts \
    /app/internal \
    /app/pkg \
    && chown -R appuser:appuser /app \
    && chmod -R 755 /app

# Set working directory
WORKDIR /app

# Switch to non-root user
USER appuser

# Expose server port (change as needed)
EXPOSE 8080

# Set default command
CMD ["sh"]

