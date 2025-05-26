#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
ENVIRONMENT="dev"
DURATION=60
CONCURRENT_USERS=10
RAMP_UP=30
TEST_ENDPOINTS=(
    "/api/health"
    "/api/network-status"
    "/api/status"
    "/api/monitor/stats"
)
OUTPUT_DIR="loadtest_$(date +%Y%m%d_%H%M%S)"

# Help function
function show_help {
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  -e, --environment      Environment (dev/prod) [default: dev]"
    echo "  -d, --duration         Test duration in seconds [default: 60]"
    echo "  -c, --concurrent       Concurrent users [default: 10]"
    echo "  -r, --ramp-up         Ramp-up period in seconds [default: 30]"
    echo "  -o, --output-dir      Output directory [default: loadtest_timestamp]"
    echo "  -h, --help            Show this help message"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -d|--duration)
            DURATION="$2"
            shift 2
            ;;
        -c|--concurrent)
            CONCURRENT_USERS="$2"
            shift 2
            ;;
        -r|--ramp-up)
            RAMP_UP="$2"
            shift 2
            ;;
        -o|--output-dir)
            OUTPUT_DIR="$2"
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

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Function to check prerequisites
function check_prerequisites {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    # Check if ab (Apache Bench) is installed
    if ! command -v ab &> /dev/null; then
        echo -e "${RED}Apache Bench (ab) is required but not installed.${NC}"
        echo "Install with: sudo apt-get install apache2-utils"
        exit 1
    }
    
    # Check if services are running
    if ! docker-compose -f "deploy/${ENVIRONMENT}/docker-compose.${ENVIRONMENT}.yml" ps | grep -q "Up"; then
        echo -e "${RED}Services are not running. Please start them first.${NC}"
        exit 1
    }
}

# Function to monitor resources during test
function monitor_resources {
    local pid_file="${OUTPUT_DIR}/monitor.pid"
    
    # Start monitoring in background
    {
        while true; do
            echo "=== $(date '+%Y-%m-%d %H:%M:%S') ===" >> "${OUTPUT_DIR}/resource_usage.log"
            docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" \
                >> "${OUTPUT_DIR}/resource_usage.log"
            echo >> "${OUTPUT_DIR}/resource_usage.log"
            sleep 5
        done
    } &
    
    # Save monitoring process ID
    echo $! > "$pid_file"
}

# Function to stop resource monitoring
function stop_monitoring {
    local pid_file="${OUTPUT_DIR}/monitor.pid"
    if [ -f "$pid_file" ]; then
        kill $(cat "$pid_file")
        rm "$pid_file"
    fi
}

# Function to run load test for a single endpoint
function test_endpoint {
    local endpoint=$1
    local output_file="${OUTPUT_DIR}/$(echo $endpoint | tr '/' '_').txt"
    
    echo -e "${BLUE}Testing endpoint: ${endpoint}${NC}"
    
    ab -n $((CONCURRENT_USERS * DURATION)) \
       -c "$CONCURRENT_USERS" \
       -t "$DURATION" \
       -g "${output_file}.csv" \
       "http://localhost:3000${endpoint}" > "$output_file"
    
    # Extract key metrics
    {
        echo "=== Summary for ${endpoint} ==="
        grep "Requests per second" "$output_file"
        grep "Time per request" "$output_file"
        grep "Failed requests" "$output_file"
        echo "==="
    } >> "${OUTPUT_DIR}/summary.txt"
}

# Function to analyze results
function analyze_results {
    echo -e "${YELLOW}Analyzing results...${NC}"
    
    {
        echo "=== Load Test Analysis ==="
        echo "Date: $(date)"
        echo "Environment: $ENVIRONMENT"
        echo "Duration: $DURATION seconds"
        echo "Concurrent Users: $CONCURRENT_USERS"
        echo "Ramp-up Period: $RAMP_UP seconds"
        echo
        
        # Analyze each endpoint
        for endpoint in "${TEST_ENDPOINTS[@]}"; do
            local file="${OUTPUT_DIR}/$(echo $endpoint | tr '/' '_').txt"
            
            echo "Endpoint: $endpoint"
            echo "-------------------"
            grep "Requests per second" "$file" | awk '{print "Throughput: " $4 " req/sec"}'
            grep "Time per request" "$file" | head -1 | awk '{print "Average Response Time: " $4 " ms"}'
            grep "Failed requests" "$file" | awk '{print "Failed Requests: " $3}'
            echo
        done
        
        # Add resource usage summary
        echo "Resource Usage Summary"
        echo "---------------------"
        echo "See resource_usage.log for detailed metrics"
        echo
        
        # Add recommendations
        echo "Recommendations"
        echo "--------------"
        for endpoint in "${TEST_ENDPOINTS[@]}"; do
            local file="${OUTPUT_DIR}/$(echo $endpoint | tr '/' '_').txt"
            local rps=$(grep "Requests per second" "$file" | awk '{print $4}')
            local avg_time=$(grep "Time per request" "$file" | head -1 | awk '{print $4}')
            
            echo "For $endpoint:"
            if (( $(echo "$avg_time > 500" | bc -l) )); then
                echo "- Consider optimizing response time (current: ${avg_time}ms)"
            fi
            if (( $(echo "$rps < 100" | bc -l) )); then
                echo "- Consider scaling the service (current throughput: ${rps} req/sec)"
            fi
        done
        
    } > "${OUTPUT_DIR}/analysis.txt"
}

# Main execution
echo -e "${BLUE}=== Zscaler Load Test ===${NC}"
echo -e "Environment: ${YELLOW}${ENVIRONMENT}${NC}"
echo -e "Output Directory: ${YELLOW}${OUTPUT_DIR}${NC}\n"

# Check prerequisites
check_prerequisites

# Start resource monitoring
monitor_resources

# Run tests
echo -e "${YELLOW}Starting load tests...${NC}"
for endpoint in "${TEST_ENDPOINTS[@]}"; do
    test_endpoint "$endpoint"
done

# Stop resource monitoring
stop_monitoring

# Analyze results
analyze_results

echo -e "${GREEN}Load testing complete!${NC}"
echo -e "Results directory: ${YELLOW}${OUTPUT_DIR}${NC}"
echo -e "Analysis file: ${YELLOW}${OUTPUT_DIR}/analysis.txt${NC}"
