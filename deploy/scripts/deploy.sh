#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Default values
ENVIRONMENT="dev"
ACTION="up"
COMPOSE_FILE=""
ENV_FILE=""

# Help function
function show_help {
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  -e, --environment    Environment (dev/prod) [default: dev]"
    echo "  -a, --action         Action (up/down/restart) [default: up]"
    echo "  -h, --help           Show this help message"
    echo
    echo "Examples:"
    echo "  $0 -e prod -a up     # Deploy production environment"
    echo "  $0 -e dev -a down    # Stop development environment"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -a|--action)
            ACTION="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|prod)$ ]]; then
    echo -e "${RED}Invalid environment. Must be 'dev' or 'prod'${NC}"
    exit 1
fi

# Validate action
if [[ ! "$ACTION" =~ ^(up|down|restart)$ ]]; then
    echo -e "${RED}Invalid action. Must be 'up', 'down', or 'restart'${NC}"
    exit 1
fi

# Set compose file based on environment
if [ "$ENVIRONMENT" == "dev" ]; then
    COMPOSE_FILE="deploy/dev/docker-compose.dev.yml"
    ENV_FILE="deploy/dev/.env"
else
    COMPOSE_FILE="deploy/prod/docker-compose.prod.yml"
    ENV_FILE="deploy/prod/.env"
fi

# Check if compose file exists
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}Compose file not found: $COMPOSE_FILE${NC}"
    exit 1
fi

# Check if .env file exists for production
if [ "$ENVIRONMENT" == "prod" ] && [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Environment file not found: $ENV_FILE${NC}"
    echo -e "${YELLOW}Please create it from .env.example${NC}"
    exit 1
fi

# Execute docker-compose command
echo -e "${YELLOW}Executing ${ACTION} for ${ENVIRONMENT} environment...${NC}"

case $ACTION in
    up)
        docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
        ;;
    down)
        docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
        ;;
    restart)
        docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart
        ;;
esac

# Check if action was successful
if [ $? -eq 0 ]; then
    echo -e "${GREEN}Successfully executed ${ACTION} for ${ENVIRONMENT} environment${NC}"
    
    if [ "$ACTION" == "up" ]; then
        echo -e "\nServices:"
        docker-compose -f "$COMPOSE_FILE" ps
        
        echo -e "\nHealth status:"
        docker-compose -f "$COMPOSE_FILE" ps | grep -v "Name" | awk '{print $1}' | while read container; do
            status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null)
            echo -e "$container: ${GREEN}$status${NC}"
        done
    fi
else
    echo -e "${RED}Failed to execute ${ACTION} for ${ENVIRONMENT} environment${NC}"
    exit 1
fi
