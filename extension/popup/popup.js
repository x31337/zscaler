// Preserve all existing code from the original file
// Zscaler Chrome Extension - Popup Script

// Portal API Configuration
const API_CONFIG = {
    endpoint: 'http://localhost:3000/api',
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 5000,
    timeout: 5000,
    cacheExpiry: 300000, // 5 minutes
    errorMessages: {
        offline: 'Cannot connect while offline. Using cached settings if available.',
        timeout: 'Connection timeout. Settings server may be unavailable.',
        unavailable: 'Settings server is not available. Using cached settings if available.',
        fetchError: 'Failed to connect to settings server. Using cached settings if available.',
        maxRetries: 'Maximum retry attempts reached. Please try again later.',
        invalidResponse: 'Invalid response from settings server.',
        unknown: 'An unexpected error occurred. Please try again.'
    }
};

// Portal API Helper Class
class PortalAPIHelper {
    constructor(config) {
        this.config = config;
        this.retryCount = 0;
    }

    async makeRequest(endpoint, options = {}) {
        this.retryCount = 0;
        return this.tryRequest(endpoint, options);
    }

    async tryRequest(endpoint, options) {
        try {
            if (!navigator.onLine) {
                throw new Error('offline');
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

            const response = await fetch(`${this.config.endpoint}${endpoint}`, {
                ...options,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`http_error_${response.status}`);
            }

            return await response.json();

        } catch (error) {
            console.error(`API Request Error (attempt ${this.retryCount + 1}):`, error);

            if (error.message === 'offline' || error.name === 'AbortError') {
                throw error;
            }

            if (this.retryCount < this.config.maxRetries) {
                const delay = Math.min(
                    this.config.baseDelay * Math.pow(2, this.retryCount),
                    this.config.maxDelay
                );
                this.retryCount++;
                
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.tryRequest(endpoint, options);
            }

            throw error;
        }
    }

    getErrorMessage(error) {
        if (error.message === 'offline') {
            return this.config.errorMessages.offline;
        }
        if (error.name === 'AbortError') {
            return this.config.errorMessages.timeout;
        }
        if (error.message.includes('Failed to fetch')) {
            return this.config.errorMessages.unavailable;
        }
        if (error.message.startsWith('http_error_')) {
            return this.config.errorMessages.invalidResponse;
        }
        if (this.retryCount >= this.config.maxRetries) {
            return this.config.errorMessages.maxRetries;
        }
        return this.config.errorMessages.unknown;
    }
}

// Initialize API helper
const portalAPI = new PortalAPIHelper(API_CONFIG);

// NetworkMonitor class for handling card slider
class NetworkMonitor {
  constructor() {
    // RevSlider Configuration with network monitoring integration
    this.revSliderConfig = {
      // Timing Settings - Enhanced for optimal UX
      delay: 30000,                    // 30 seconds between slides for much better readability
      animationDuration: 350,          // Keep 350ms for smooth transitions
      startDelay: 1500,                // Keep 1.5s initial delay
      updateInterval: 5000,            // Keep 5s IP update interval
      
      // Autoplay Configuration
      autoplay: {
        enabled: true,                 // Enable autoplay by default
        delay: 5000,                   // Time between slide transitions (5 seconds)
        pauseOnHover: true,            // Pause on mouse hover
        pauseOnTouch: true,            // Pause on touch interaction
        resumeOnLeave: true,           // Resume when mouse/touch leaves
        pauseOnInteraction: true,      // Pause when user interacts with slider
        restartDelay: 2000,           // Delay before restarting after interaction
        transitionDuration: 500       // Duration of slide transitions
      },
      
      // Network Configuration - Optimized settings
      network: {
        retryInterval: 1000,           // Keep 1s retry interval
        maxRetries: 3,                 // Keep max retries
        updateThrottle: 50,            // Keep reduced throttle
        errorTimeout: 1500,            // Keep error timeout
        maxConcurrent: 2               // Keep concurrent requests
      },
      
      // Performance Optimization - Enhanced settings
      hardware: {
        acceleration: true,            // Keep GPU acceleration
        perspectiveDistance: 1000,     // Keep 3D perspective
        backfaceVisibility: 'hidden',  // Keep backface hidden
        gpuRounding: true,            // Keep GPU rounding
        compositeOperation: 'transform', // Keep transform
        renderingMode: 'high-performance', // Keep high-performance
        willChange: ['transform', 'opacity'] // Keep property changes
      },
      
      // Animation Configuration - Enhanced settings
      animation: {
        opacity: {
          duration: 0.35,             // Keep duration
          easing: 'ease-out',         // Keep easing
          initial: 0,                 // Keep initial
          final: 1                    // Keep final
        },
        transform: {
          scale: {
            active: 1,                // Keep scale
            inactive: 0.98,           // Keep scale
            transition: 0.97          // Keep transition
          }
        },
        zIndex: {
          active: 2,                  // Keep z-index
          inactive: 1,                // Keep z-index
          hidden: 0                   // Keep z-index
        },
        cleanup: 25,                  // Keep cleanup
        stagger: 15                   // Keep stagger
      }
    };

    // Initialize network state
    this.networkState = {
      lastUpdate: null,
      updatePending: false,
      retryCount: 0,
      errorTimeout: null
    };
    
    // Slider state
    this.currentSlide = 0;
    this.autoplayInterval = null;
    this.isAnimating = false;
    this.isPaused = false;
    
    // DOM Elements
    this.slider = document.querySelector('.card-slider');
    this.cards = document.querySelectorAll('.network-card');
    this.dots = document.querySelectorAll('.nav-dot');
    
    // Touch handling
    this.touchStartX = 0;
    this.touchEndX = 0;
    
    // Initialize RevSlider
    this.initializeRevSlider();
    this.setupEventListeners();
    this.initializeIPUpdates();
    this.initializeNetworkMonitoring();
  }

