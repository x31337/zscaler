import { NetworkStatus } from '@/types/network';

interface RevSliderConfig {
  delay: number;
  animationDuration: number;
  startDelay: number;
  updateInterval: number;
  autoplay: {
    enabled: boolean;
    pauseOnHover: boolean;
    pauseOnTouch: boolean;
    resumeOnLeave: boolean;
    pauseOnInteraction: boolean;
  };
}

export class NetworkMonitor {
  private slider: HTMLElement | null = null;
  private cards: HTMLElement[] = [];
  private dots: HTMLElement[] = [];
  private currentIndex = 0;
  private isAnimating = false;
  private touchStartX = 0;
  private touchEndX = 0;
  private autoplayInterval: number | null = null;
  private isPaused = false;
  private eventListeners: Record<string, EventListener> = {};

  private readonly revSliderConfig: RevSliderConfig = {
    delay: 30000,
    animationDuration: 350,
    startDelay: 1500,
    updateInterval: 5000,
    autoplay: {
      enabled: true,
      pauseOnHover: true,
      pauseOnTouch: true,
      resumeOnLeave: true,
      pauseOnInteraction: true
    }
  };

  constructor(
    private readonly containerId: string,
    private readonly onNetworkUpdate?: (status: NetworkStatus) => void
  ) {
    this.initialize();
  }

  private initialize() {
    // Initialize slider elements
    this.slider = document.getElementById(this.containerId);
    if (!this.slider) return;

    this.cards = Array.from(this.slider.getElementsByClassName('slide')) as HTMLElement[];
    if (this.cards.length === 0) return;

    this.initializeRevSlider();
    this.setupEventListeners();
    this.createNavigationDots();
  }

  private initializeRevSlider() {
    if (!this.slider) return;

    // Add RevSlider classes
    this.slider.classList.add('rev-slider');
    this.cards.forEach(card => card.classList.add('rev-slide'));

    // Set initial state
    this.updateSlidePositions();

    // Start autoplay if enabled
    if (this.revSliderConfig.autoplay.enabled) {
      setTimeout(() => this.startAutoplay(), this.revSliderConfig.startDelay);
    }
  }

  private setupEventListeners() {
    if (!this.slider) return;

    this.eventListeners = {
      touchstart: (e: TouchEvent) => {
        this.touchStartX = e.touches[0].clientX;
        if (this.revSliderConfig.autoplay.pauseOnTouch) {
          this.pauseAutoplay();
        }
      },
      touchmove: (e: TouchEvent) => {
        if (this.isAnimating) return;
        this.touchEndX = e.touches[0].clientX;
        const swipeDistance = this.touchStartX - this.touchEndX;
        const threshold = this.slider!.offsetWidth * 0.2;
        if (Math.abs(swipeDistance) > threshold) {
          e.preventDefault();
        }
      },
      touchend: () => {
        if (!this.isAnimating) {
          this.handleSwipe();
        }
        if (this.revSliderConfig.autoplay.resumeOnLeave) {
          setTimeout(() => this.resumeAutoplay(), 500);
        }
      },
      mouseenter: () => {
        if (this.revSliderConfig.autoplay.pauseOnHover) {
          this.pauseAutoplay();
        }
      },
      mouseleave: () => {
        if (this.revSliderConfig.autoplay.resumeOnLeave) {
          this.resumeAutoplay();
        }
      }
    };

    this.slider.addEventListener('touchstart', this.eventListeners.touchstart);
    this.slider.addEventListener('touchmove', this.eventListeners.touchmove);
    this.slider.addEventListener('touchend', this.eventListeners.touchend);

    if (this.revSliderConfig.autoplay.pauseOnHover) {
      this.slider.addEventListener('mouseenter', this.eventListeners.mouseenter);
      if (this.revSliderConfig.autoplay.resumeOnLeave) {
        this.slider.addEventListener('mouseleave', this.eventListeners.mouseleave);
      }
    }
  }

  private createNavigationDots() {
    if (!this.slider) return;

    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'slider-dots';

    this.cards.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.className = `slider-dot ${index === 0 ? 'active' : ''}`;
      dot.setAttribute('aria-label', `Go to slide ${index + 1}`);

      const clickHandler = () => {
        if (!this.isAnimating) {
          this.goToSlide(index);
          if (this.revSliderConfig.autoplay.pauseOnInteraction) {
            this.pauseAutoplay();
            if (this.revSliderConfig.autoplay.resumeOnLeave) {
              setTimeout(() => this.resumeAutoplay(), this.revSliderConfig.delay);
            }
          }
        }
      };

      dot.addEventListener('click', clickHandler);
      dot._clickHandler = clickHandler;
      this.dots.push(dot);
      dotsContainer.appendChild(dot);
    });

    this.slider.appendChild(dotsContainer);
  }

  private updateSlidePositions() {
    this.cards.forEach((card, index) => {
      const offset = (index - this.currentIndex) * 100;
      card.style.transform = `translateX(${offset}%)`;
      this.dots[index]?.classList.toggle('active', index === this.currentIndex);
    });
  }

  private handleSwipe() {
    const swipeDistance = this.touchStartX - this.touchEndX;
    const threshold = this.slider!.offsetWidth * 0.2;

    if (Math.abs(swipeDistance) > threshold) {
      if (swipeDistance > 0) {
        this.nextSlide();
      } else {
        this.prevSlide();
      }
    }
  }

  private goToSlide(index: number) {
    if (this.isAnimating || index === this.currentIndex) return;
    this.isAnimating = true;

    const direction = index > this.currentIndex ? 1 : -1;
    this.currentIndex = index;

    this.updateSlidePositions();

    setTimeout(() => {
      this.isAnimating = false;
    }, this.revSliderConfig.animationDuration);
  }

  private nextSlide() {
    const nextIndex = (this.currentIndex + 1) % this.cards.length;
    this.goToSlide(nextIndex);
  }

  private prevSlide() {
    const prevIndex = (this.currentIndex - 1 + this.cards.length) % this.cards.length;
    this.goToSlide(prevIndex);
  }

  private startAutoplay() {
    if (this.autoplayInterval) return;

    this.autoplayInterval = window.setInterval(() => {
      if (!this.isPaused) {
        this.nextSlide();
      }
    }, this.revSliderConfig.delay);
  }

  private pauseAutoplay() {
    this.isPaused = true;
  }

  private resumeAutoplay() {
    this.isPaused = false;
  }

  public destroy() {
    if (!this.slider) return;

    // Clear autoplay interval
    if (this.autoplayInterval) {
      clearInterval(this.autoplayInterval);
      this.autoplayInterval = null;
    }

    // Remove event listeners
    Object.entries(this.eventListeners).forEach(([event, listener]) => {
      this.slider?.removeEventListener(event, listener);
    });

    // Remove dot click handlers
    this.dots.forEach(dot => {
      if (dot._clickHandler) {
        dot.removeEventListener('click', dot._clickHandler);
      }
    });

    // Clear references
    this.slider = null;
    this.cards = [];
    this.dots = [];
    this.eventListeners = {};
  }
}

