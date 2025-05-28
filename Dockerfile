# Build stage
FROM node:20 AS builder

WORKDIR /app

# Enable build debugging
ENV NPM_CONFIG_LOGLEVEL=verbose
ENV DEBUG=*
ENV NODE_DEBUG=module,http,net
ENV NODE_OPTIONS="--trace-warnings"

# Copy package files
COPY package*.json ./

# Install production dependencies with logging
RUN set -x && npm ci --only=production 2>&1 | tee /tmp/npm-install.log

# Copy source files
COPY . .

# Build with debug output
RUN set -x && npm run build 2>&1 | tee /tmp/npm-build.log

# Production stage
FROM node:20-slim

WORKDIR /app

# Set debug environment
ENV DEBUG=*
ENV NODE_DEBUG=module,http,net,docker
ENV NODE_ENV=production
ENV PORT=3002
ENV HOST=0.0.0.0
ENV NPM_CONFIG_LOGLEVEL=verbose

# Install necessary packages including Docker client
RUN set -x \
    && apt-get update 2>&1 | tee /tmp/apt-update.log \
    && apt-get install -y curl docker.io 2>&1 | tee /tmp/apt-install.log \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/logs \
    && chown -R node:node /app /tmp/*.log

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Setup Docker access
RUN set -x \
    && mkdir -p /var/run \
    && touch /var/run/docker.sock \
    && DOCKER_GID=$(getent group docker_external >/dev/null 2>&1 && getent group docker_external | cut -d: -f3 || echo "1500") \
    && if getent group docker_external >/dev/null 2>&1; then \
         echo "Group docker_external already exists with GID: $DOCKER_GID"; \
       else \
         groupadd -g ${DOCKER_GID} docker_external || groupadd docker_external; \
       fi \
    && usermod -aG docker_external node 2>&1 | tee /tmp/usermod.log \
    && chmod 666 /var/run/docker.sock \
    && chown root:docker_external /var/run/docker.sock \
    && ls -l /var/run/docker.sock 2>&1 | tee /tmp/docker-sock-perms.log

# Expose ports
EXPOSE 3002
EXPOSE 9229

# Create debug log directory
RUN mkdir -p /app/logs/debug && chown -R node:node /app/logs

# Switch to non-root user
USER node

# Healthcheck with verbose logging
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -v http://localhost:3002/api/health 2>&1 | tee /app/logs/debug/healthcheck.log || exit 1

# Start with enhanced debugging
CMD ["node", "--inspect=0.0.0.0:9229", "--trace-warnings", "--enable-source-maps", "server/portal-service.js"]