  // Initialize network monitoring
  initializeNetworkMonitoring() {
    // Set up message listener for IP updates
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'ipUpdated') {
        this.handleIPUpdate(message.ipInfo);
      }
    });

    // Set up error handling and network status monitoring
    window.addEventListener('online', () => {
      this.handleNetworkStatusChange(true);
      this.updateNetworkStatusUI(true);
    });
    
    window.addEventListener('offline', () => {
      this.handleNetworkStatusChange(false);
      this.updateNetworkStatusUI(false);
    });

    // Initial network status check
    this.updateNetworkStatusUI(navigator.onLine);
  }

  // Handle network status changes
  handleNetworkStatusChange(isOnline) {
    if (isOnline) {
      this.clearErrorState();
      // Add small delay before retry to ensure connection is stable
      setTimeout(() => {
        this.retryIPUpdates();
      }, 1000);
    } else {
      this.setErrorState('Network connection lost. Using cached data if available.');
      // Try to load cached data
      this.loadCachedIPData();
    }
  }

  async loadCachedIPData() {
    try {
      const cache = await chrome.storage.local.get(['cachedPublicIP', 'cachedPrivateIPs']);
      if (cache.cachedPublicIP && Date.now() - cache.cachedPublicIP.timestamp < 300000) {
        this.handleIPUpdate({
          public: cache.cachedPublicIP.ip,
          ...(cache.cachedPrivateIPs || {})
        });
      }
    } catch (error) {
      console.warn('Failed to load cached IP data:', error);
    }
  }

  // Handle IP updates
  handleIPUpdate(ipInfo) {
    if (this.isAnimating || this.networkState.updatePending) return;

    this.networkState.updatePending = true;
    requestAnimationFrame(() => {
      try {
        // Update card content with smooth transitions
        Object.entries(ipInfo).forEach(([type, ip]) => {
          const card = document.querySelector(`[data-card="${type}"]`);
          if (!card) return;

          const ipDisplay = card.querySelector('.ip-display');
          if (ipDisplay) {
            // Prepare for update animation
            ipDisplay.style.transition = `opacity ${this.revSliderConfig.animationDuration * 0.3}ms ${this.revSliderConfig.easing}`;
            ipDisplay.classList.add('updating');

            // Update content with animation
            setTimeout(() => {
              ipDisplay.textContent = ip || 'Not available';
              ipDisplay.classList.remove('updating');
              // Clean up
              setTimeout(() => {
                ipDisplay.style.transition = '';
              }, this.revSliderConfig.animationDuration * 0.3);
            }, 150);
          }
        });

        // Update timestamp with animation
        this.updateTimestamp();
        
        // Reset error state
        this.clearErrorState();
        this.networkState.retryCount = 0;
      } catch (error) {
        console.error('Error updating IP information:', error);
        this.handleUpdateError(error);
      } finally {
        this.networkState.updatePending = false;
        this.networkState.lastUpdate = Date.now();
      }
    });
  }

  // Update timestamp with animation
  updateTimestamp() {
    const lastUpdateTime = document.getElementById('lastUpdateTime');
    if (lastUpdateTime) {
      lastUpdateTime.classList.add('updating');
      setTimeout(() => {
        lastUpdateTime.textContent = new Date().toLocaleTimeString();
        lastUpdateTime.classList.remove('updating');
      }, 150);
    }
  }

  // Handle update errors
  handleUpdateError(error) {
    this.networkState.retryCount++;
    if (this.networkState.retryCount <= this.revSliderConfig.network.maxRetries) {
      setTimeout(() => this.retryIPUpdates(), 
        this.revSliderConfig.network.retryInterval * this.networkState.retryCount);
    } else {
      this.setErrorState(error.message);
    }
  }

  // Set error state with collapsible stack trace
  setErrorState(error) {
    clearTimeout(this.networkState.errorTimeout);
    this.networkState.errorTimeout = setTimeout(() => {
      this.cards.forEach(card => card.classList.add('error'));
      
      // Remove any existing error message
      const existingError = this.slider.querySelector('.error-message');
      if (existingError) {
        existingError.remove();
      }

      // Create error container
      const errorContainer = document.createElement('div');
      errorContainer.className = 'error-message';

      // Create error header
      const errorHeader = document.createElement('div');
      errorHeader.className = 'error-header';
      
      // Create error title with icon
      const errorTitle = document.createElement('div');
      errorTitle.className = 'error-title';
      errorTitle.innerHTML = `<span>⚠️</span> ${error.message || (typeof error === 'string' ? error : 'An error occurred')}`;
      
      // Create toggle button
      const errorToggle = document.createElement('div');
      errorToggle.className = 'error-toggle';
      errorToggle.textContent = 'Show details';
      
      // Create stack trace container
      const stackTrace = document.createElement('div');
      stackTrace.className = 'stack-trace';
      
      // Add stack trace content
      if (error.stack) {
        const stackLines = error.stack.split('\n');
        stackLines.forEach((line, index) => {
          const lineElement = document.createElement('div');
          lineElement.className = 'stack-trace-line' + (index === 0 ? ' error' : '');
          lineElement.textContent = line;
          stackTrace.appendChild(lineElement);
        });
      } else {
        const lineElement = document.createElement('div');
        lineElement.className = 'stack-trace-line';
        lineElement.textContent = 'No stack trace available';
        stackTrace.appendChild(lineElement);
      }

      // Add click handler for toggling
      errorHeader.addEventListener('click', () => {
        stackTrace.classList.toggle('expanded');
        errorToggle.textContent = stackTrace.classList.contains('expanded') ? 'Hide details' : 'Show details';
      });

      // Assemble the error message
      errorHeader.appendChild(errorTitle);
      errorHeader.appendChild(errorToggle);
      errorContainer.appendChild(errorHeader);
      errorContainer.appendChild(stackTrace);
      this.slider.appendChild(errorContainer);
    }, this.revSliderConfig.network.errorTimeout);
  }

  // Clear error state
  clearErrorState() {
    clearTimeout(this.networkState.errorTimeout);
    this.cards.forEach(card => card.classList.remove('error'));
    const errorMessage = this.slider.querySelector('.error-message');
    if (errorMessage) {
      errorMessage.remove();
    }
  }

  // Retry IP updates
  retryIPUpdates() {
    if (!navigator.onLine) return;
    if (Date.now() - (this.networkState.lastUpdate || 0) < this.revSliderConfig.network.updateThrottle) return;
    
    chrome.runtime.sendMessage({ action: 'refreshStatus' }, (response) => {
      if (!response || !response.success) {
        this.handleUpdateError(new Error('Failed to refresh status'));
      }
    });
  }

  initializeRevSlider() {
    if (!this.slider) return;

    // Add RevSlider classes
    this.slider.classList.add('rev-slider');
    this.cards.forEach(card => card.classList.add('rev-slide'));

    // Set initial state
    this.updateSlidePositions();

    // Initialize autoplay if enabled
    if (this.revSliderConfig.autoplay?.enabled) {
      // Set initial state attribute
      this.slider.setAttribute('data-autoplay', 'inactive');
      
      // Start autoplay with initial delay
      setTimeout(() => {
        this.slider.setAttribute('data-autoplay', 'active');
        this.startAutoplay();
      }, this.revSliderConfig.startDelay);
      
      // Add autoplay-specific transition styles
      this.cards.forEach(card => {
        card.style.transition = `all ${this.revSliderConfig.autoplay.transitionDuration}ms cubic-bezier(0.4, 0.0, 0.2, 1)`;
      });
    }
  }

  setupEventListeners() {
    if (!this.slider) return;

    // Store event listener references for cleanup
    this.eventListeners = {
      touchstart: (e) => {
        this.touchStartX = e.touches[0].clientX;
        if (this.revSliderConfig.autoplay?.pauseOnTouch) {
          this.pauseAutoplay();
        }
      },
      touchmove: (e) => {
        if (this.isAnimating) return;
        this.touchEndX = e.touches[0].clientX;
        
        // Calculate swipe distance
        const swipeDistance = this.touchStartX - this.touchEndX;
        const threshold = this.slider.offsetWidth * 0.2; // 20% of slider width
        
        if (Math.abs(swipeDistance) > threshold) {
          e.preventDefault(); // Prevent page scroll
        }
      },
      touchend: () => {
        if (!this.isAnimating) {
          this.handleSwipe();
        }
        if (this.revSliderConfig.autoplay?.resumeOnLeave) {
          this.resumeAutoplay();
        }
      },
      mouseenter: () => {
        if (this.revSliderConfig.autoplay?.pauseOnHover) {
          this.pauseAutoplay();
        }
      },
      mouseleave: () => {
        if (this.revSliderConfig.autoplay?.resumeOnLeave) {
          this.resumeAutoplay();
        }
      }
    };

    // Add touch events
    this.slider.addEventListener('touchstart', this.eventListeners.touchstart);
    this.slider.addEventListener('touchmove', this.eventListeners.touchmove);
    this.slider.addEventListener('touchend', this.eventListeners.touchend);

    // Add mouse interaction for autoplay control
    if (this.revSliderConfig.autoplay?.enabled) {
      if (this.revSliderConfig.autoplay.pauseOnHover) {
        this.slider.addEventListener('mouseenter', this.eventListeners.mouseenter);
      }
      if (this.revSliderConfig.autoplay.resumeOnLeave) {
        this.slider.addEventListener('mouseleave', this.eventListeners.mouseleave);
      }
    }

    // Navigation dots with stored references
    this.dots.forEach((dot, index) => {
      const clickHandler = () => {
        if (!this.isAnimating) {
          this.goToSlide(index);
          // Handle autoplay pause on interaction
          if (this.revSliderConfig.autoplay?.pauseOnInteraction) {
            this.pauseAutoplay();
            if (this.revSliderConfig.autoplay.resumeOnLeave) {
              setTimeout(() => this.resumeAutoplay(), this.revSliderConfig.autoplay.restartDelay || 2000);
            }
          }
        }
      };
      dot.addEventListener('click', clickHandler);
      // Store handler reference for cleanup
      dot._clickHandler = clickHandler;
    });
  }

  // Add cleanup method
  cleanup() {
    if (!this.slider) return;

    // Remove all event listeners
    this.slider.removeEventListener('touchstart', this.eventListeners.touchstart);
    this.slider.removeEventListener('touchmove', this.eventListeners.touchmove);
    this.slider.removeEventListener('touchend', this.eventListeners.touchend);
    this.slider.removeEventListener('mouseenter', this.eventListeners.mouseenter);
    this.slider.removeEventListener('mouseleave', this.eventListeners.mouseleave);

    // Remove dot click handlers
    this.dots.forEach(dot => {
      if (dot._clickHandler) {
        dot.removeEventListener('click', dot._clickHandler);
        delete dot._clickHandler;
      }
    });

    // Clear autoplay interval
    if (this.autoplayInterval) {
      clearInterval(this.autoplayInterval);
      this.autoplayInterval = null;
    }
  }

  handleSwipe() {
    const swipeDistance = this.touchStartX - this.touchEndX;
    const threshold = this.slider.offsetWidth * 0.2; // 20% of slider width

    if (Math.abs(swipeDistance) > threshold) {
      if (swipeDistance > 0) {
        this.nextSlide('next');
      } else {
        this.previousSlide('prev');
      }
    } else {
      // Return to current slide if swipe wasn't far enough
      this.goToSlide(this.currentSlide);
    }
  }

  initializeIPUpdates() {
    // Set up IP update interval
    this.updateIPs();
    setInterval(() => this.updateIPs(), 5000); // Update every 5 seconds
  }

  // Update network status UI
  updateNetworkStatusUI(isOnline) {
    const statusElement = document.getElementById('networkStatus') || 
                         document.createElement('div');
    
    if (!statusElement.id) {
      statusElement.id = 'networkStatus';
      statusElement.className = 'network-status';
      const container = document.querySelector('.container');
      container.insertBefore(statusElement, container.firstChild);
    }

    statusElement.className = `network-status ${isOnline ? 'status-online' : 'status-offline'}`;
    statusElement.textContent = isOnline ? 'Online' : 'Offline';
  }

  async updateIPs() {
    const retryDelay = 2000; // Base retry delay of 2 seconds
    let retryAttempt = 0;
    const maxRetries = 3;

    try {
      // Check network connectivity
      if (!navigator.onLine) {
        this.loadCachedIPData();
        return;
      }

      // Show loading state for all cards
      ['public', 'docker', 'non-private', 'private'].forEach(cardId => {
        const card = document.querySelector(`[data-card="${cardId}"]`);
        if (card) {
          card.classList.add('loading');
          card.classList.remove('error');
        }
      });

      // Update all IPs concurrently
      const [publicIP, privateIPs] = await Promise.all([
        getPublicIP(),
        getAllPrivateIPs()
      ]);

      // Update cards with new data
      this.updateCard('public', {
        ip: formatIP(publicIP),
        details: ['External Access']
      });

      if (privateIPs.docker) {
        this.updateCard('docker', {
          ip: formatIP(privateIPs.docker),
          details: ['Docker Network']
        });
      } else {
        this.updateCard('docker', {
          ip: 'No Docker network',
          details: ['Not detected']
        });
      }

      if (privateIPs.nonPrivate) {
        this.updateCard('non-private', {
          ip: formatIP(privateIPs.nonPrivate),
          details: ['External Network']
        });
      } else {
        this.updateCard('non-private', {
          ip: 'No external IP',
          details: ['Not detected']
        });
      }

      if (privateIPs.private) {
        this.updateCard('private', {
          ip: formatIP(privateIPs.private),
          details: ['Internal Network']
        });
      } else {
        this.updateCard('private', {
          ip: 'No private IP',
          details: ['Not detected']
        });
      }

      // Update timestamp with animation
      const lastUpdateTime = document.getElementById('lastUpdateTime');
      if (lastUpdateTime) {
        lastUpdateTime.classList.add('updating');
        lastUpdateTime.textContent = new Date().toLocaleTimeString();
        setTimeout(() => lastUpdateTime.classList.remove('updating'), 300);
      }

    } catch (error) {
      console.error('Error updating IPs:', error);
      // Pass the full error object to setErrorState
      this.setErrorState(error);
      // Update cards to show error state
      ['public', 'docker', 'non-private', 'private'].forEach(cardId => {
        this.updateCard(cardId, {
          ip: 'Error fetching IP',
          details: ['Connection error']
        });
      });
    } finally {
      // Remove loading state from all cards
      ['public', 'docker', 'non-private', 'private'].forEach(cardId => {
        const card = document.querySelector(`[data-card="${cardId}"]`);
        if (card) card.classList.remove('loading');
      });
    }
  }

  async updatePublicIP() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      document.getElementById('publicIP').textContent = data.ip;
    } catch (error) {
      const publicIPElement = document.getElementById('publicIP');
      if (publicIPElement) {
        publicIPElement.textContent = 'Error fetching IP';
        publicIPElement.classList.add('error');
      }

      // Implement exponential backoff for retries
      if (retryAttempt < maxRetries && navigator.onLine) {
        const currentDelay = retryDelay * Math.pow(2, retryAttempt);
        retryAttempt++;
        
        setTimeout(() => {
          this.updateIPs();
        }, currentDelay);
      } else {
        this.loadCachedIPData();
      }
    }
  }

  async updateDockerIP() {
    try {
      const response = await fetch('/api/docker/ip');
      const data = await response.json();
      document.getElementById('dockerIP').textContent = data.ip || 'No Docker network';
    } catch (error) {
      document.getElementById('dockerIP').textContent = 'Not available';
    }
  }

  async updateLocalIP() {
    try {
      const response = await fetch('/api/local/ip');
      const data = await response.json();
      document.getElementById('nonPrivateIP').textContent = data.external || 'Not available';
      document.getElementById('privateIP').textContent = data.internal || 'Not available';
    } catch (error) {
      document.getElementById('nonPrivateIP').textContent = 'Error';
      document.getElementById('privateIP').textContent = 'Error';
    }
  }

  goToSlide(index, direction = 'next') {
    if (this.isAnimating || index === this.currentSlide) return;
    
    this.isAnimating = true;
    const previousSlide = this.currentSlide;
    this.currentSlide = index;

    // Pause autoplay during transition
    if (this.autoplayInterval) {
      clearInterval(this.autoplayInterval);
      this.autoplayInterval = null;
    }

    // Prepare cards for transition
    this.cards.forEach((card, i) => {
      // Remove existing transition classes
      card.classList.remove('rev-slide-active', 'rev-slide-next', 'rev-slide-prev');
      
      // Set up transition
      const transition = `
        transform ${this.revSliderConfig.animationDuration}ms ${this.revSliderConfig.easing},
        opacity ${this.revSliderConfig.animationDuration}ms ${this.revSliderConfig.easing},
        z-index ${this.revSliderConfig.slidePause}ms linear
      `;
      card.style.transition = transition;
      
      if (i === previousSlide) {
        // Current slide moves out
        card.classList.add(direction === 'next' ? 'rev-slide-prev' : 'rev-slide-next');
        card.style.zIndex = '1';
      } else if (i === index) {
        // New slide moves in
        card.classList.add('rev-slide-active');
        card.style.zIndex = '2';
      } else {
        // Other slides
        card.classList.add(i > index ? 'rev-slide-next' : 'rev-slide-prev');
        card.style.zIndex = '0';
      }
    });

    // Update slider position with enhanced transition
    const offset = index * -100;
    requestAnimationFrame(() => {
      this.slider.style.transform = `translateX(${offset}%)`;
      this.slider.style.transition = `transform ${this.revSliderConfig.animationDuration}ms ${this.revSliderConfig.easing}`;
    });
    
    // Update navigation dots
    this.updateDots();

    // Handle transition completion
    const transitionEnd = () => {
      // Reset animation states
      this.isAnimating = false;
      this.cards.forEach(card => {
        card.style.transition = '';
        card.style.zIndex = '';
      });
      
      // Update positions for infinite loop
      if (this.revSliderConfig.loop) {
        this.updateSlidePositions();
      }
      
      // Resume autoplay after a brief pause
      if (!this.isPaused && this.revSliderConfig.autoplay) {
        setTimeout(() => {
          this.startAutoplay();
        }, this.revSliderConfig.slidePause);
      }

      // Remove transition end listener
      this.slider.removeEventListener('transitionend', transitionEnd);
    };

    // Listen for transition completion
    this.slider.addEventListener('transitionend', transitionEnd);

    // Fallback timeout in case transition event doesn't fire
    setTimeout(transitionEnd, this.revSliderConfig.animationDuration + 100);
  }

  nextSlide(direction = 'next') {
    if (this.isAnimating) return;
    const nextIndex = (this.currentSlide + 1) % this.cards.length;
    this.goToSlide(nextIndex, direction);
  }

  previousSlide(direction = 'prev') {
    if (this.isAnimating) return;
    const prevIndex = (this.currentSlide - 1 + this.cards.length) % this.cards.length;
    this.goToSlide(prevIndex, direction);
  }

  updateDots() {
    this.dots.forEach((dot, index) => {
      const isActive = index === this.currentSlide;
      dot.classList.toggle('active', isActive);
      
      // Add smooth transition for dots
      dot.style.transition = 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';
      dot.style.transform = isActive ? 'scale(1.2)' : 'scale(1)';
      dot.style.opacity = isActive ? '1' : '0.6';
      
      // Clean up transition after animation
      setTimeout(() => {
        dot.style.transition = '';
      }, 300);
    });
  }

  startAutoplay() {
    if (!this.revSliderConfig.autoplay?.enabled || this.autoplayInterval || this.isPaused) return;
    
    // Clear any existing interval
    clearInterval(this.autoplayInterval);
    
    // Set data attribute for CSS transitions
    if (this.slider) {
      this.slider.setAttribute('data-autoplay', 'active');
    }
    
    // Start the autoplay interval
    this.autoplayInterval = setInterval(() => {
      if (!this.isAnimating && !this.isPaused) {
        this.nextSlide('next');
        
        // Trigger smooth transition animation
        requestAnimationFrame(() => {
          this.cards.forEach(card => {
            card.style.transition = `all ${this.revSliderConfig.autoplay.transitionDuration}ms cubic-bezier(0.4, 0.0, 0.2, 1)`;
          });
        });
      }
    }, this.revSliderConfig.autoplay.delay || this.revSliderConfig.delay);
  }

  pauseAutoplay() {
    if (!this.revSliderConfig.autoplay?.enabled) return;
    
    this.isPaused = true;
    
    // Update slider state
    if (this.slider) {
      this.slider.setAttribute('data-autoplay', 'paused');
    }
    
    // Clear the interval
    if (this.autoplayInterval) {
      clearInterval(this.autoplayInterval);
      this.autoplayInterval = null;
    }
  }

  resumeAutoplay() {
    if (!this.revSliderConfig.autoplay?.enabled) return;
    
    // Add delay before resuming
    setTimeout(() => {
      if (!this.isPaused) {
        this.isPaused = false;
        
        // Update slider state
        if (this.slider) {
          this.slider.setAttribute('data-autoplay', 'active');
        }
        
        // Restart autoplay
        this.startAutoplay();
      }
    }, this.revSliderConfig.autoplay.restartDelay || 2000);
  }

  updateSlidePositions() {
    // Use requestAnimationFrame for smoother animations
    requestAnimationFrame(() => {
      this.cards.forEach((card, index) => {
        // Optimized transition timing
        // Optimized transition timing
        const transition = `
          transform ${this.revSliderConfig.animationDuration}ms ${this.revSliderConfig.easing},
          opacity ${this.revSliderConfig.animationDuration * 0.4}ms ${this.revSliderConfig.easing},
          z-index 0ms linear ${this.revSliderConfig.animationDuration * 0.2}ms
        `.trim();

        // Enable hardware acceleration
        card.style.transform = 'translate3d(0,0,0)';
        card.style.backfaceVisibility = this.revSliderConfig.hardware.backfaceVisibility;
        if (this.revSliderConfig.hardware.renderingMode === 'high-performance') {
          card.style.translate = 'none';
          card.style.rotate = 'none';
          card.style.scale = 'none';
        }
        
        // Enable hardware acceleration
        card.style.transition = transition;
        card.style.willChange = 'transform, opacity';
        card.style.backfaceVisibility = 'hidden';
        
        // Remove existing classes for clean state
        card.classList.remove('rev-slide-active', 'rev-slide-next', 'rev-slide-prev');
        if (index === this.currentSlide) {
          // Active slide with optimized positioning
          card.classList.add('rev-slide-active');
          card.style.zIndex = this.revSliderConfig.zIndex.active;
          card.style.opacity = '1';
          card.style.transform = `
            translateX(0)
            scale(${this.revSliderConfig.scale.active})
            translateZ(0)
            perspective(1000px)
          `.trim();
        } else {
          // Non-active slides with enhanced positioning
          const isNext = index > this.currentSlide;
          card.classList.add(isNext ? 'rev-slide-next' : 'rev-slide-prev');
          card.style.zIndex = this.revSliderConfig.zIndex.inactive;
          card.style.opacity = '0';
          card.style.transform = `
            translateX(${isNext ? '100%' : '-100%'})
            scale(${this.revSliderConfig.scale.inactive})
            translateZ(0)
            perspective(1000px)
            ${isNext ? 'rotateY(-5deg)' : 'rotateY(5deg)'}
          `.trim();
        }

        // Schedule cleanup of performance properties
        setTimeout(() => {
          this.cards.forEach(card => {
            card.style.willChange = 'auto';
            card.style.backfaceVisibility = 'visible';
            card.style.perspective = 'none';
          });
        }, this.revSliderConfig.animationDuration + this.revSliderConfig.animation.cleanup);
      });

      // Update navigation dots with animation
      this.updateDots();
    });

    // Update navigation dots with animation
    this.updateDots();

    // Synchronize IP updates with slide transitions
    if (!this.isPaused && this.revSliderConfig.updateInterval) {
      clearTimeout(this._updateIPTimeout);
      this._updateIPTimeout = setTimeout(() => {
        this.updateIPs();
      }, this.revSliderConfig.updateInterval);
    }
    
    // Schedule cleanup of transition properties
    setTimeout(() => {
      this.cards.forEach(card => {
        card.style.transition = '';
        card.style.willChange = 'auto';
      });
    }, this.revSliderConfig.animationDuration + 100);
  }

  updateCard(cardId, data) {
    const card = document.querySelector(`[data-card="${cardId}"]`);
    if (!card) return;

    const ipDisplay = card.querySelector('.ip-display');
    const details = card.querySelectorAll('.detail-value');
    
    if (ipDisplay) {
      // Add update animation class
      ipDisplay.classList.add('updating');
      
      // Update the IP with smooth transition
      setTimeout(() => {
        ipDisplay.textContent = data.ip || 'Not available';
        ipDisplay.classList.remove('updating');
      }, 150);
    }

    // Update details with staggered animation
    if (data.details && details.length) {
      details.forEach((detail, index) => {
        detail.classList.add('updating');
        setTimeout(() => {
          detail.textContent = data.details[index] || '';
          detail.classList.remove('updating');
        }, 150 + (index * 50)); // Stagger updates by 50ms
      });
    }

    // Update card status
    if (data.ip === 'Error fetching IP') {
      card.classList.add('error');
    } else {
      card.classList.remove('error');
    }

    // Update additional details if provided
    if (data.details && details.length) {
      details.forEach((detail, index) => {
        if (data.details[index]) {
          detail.textContent = data.details[index];
        }
      });
    }
  }
}

