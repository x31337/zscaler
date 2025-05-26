#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
ENVIRONMENT="dev"
WATCH_INTERVAL=5

# Help function
function show_help {
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  -e, --environment    Environment (dev/prod) [default: dev]"
    echo "  -i, --interval       Watch interval in seconds [default: 5]"
    echo "  -h, --help           Show this help message"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -i|--interval)
            WATCH_INTERVAL="$2"
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

# Function to get container stats
function get_container_stats {
    local containers=$(docker ps --filter "name=zscaler_*_${ENVIRONMENT}" --format "{{.Names}}")
    
    clear
    echo -e "${BLUE}=== Zscaler Services Monitor (${ENVIRONMENT}) ===${NC}"
    echo -e "Updated: $(date '+%Y-%m-%d %H:%M:%S')\n"
    
    echo -e "${YELLOW}Container Status:${NC}"
    printf "%-30s %-15s %-20s %-20s %s\n" "NAME" "STATUS" "CPU %" "MEMORY" "NETWORK I/O"
    echo "--------------------------------------------------------------------------------------------------------"
    
    for container in $containers; do
        # Get container status and health
        status=$(docker inspect --format='{{.State.Status}}' "$container")
        health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}N/A{{end}}' "$container")
        
        # Get container stats
        stats=$(docker stats --no-stream --format "{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" "$container")
        cpu=$(echo "$stats" | awk '{print $1}')
        memory=$(echo "$stats" | awk '{print $2 "/" $4}')
        network=$(echo "$stats" | awk '{print $5 "/" $7}')
        
        # Determine status color
        if [ "$status" == "running" ] && [ "$health" == "healthy" ]; then
            status_color=$GREEN
        elif [ "$status" == "running" ] && [ "$health" != "healthy" ]; then
            status_color=$YELLOW
        else
            status_color=$RED
        fi
        
        printf "%-30s ${status_color}%-15s${NC} %-20s %-20s %s\n" \
            "$container" "${status}(${health})" "$cpu" "$memory" "$network"
    done
    
    echo -e "\n${YELLOW}Resource Usage:${NC}"
    echo "--------------------------------------------------------------------------------------------------------"
    docker-compose -f "deploy/${ENVIRONMENT}/docker-compose.${ENVIRONMENT}.yml" top
    
    echo -e "\n${YELLOW}Recent Logs:${NC}"
    echo "--------------------------------------------------------------------------------------------------------"
    for container in $containers; do
        echo -e "${BLUE}$container:${NC}"
        docker logs --tail 5 "$container" 2>&1
        echo
    done
}

# Watch loop
while true; do
    get_container_stats
    sleep "$WATCH_INTERVAL"
done
