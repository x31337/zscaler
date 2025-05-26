#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Setting up development environment...${NC}"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Create necessary directories
echo "Creating required directories..."
mkdir -p logs
mkdir -p data/mysql

# Install dependencies
echo "Installing npm dependencies..."
npm install

# Build and start containers
echo "Starting Docker containers..."
cd ..
docker-compose down
docker-compose build
docker-compose up -d

# Wait for MySQL to be ready
echo "Waiting for MySQL to be ready..."
for i in {1..30}; do
    if docker-compose exec mysql mysqladmin ping -h localhost -u root -pzscaler >/dev/null 2>&1; then
        echo -e "${GREEN}MySQL is ready!${NC}"
        break
    fi
    echo -n "."
    sleep 1
done

# Check if MySQL started successfully
if ! docker-compose exec mysql mysqladmin ping -h localhost -u root -pzscaler >/dev/null 2>&1; then
    echo -e "${RED}MySQL failed to start properly.${NC}"
    exit 1
fi

# Run database migrations if they exist
if [ -d "server/docker/mysql/init" ]; then
    echo "Applying database initialization scripts..."
    docker-compose exec mysql sh -c 'mysql -u root -pzscaler zscaler_extension < /docker-entrypoint-initdb.d/01-schema.sql'
    docker-compose exec mysql sh -c 'mysql -u root -pzscaler zscaler_extension < /docker-entrypoint-initdb.d/02-initial-data.sql'
fi

# Check if server is responding
echo "Checking if server is responding..."
for i in {1..30}; do
    if curl -s http://localhost:3000/api/health >/dev/null; then
        echo -e "${GREEN}Server is up and running!${NC}"
        break
    fi
    echo -n "."
    sleep 1
done

echo -e "${GREEN}Development environment setup complete!${NC}"
echo -e "You can now access:"
echo -e "- API Server: http://localhost:3000"
echo -e "- MySQL: localhost:3306"
echo -e "\nUse 'docker-compose logs -f' to view logs"
