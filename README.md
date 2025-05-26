# Zscaler Browser Extension

A modern browser extension for Zscaler security with email-based portal configuration and network monitoring.

## Features

- 🔒 Real-time security monitoring
- 🌐 Network status tracking (public, private, docker, and non-private IPs)
- 📧 Email-based portal configuration
- 📊 Modern UI with sliding cards
- 🔄 Auto-updating network information
- 📝 Comprehensive logging
- 🏥 Health monitoring

## Project Structure

```
zscaler/
├── extension/          # Browser extension files
│   ├── popup/         # Popup UI files
│   ├── icons/         # Extension icons
│   ├── background.js  # Background service worker
│   └── manifest.json  # Extension manifest
├── server/            # Backend server
│   ├── src/          # Source code
│   ├── tests/        # Test files
│   ├── scripts/      # Utility scripts
│   └── docker/       # Docker configuration
└── docker-compose.yml # Development environment setup
```

## Prerequisites

- Node.js 18+
- Docker and Docker Compose
- Chrome/Firefox for extension development

## Quick Start

1. Clone the repository:
```bash
git clone <repository-url>
cd zscaler
```

2. Set up the development environment:
```bash
cd server
./scripts/setup-dev.sh
```

3. Load the extension in Chrome:
   - Open Chrome
   - Go to chrome://extensions/
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension` directory

## Development

### Server Development

The backend server runs on Node.js with Express and uses MySQL for data storage.

Start the development environment:
```bash
cd server
npm run dev
```

Available endpoints:

- Health Checks:
  - GET /api/health - Basic health status
  - GET /api/health/metrics - Detailed metrics
  - GET /api/health/debug - Debug information

- Monitoring:
  - GET /api/monitor/history - Network status history
  - GET /api/monitor/stats - Current monitoring stats
  - GET /api/monitor/errors - Error log
  - POST /api/monitor/check - Force network check

- Network Status:
  - GET /api/network-status - Current network information
  - GET /api/status - Protection status
  - POST /api/protection - Update protection state

- Portal Settings:
  - GET /api/portal-settings/:type - Get portal settings
  - POST /api/portal-settings - Save portal settings

### Extension Development

The extension is built with vanilla JavaScript and modern CSS.

Key components:
- Popup UI with sliding cards
- Real-time network monitoring
- Auto-updating status display
- Email-based portal configuration

### Testing

Run tests using the test script:

```bash
cd server
./scripts/test.sh        # Run all tests
./scripts/test.sh unit   # Run unit tests
./scripts/test.sh integration  # Run integration tests
./scripts/test.sh e2e   # Run end-to-end tests
```

## Docker Development Environment

The development environment uses Docker Compose with:
- MySQL 8.0 database
- Node.js server with hot-reload
- Automatic database initialization
- Health monitoring

Start the environment:
```bash
docker-compose up -d
```

View logs:
```bash
docker-compose logs -f
```

## Database

The MySQL database includes tables for:
- Portal settings
- Protection status
- Network status history
- System settings

Features:
- Automatic cleanup of old data
- Performance optimization
- Data integrity checks
- Error tracking

## Monitoring and Debugging

1. Check server health:
```bash
curl http://localhost:3000/api/health
```

2. View detailed metrics:
```bash
curl http://localhost:3000/api/health/metrics
```

3. Access debug information:
```bash
curl http://localhost:3000/api/health/debug
```

4. Monitor network status:
```bash
curl http://localhost:3000/api/monitor/stats
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests
4. Submit a pull request

## License

[Add your license information here]
