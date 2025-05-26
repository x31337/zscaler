# Use Node.js base image
FROM node:20-slim

# Create app directory
WORKDIR /app

# Copy package files and node_modules
COPY package*.json ./
COPY node_modules ./node_modules

# Copy configuration files
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create required directories and copy server files
RUN mkdir -p /app/logs /app/server
COPY server/portal-service.js /app/server/

# Expose port
EXPOSE 3002

# Set environment variables
ENV NODE_ENV=production \
    PORT=3002

# Set entrypoint
ENTRYPOINT ["docker-entrypoint.sh"]