// Modified updateIPAddresses function to work with the new UI
async function updateIPAddresses() {
  // Update last refresh time
  const lastUpdateTime = document.getElementById('lastUpdateTime');
  if (lastUpdateTime) {
    lastUpdateTime.textContent = new Date().toLocaleTimeString();
  }

  try {
    // Get all IP addresses
    const [publicIP, privateIPs] = await Promise.all([
      getPublicIP(),
      getAllPrivateIPs()
    ]);

    // Update public IP card
    networkMonitor.updateCard('public', {
      ip: formatIP(publicIP),
      details: ['Fetching...', 'Fetching...'] // Location and ISP to be implemented
    });

    // Update Docker IP card
    networkMonitor.updateCard('docker', {
      ip: privateIPs.docker ? formatIP(privateIPs.docker) : 'None detected',
      details: [privateIPs.docker ? 'docker0' : 'No Docker network detected']
    });

    // Update Non-Private IP card
    networkMonitor.updateCard('non-private', {
      ip: privateIPs.nonPrivate ? formatIP(privateIPs.nonPrivate) : 'None detected',
      details: [privateIPs.nonPrivate ? 'External Network' : 'No external network detected']
    });

    // Update Private IP card
    networkMonitor.updateCard('private', {
      ip: privateIPs.private ? formatIP(privateIPs.private) : 'None detected',
      details: [privateIPs.private ? 'Internal Network' : 'No internal network detected']
    });

  } catch (error) {
    console.error('Error updating IP addresses:', error);
    // Update cards to show error state
    ['public', 'docker', 'non-private', 'private'].forEach(cardId => {
      networkMonitor.updateCard(cardId, {
        ip: 'Error fetching IP',
        details: ['Connection error']
      });
    });
  }
}

// Initialize NetworkMonitor when document loads
let networkMonitor = null;

// Document ready handler
document.addEventListener('DOMContentLoaded', async function() {
  // Get UI elements
  const statusIcon = document.getElementById('statusIcon');
  const statusText = document.getElementById('statusText');
  const statusDescription = document.getElementById('statusDescription');
  const protectionToggle = document.getElementById('protectionToggle');
  const refreshBtn = document.getElementById('refreshBtn');
  const cloudName = document.getElementById('cloudName');
  const userName = document.getElementById('userName');

  // Initialize NetworkMonitor
  networkMonitor = new NetworkMonitor();

  // Initialize popup with current state
  await initializePopup();

  // Add event listeners
  protectionToggle?.addEventListener('change', toggleProtection);
  refreshBtn?.addEventListener('click', refreshStatus);

  // Set up periodic IP updates (every 30 seconds)
  setInterval(updateIPAddresses, 30000);
});

// Keep all the existing functions from the original file
async function initializePopup() {
    try {
        // Get all relevant storage data
        const result = await new Promise(resolve => {
            chrome.storage.local.get([
                'protectionEnabled', 
                'statusType', 
                'cloudName', 
                'userName', 
                'portalURL', 
                'portalEmail',
                'portalLoginStatus',
                'portalStatusTimestamp',
                'portalSettings',
                'portalSettingsTimestamp',
                'partnerPortalURL',
                'partnerPortalEmail',
                'partnerPortalLoginStatus'
            ], resolve);
    });
      
    const enabled = result.protectionEnabled !== undefined ? result.protectionEnabled : true;
    const status = result.statusType || 'protected';
    
    updateUI(enabled, status);
    
    // Set toggle state
    protectionToggle.checked = enabled;
    
    // Set cloud and user info
    if (result.cloudName) {
      cloudName.textContent = result.cloudName;
    }
    
    if (result.userName) {
      userName.textContent = result.userName;
    }
    
    // Update portal UI
    if (result.portalURL) {
      portalURLInput.value = result.portalURL;
    }
    
    if (result.portalEmail) {
      portalEmailInput.value = result.portalEmail;
    }
    
    // Update partner portal UI
    if (result.partnerPortalURL) {
      partnerPortalURLInput.value = result.partnerPortalURL;
    }
    
    if (result.partnerPortalEmail) {
      partnerPortalEmailInput.value = result.partnerPortalEmail;
    }
    
    // Check if cached portal status is still valid (5 minutes)
    const isCacheValid = result.portalStatusTimestamp && 
                        (Date.now() - result.portalStatusTimestamp < 300000);
    
    // Update portal statuses
    updatePortalStatusUI(result.portalLoginStatus || false, isCacheValid);
    updatePartnerPortalStatusUI(result.partnerPortalLoginStatus || false);
    
    // Update IP addresses - catch any errors to prevent initialization failure
    try {
        await updateIPAddresses();
    } catch (error) {
        console.error('Error updating IP addresses during initialization:', error);
    }
    
    // Initialize network status monitoring
    window.addEventListener('online', async () => {
        // When coming back online, retry portal status checks
        try {
            await checkPortalStatus();
            await checkPartnerPortalStatus();
        } catch (error) {
            console.error('Error checking portal statuses after coming online:', error);
        }
    });

    window.addEventListener('offline', () => {
        // When going offline, update UI accordingly
        portalStatusText.textContent = API_CONFIG.errorMessages.offline;
        partnerPortalStatusText.textContent = API_CONFIG.errorMessages.offline;
    });

    // Initial portal status checks
    try {
        if (navigator.onLine) {
            await Promise.allSettled([
                checkPortalStatus(),
                checkPartnerPortalStatus()
            ]);
        } else {
            // If offline, use cached data
            const isCacheValid = result.portalStatusTimestamp && 
                               (Date.now() - result.portalStatusTimestamp < API_CONFIG.cacheExpiry);
            
            if (isCacheValid) {
                updatePortalStatusUI(result.portalLoginStatus, true);
                updatePartnerPortalStatusUI(result.partnerPortalLoginStatus, true);
            }
            
            portalStatusText.textContent = API_CONFIG.errorMessages.offline;
            partnerPortalStatusText.textContent = API_CONFIG.errorMessages.offline;
        }
    } catch (error) {
        console.error('Error during portal status initialization:', error);
        // Continue initialization despite portal check failures
    }
  }
  
  // Function to toggle protection
  async function toggleProtection() {
    const enabled = protectionToggle.checked;
    
    try {
      // Send message to background script and wait for response
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'toggleProtection',
          enabled: enabled
        }, resolve);
      });
      
      if (response && response.success) {
        updateUI(enabled, response.statusType);
      } else {
        // Handle error
        console.error('Failed to toggle protection');
        // Revert toggle if operation failed
        protectionToggle.checked = !enabled;
      }
    } catch (error) {
      console.error('Error toggling protection:', error);
      // Revert toggle on error
      protectionToggle.checked = !enabled;
    }
  }
  
  // Function to refresh status
  async function refreshStatus() {
    // Disable refresh button temporarily
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing...';
    
    try {
      // Send message to background script and wait for response
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'refreshStatus'
        }, resolve);
      });

      if (response && response.success) {
        updateUI(response.enabled, response.statusType);
        
        // Update toggle state
        protectionToggle.checked = response.enabled;
        
        // Update IP addresses
        await updateIPAddresses();
        
        // Check portal status
        await checkPortalStatus();
      } else {
        // Handle error
        console.error('Failed to refresh status');
      }
    } catch (error) {
      console.error('Error refreshing status:', error);
    } finally {
      // Re-enable refresh button
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh Status';
    }
  }
  
  // Function to update UI based on state
  function updateUI(enabled, statusType) {
    // Update status icon
    if (enabled) {
      if (statusType === 'error') {
        statusIcon.src = '../icons/icon-enabled-error-48.png';
        statusText.textContent = 'Error';
        statusDescription.textContent = 'Zscaler is experiencing issues. Please try again later.';
      } else if (statusType === 'alert') {
        statusIcon.src = '../icons/icon-enabled-alert-48.png';
        statusText.textContent = 'Warning';
        statusDescription.textContent = 'Zscaler protection is active but has some warnings.';
      } else {
        statusIcon.src = '../icons/icon-enabled-48.png';
        statusText.textContent = 'Protected';
        statusDescription.textContent = 'Your internet traffic is being protected by Zscaler.';
      }
    } else {
      if (statusType === 'error') {
        statusIcon.src = '../icons/icon-disabled-error-48.png';
        statusText.textContent = 'Disabled (Error)';
        statusDescription.textContent = 'Zscaler protection is disabled with errors.';
      } else {
        statusIcon.src = '../icons/icon-disabled-48.png';
        statusText.textContent = 'Not Protected';
        statusDescription.textContent = 'Zscaler protection is currently disabled.';
      }
    }
    
    // Update container class for styling
    document.body.className = enabled ? 
      (statusType === 'error' ? 'status-error' : (statusType === 'alert' ? 'status-alert' : 'status-protected')) : 
      'status-disabled';
  }
});

// IP validation functions
function isValidIPv4(ip) {
  // Regular expression for IPv4 validation
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ip)) return false;
  
  // Check each octet
  const octets = ip.split('.');
  return octets.every(octet => {
    const num = parseInt(octet, 10);
    return num >= 0 && num <= 255;
  });
}

function isValidIPv6(ip) {
  // Regular expression for IPv6 validation
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^::1$|^([0-9a-fA-F]{1,4}:){1,7}:$|^([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}$|^([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}$|^([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}$|^([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})$|^:((:[0-9a-fA-F]{1,4}){1,7}|:)$/;
  return ipv6Regex.test(ip);
}

function validateIP(ip) {
  if (!ip || ip === 'Not available') return 'Not available';
  
  // Remove any surrounding whitespace
  ip = ip.trim();
  
  // Check for IPv4
  if (isValidIPv4(ip)) {
    return ip;
  }
  
  // Check for IPv6
  if (isValidIPv6(ip)) {
    return ip;
  }
  
  // If neither IPv4 nor IPv6, return error
  console.error('Invalid IP address:', ip);
  return 'Invalid IP';
}

// Add IP format display helper
function formatIP(ip) {
  if (!ip || ip === 'Not available' || ip === 'Invalid IP') return ip;
  
  // If IPv6, add brackets for better readability
  if (ip.includes(':')) {
    return `[${ip}]`;
  }
  
  return ip;
}

// Function to get public IP
async function getPublicIP() {
  const maxRetries = 3;
  let retryCount = 0;
  let lastError = null;

  while (retryCount < maxRetries) {
    try {
      // Check network connectivity
      if (!navigator.onLine) {
        throw new Error('Network is offline');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://api.ipify.org?format=json', {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const ip = validateIP(data.ip);

      // Cache successful response
      if (ip !== 'Not available') {
        try {
          await chrome.storage.local.set({
            'cachedPublicIP': {
              ip: ip,
              timestamp: Date.now()
            }
          });
        } catch (cacheError) {
          console.warn('Failed to cache IP:', cacheError);
        }
      }

      return ip;

    } catch (error) {
      lastError = error;
      console.error(`Error fetching public IP (attempt ${retryCount + 1}):`, error);

      // Don't retry on abort or offline
      if (error.name === 'AbortError' || error.message === 'Network is offline') {
        break;
      }

      retryCount++;
      if (retryCount < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
      }
    }
  }

  // Try to get cached IP if available
  try {
    const cache = await chrome.storage.local.get('cachedPublicIP');
    if (cache.cachedPublicIP && 
        Date.now() - cache.cachedPublicIP.timestamp < 300000) { // 5 minutes cache
      return cache.cachedPublicIP.ip;
    }
  } catch (cacheError) {
    console.warn('Failed to read cached IP:', cacheError);
  }

  console.error('All attempts to fetch public IP failed:', lastError);
  return 'Not available';
}

// Function to get all private IPs categorized by type
async function getAllPrivateIPs() {
  try {
    // First try using native messaging host (which uses ifconfig)
    try {
      // Get all interfaces from native host
      const allIPs = await getAllIPsWithNativeHost();
      return categorizeIPs(allIPs);
    } catch (nativeHostError) {
      console.warn("Native host error, falling back to system.network API:", nativeHostError);
      
      // If native messaging fails, try system.network API
      if (chrome.system && chrome.system.network && chrome.system.network.getNetworkInterfaces) {
        return new Promise((resolve) => {
          chrome.system.network.getNetworkInterfaces((interfaces) => {
            // Filter out loopback and non-IPv4 addresses
            const validInterfaces = interfaces.filter(iface => 
              iface.address && 
              iface.address.indexOf(':') === -1 && // Not IPv6
              !iface.address.startsWith('127.') &&  // Not loopback
              !iface.address.startsWith('169.254.') // Not link-local
            );
            
            if (validInterfaces.length > 0) {
              const allIPs = validInterfaces.map(iface => iface.address);
              resolve(categorizeIPs(allIPs));
            } else {
              // Fallback to WebRTC method
              getAllIPsWithWebRTC().then(ips => resolve(categorizeIPs(ips)));
            }
          });
        });
      } else {
        // If system.network is not available, fall back to WebRTC
        console.warn("system.network API not available, falling back to WebRTC");
        const ips = await getAllIPsWithWebRTC();
        return categorizeIPs(ips);
      }
    }
  } catch (error) {
    console.error('Error getting private IPs:', error);
    return {
      docker: null,
      nonPrivate: null,
      private: null
    };
  }
}

// For backward compatibility - get a single preferred private IP
async function getPrivateIP() {
  const allIPs = await getAllPrivateIPs();
  
  // Prefer non-private IP, then private IP, then Docker IP
  return allIPs.nonPrivate || allIPs.private || allIPs.docker || 'Not available';
}

// Function to get all IPs using native messaging host
function getAllIPsWithNativeHost() {
  return new Promise((resolve, reject) => {
    try {
      // Connect to native messaging host
      const port = chrome.runtime.connectNative('com.zscaler.native_host');
      
      // Set up message listener
      port.onMessage.addListener((response) => {
        if (response.success && response.ips && Array.isArray(response.ips)) {
          // Validate each IP
          const validIPs = response.ips.map(ip => validateIP(ip)).filter(ip => ip !== 'Invalid IP');
          resolve(validIPs);
        } else if (response.success && response.ip) {
          // For backward compatibility if the host returns a single IP
          resolve([validateIP(response.ip)]);
        } else {
          reject(new Error(response.error || 'Failed to get IPs from native host'));
        }
        
        // Disconnect from native host
        port.disconnect();
      });
      
      // Set up disconnect listener
      port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Native host disconnected: ${chrome.runtime.lastError.message}`));
        }
      });
      
      // Send request to native host
      port.postMessage({ action: 'getAllIPs' });
      
      // Set timeout
      setTimeout(() => {
        if (port) {
          port.disconnect();
          reject(new Error('Timeout waiting for native host response'));
        }
      }, 5000);
    } catch (error) {
      reject(error);
    }
  });
}

// For backward compatibility
function getPrivateIPWithNativeHost() {
  return new Promise((resolve, reject) => {
    getAllIPsWithNativeHost()
      .then(ips => {
        if (ips && ips.length > 0) {
          // Prefer non-private IP
          const nonPrivateIP = ips.find(ip => 
            !ip.startsWith('10.') && 
            !ip.startsWith('172.16.') &&
            !ip.startsWith('172.17.') &&
            !ip.startsWith('172.18.') &&
            !ip.startsWith('172.19.') &&
            !ip.startsWith('172.2') &&
            !ip.startsWith('172.30.') &&
            !ip.startsWith('172.31.') &&
            !ip.startsWith('192.168.')
          );
          
          resolve(nonPrivateIP || ips[0]);
        } else {
          reject(new Error('No valid IPs found'));
        }
      })
      .catch(reject);
  });
}

// Function to get all IPs using WebRTC
function getAllIPsWithWebRTC() {
  return new Promise((resolve) => {
    try {
      // Array to collect IP addresses
      const ipAddresses = [];
      
      // Create RTCPeerConnection with STUN servers to increase reliability
      const rtc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      // Listen for candidate events
      rtc.onicecandidate = (event) => {
        if (!event.candidate) {
          // No more candidates, resolve with all collected IPs
          rtc.close();
          
          if (ipAddresses.length > 0) {
            resolve(ipAddresses.map(ip => validateIP(ip)).filter(ip => ip !== 'Invalid IP'));
          } else {
            resolve([]);
          }
          return;
        }

        // Extract IP from candidate string
        const candidateStr = event.candidate.candidate;
        const ipMatch = /([0-9]{1,3}(\.[0-9]{1,3}){3})/g.exec(candidateStr);

        if (ipMatch && ipMatch[1]) {
          const ip = ipMatch[1];
          // Collect valid IPs (skip loopback and link-local)
          if (!ip.startsWith('127.') && 
              !ip.startsWith('169.254.') && 
              !ipAddresses.includes(ip)) {
            ipAddresses.push(ip);
          }
        }
      };

      // Create data channel and offer to trigger candidates
      rtc.createDataChannel('');
      rtc.createOffer()
        .then(offer => rtc.setLocalDescription(offer))
        .catch(() => resolve([]));

      // Set timeout in case no viable candidates are found
      setTimeout(() => {
        rtc.close();
        if (ipAddresses.length > 0) {
          // Return all collected IPs
          resolve(ipAddresses.map(ip => validateIP(ip)).filter(ip => ip !== 'Invalid IP'));
        } else {
          resolve([]);
        }
      }, 3000);
    } catch (error) {
      console.error('Error getting IPs with WebRTC:', error);
      resolve([]);
    }
  });
}

// For backward compatibility
function getPrivateIPWithWebRTC() {
  return new Promise((resolve) => {
    getAllIPsWithWebRTC()
      .then(ips => {
        if (ips && ips.length > 0) {
          // Prefer non-private IP
          const nonPrivateIP = ips.find(ip => 
            !ip.startsWith('10.') && 
            !ip.startsWith('172.16.') &&
            !ip.startsWith('172.17.') &&
            !ip.startsWith('172.18.') &&
            !ip.startsWith('172.19.') &&
            !ip.startsWith('172.2') &&
            !ip.startsWith('172.30.') &&
            !ip.startsWith('172.31.') &&
            !ip.startsWith('192.168.')
          );
          
          resolve(nonPrivateIP || ips[0]);
        } else {
          resolve('Not available');
        }
      })
      .catch(error => {
        console.error('Error in getPrivateIPWithWebRTC:', error);
        resolve('Not available');
      });
  });
}

// Function to categorize IPs by type
function categorizeIPs(ips) {
  const result = {
    docker: null,
    nonPrivate: null,
    private: null
  };
  
  if (!ips || ips.length === 0) {
    return result;
  }
  
  // Look for Docker IP (172.17.x.x)
  const dockerIP = ips.find(ip => ip.startsWith('172.17.'));
  if (dockerIP) {
    result.docker = dockerIP;
  }
  
  // Look for non-private IP
  const nonPrivateIP = ips.find(ip => 
    !ip.startsWith('10.') && 
    !ip.startsWith('172.16.') &&
    !ip.startsWith('172.17.') &&
    !ip.startsWith('172.18.') &&
    !ip.startsWith('172.19.') &&
    !ip.startsWith('172.2') &&
    !ip.startsWith('172.30.') &&
    !ip.startsWith('172.31.') &&
    !ip.startsWith('192.168.')
  );
  if (nonPrivateIP) {
    result.nonPrivate = nonPrivateIP;
  }
  
  // Look for private IP (10.x.x.x, 172.16.x.x-172.31.x.x except 172.17.x.x, 192.168.x.x)
  const privateIP = ips.find(ip => 
    ip.startsWith('10.') || 
    ip.startsWith('172.16.') ||
    ip.startsWith('172.18.') ||
    ip.startsWith('172.19.') ||
    ip.startsWith('172.2') ||
    ip.startsWith('172.30.') ||
    ip.startsWith('172.31.') ||
    ip.startsWith('192.168.')
  );
  if (privateIP) {
    result.private = privateIP;
  }
  
  return result;
}

// Function to update IP addresses
async function updateIPAddresses() {
  const publicIPElement = document.getElementById('publicIP');
  const dockerIPElement = document.getElementById('dockerIP');
  const nonPrivateIPElement = document.getElementById('nonPrivateIP');
  const privateIPElement = document.getElementById('privateIP');

  // Update public IP
  publicIPElement.textContent = 'Loading...';
  const publicIP = await getPublicIP();
  publicIPElement.textContent = formatIP(publicIP);

  // Set all private IP sections to loading
  dockerIPElement.textContent = 'Loading...';
  nonPrivateIPElement.textContent = 'Loading...';
  privateIPElement.textContent = 'Loading...';

  // Get all private IPs
  const privateIPs = await getAllPrivateIPs();
  
  // Update Docker IP
  if (privateIPs.docker) {
    dockerIPElement.textContent = formatIP(privateIPs.docker);
  } else {
    dockerIPElement.textContent = 'None detected';
  }
  
  // Update non-private IP
  if (privateIPs.nonPrivate) {
    nonPrivateIPElement.textContent = formatIP(privateIPs.nonPrivate);
  } else {
    nonPrivateIPElement.textContent = 'None detected';
  }
  
  // Update private IP
  if (privateIPs.private) {
    privateIPElement.textContent = formatIP(privateIPs.private);
  } else {
    privateIPElement.textContent = 'None detected';
  }
}

// Portal-related functions

// Open company portal in new tab
async function openPortal() {
  try {
    // Disable button temporarily
    portalLoginBtn.disabled = true;
    portalLoginBtn.textContent = 'Opening...';
    
    // Send message to background script
    const response = await new Promise(resolve => {
      chrome.runtime.sendMessage({
        action: 'openPortal'
      }, resolve);
    });
    
    if (!response || !response.success) {
      // Handle error
      portalStatusText.textContent = response ? response.message : 'Failed to open portal';
      console.error('Failed to open portal:', response ? response.message : 'Unknown error');
    }
  } catch (error) {
    console.error('Error opening portal:', error);
    portalStatusText.textContent = 'Error opening portal';
  } finally {
    // Re-enable button
    portalLoginBtn.disabled = false;
    portalLoginBtn.textContent = 'Open Portal';
  }
}

// Save portal configuration with auto-detection and error handling
async function savePortalConfig() {
    try {
        const email = portalEmailInput.value;
        
        // Validate email
        if (!email || !email.includes('@')) {
            portalStatusText.textContent = 'Please enter a valid email';
            return;
        }
        
        // Show loading state
        savePortalConfigBtn.disabled = true;
        savePortalConfigBtn.textContent = 'Configuring...';
        portalStatusText.textContent = 'Detecting settings...';
        
        // Get cached settings before making the request
        const cached = await chrome.storage.local.get(['portalSettings', 'portalEmail', 'portalSettingsTimestamp']);
        const isCacheValid = cached.portalSettingsTimestamp && 
                           (Date.now() - cached.portalSettingsTimestamp < API_CONFIG.cacheExpiry);
        
        try {
            // Attempt to save and detect settings
            const data = await portalAPI.makeRequest('/portal-settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    portal_type: 'company',
                    email: email
                })
            });

    try {
      const response = await fetch('http://localhost:3000/api/portal-settings', {
        signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        portal_type: 'company',
        email: email
      })
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    clearTimeout(timeoutId);
    const data = await response.json();
    
            // Update UI with detected settings
            if (data.success && data.settings) {
                // Save to Chrome storage with timestamp
                await chrome.storage.local.set({
                    portalEmail: email,
                    portalURL: data.settings.portal,
                    portalSettings: data.settings,
                    portalSettingsTimestamp: Date.now()
                });
                
                portalStatusText.textContent = 'Settings configured successfully';
                portalStatusDot.className = 'status-dot connected';
                
                // Check portal status after save
                await checkPortalStatus();
            } else {
                throw new Error(API_CONFIG.errorMessages.invalidResponse);
            }
            
        } catch (error) {
            console.error('Error saving portal configuration:', error);
            
            // Get appropriate error message
            const errorMessage = portalAPI.getErrorMessage(error);
            portalStatusText.textContent = errorMessage;
            portalStatusDot.className = 'status-dot disconnected';
            
            // Try to use cached settings if available and valid
            if (isCacheValid && cached.portalEmail === email && cached.portalSettings) {
                portalStatusText.textContent += ' Using cached settings.';
                await chrome.storage.local.set({
                    portalEmail: email,
                    portalSettings: cached.portalSettings,
                    portalSettingsTimestamp: cached.portalSettingsTimestamp
                });
            }
  } finally {
    // Re-enable button
    savePortalConfigBtn.disabled = false;
    savePortalConfigBtn.textContent = 'Save';
  }
}

// Partner portal configuration with auto-detection
async function savePartnerPortalConfig() {
  try {
    const email = partnerPortalEmailInput.value;
    
    // Validate email
    if (!email || !email.includes('@')) {
      partnerPortalStatusText.textContent = 'Please enter a valid email';
      return;
    }
    
    // Show loading state
    savePartnerPortalConfigBtn.disabled = true;
    savePartnerPortalConfigBtn.textContent = 'Configuring...';
    partnerPortalStatusText.textContent = 'Detecting settings...';
    
    // Save to database and auto-detect settings
    const response = await fetch('http://localhost:3000/api/portal-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        portal_type: 'partner',
        email: email
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save settings');
    }

    const data = await response.json();
    
    // Update UI with detected settings
    if (data.success && data.settings) {
      // Save to Chrome storage
      await chrome.storage.local.set({
        partnerPortalEmail: email,
        partnerPortalURL: data.settings.portal,
        partnerPortalSettings: data.settings
      });
      
      partnerPortalStatusText.textContent = 'Settings configured successfully';
      partnerPortalStatusDot.className = 'status-dot connected';
      
      // Check portal status after save
      await checkPartnerPortalStatus();
    }
  } catch (error) {
    console.error('Error saving partner portal configuration:', error);
    partnerPortalStatusText.textContent = 'Error saving settings';
    partnerPortalStatusDot.className = 'status-dot disconnected';
  } finally {
    // Re-enable button
    savePartnerPortalConfigBtn.disabled = false;
    savePartnerPortalConfigBtn.textContent = 'Save';
  }
}


// Check portal login status
async function checkPortalStatus() {
    try {
        // Update UI to show checking
        portalStatusDot.className = 'status-dot';
        portalStatusText.textContent = 'Checking portal status...';
        
        // Get cached status before making the request
        const cached = await chrome.storage.local.get([
            'portalStatus',
            'portalStatusTimestamp',
            'portalSettings'
        ]);
        
        const isCacheValid = cached.portalStatusTimestamp && 
                           (Date.now() - cached.portalStatusTimestamp < API_CONFIG.cacheExpiry);
        
        // If offline and we have valid cache, use it immediately
        if (!navigator.onLine && isCacheValid) {
            updatePortalStatusUI(cached.portalStatus, true);
            portalStatusText.textContent = API_CONFIG.errorMessages.offline;
            return;
        }
        
        try {
            // Attempt to check portal status
            const data = await portalAPI.makeRequest('/portal-status', {
                method: 'GET'
            });
    
    // Set up timeout for the check
    const checkPromise = new Promise(resolve => {
      chrome.runtime.sendMessage({
        action: 'checkPortalLogin'
      }, resolve);
    });
    
    // Set up timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), 5000);
    });

    // Race between the check and timeout
    const response = await Promise.race([checkPromise, timeoutPromise]);

            if (data.success) {
                // Update cache with new status
                await chrome.storage.local.set({
                    portalStatus: data.loggedIn,
                    portalStatusTimestamp: Date.now()
                });
                
                updatePortalStatusUI(data.loggedIn, false);
            } else {
                throw new Error(API_CONFIG.errorMessages.invalidResponse);
            }
            
        } catch (error) {
            console.error('Error checking portal status:', error);
            
            // Get appropriate error message
            const errorMessage = portalAPI.getErrorMessage(error);
            portalStatusText.textContent = errorMessage;
            portalStatusDot.className = 'status-dot';
            
            // Use cached status if available and valid
            if (isCacheValid && cached.portalStatus !== undefined) {
                updatePortalStatusUI(cached.portalStatus, true);
            } else if (!cached.portalSettings) {
                portalStatusText.textContent = 'Portal settings not configured';
            }
        }
  }
}

// Update portal status UI
function updatePortalStatusUI(isLoggedIn, isCached = false) {
  if (isLoggedIn) {
    portalStatusDot.className = 'status-dot connected';
    portalStatusText.textContent = `Connected to portal${isCached ? ' (cached)' : ''}`;
  } else {
    portalStatusDot.className = 'status-dot disconnected';
    
    // Check if email is configured
    chrome.storage.local.get(['portalURL', 'portalEmail'], result => {
      if (!result.portalURL || result.portalURL.trim() === '') {
        portalStatusText.textContent = 'Portal URL not configured';
      } else if (!result.portalEmail || result.portalEmail.trim() === '') {
        portalStatusText.textContent = 'Email not configured';
      } else {
        portalStatusText.textContent = 'Not connected to portal';
      }
    });
  }
}

// Partner Portal-related functions

// Open partner portal in new tab
async function openPartnerPortal() {
  try {
    // Disable button temporarily
    partnerPortalLoginBtn.disabled = true;
    partnerPortalLoginBtn.textContent = 'Opening...';
    
    // Send message to background script
    const response = await new Promise(resolve => {
      chrome.runtime.sendMessage({
        action: 'openPartnerPortal'
      }, resolve);
    });
    
    if (!response || !response.success) {
      // Handle error
      partnerPortalStatusText.textContent = response ? response.message : 'Failed to open partner portal';
      console.error('Failed to open partner portal:', response ? response.message : 'Unknown error');
    }
  } catch (error) {
    console.error('Error opening partner portal:', error);
    partnerPortalStatusText.textContent = 'Error opening partner portal';
  } finally {
    // Re-enable button
    partnerPortalLoginBtn.disabled = false;
    partnerPortalLoginBtn.textContent = 'Open Partner Portal';
  }
}

// Check partner portal login status
async function checkPartnerPortalStatus() {
  try {
    // Update UI to show checking
    partnerPortalStatusDot.className = 'status-dot';
    partnerPortalStatusText.textContent = 'Checking partner portal status...';
    
    // Send message to background script
    const response = await new Promise(resolve => {
      chrome.runtime.sendMessage({
        action: 'checkPartnerPortalLogin'
      }, resolve);
    });
    
    if (response && response.success) {
      // Update UI based on login status
      updatePartnerPortalStatusUI(response.loggedIn);
    } else {
      // Handle error
      partnerPortalStatusDot.className = 'status-dot';
      partnerPortalStatusText.textContent = response ? response.message : 'Failed to check partner portal status';
      console.error('Failed to check partner portal status:', response ? response.message : 'Unknown error');
    }
  } catch (error) {
    console.error('Error checking partner portal status:', error);
    partnerPortalStatusDot.className = 'status-dot';
    partnerPortalStatusText.textContent = 'Error checking partner portal status';
  }
}

// Update partner portal status UI
function updatePartnerPortalStatusUI(isLoggedIn) {
  if (isLoggedIn) {
    partnerPortalStatusDot.className = 'status-dot connected';
    partnerPortalStatusText.textContent = 'Connected to partner portal';
  } else {
    partnerPortalStatusDot.className = 'status-dot disconnected';
    
    // Check if email is configured
    chrome.storage.local.get(['partnerPortalURL', 'partnerPortalEmail'], result => {
      if (!result.partnerPortalURL || result.partnerPortalURL.trim() === '') {
        partnerPortalStatusText.textContent = 'Partner portal URL not configured';
      } else if (!result.partnerPortalEmail || result.partnerPortalEmail.trim() === '') {
        partnerPortalStatusText.textContent = 'Email not configured';
      } else {
        partnerPortalStatusText.textContent = 'Not connected to partner portal';
      }
    });
  }
}

