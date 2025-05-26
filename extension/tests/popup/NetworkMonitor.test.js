describe('NetworkMonitor', () => {
  let networkMonitor;
  
  beforeEach(() => {
    // Reset all mocks
    resetAllMocks();
    
    // Mock successful network check response
    fetch.mockImplementation(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        publicIP: '1.2.3.4',
        privateIP: '192.168.1.100',
        dockerIP: '172.17.0.2',
        nonPrivateIP: '10.0.0.1'
      })
    }));
    
    // Import NetworkMonitor class
    const { NetworkMonitor } = require('../../popup/NetworkMonitor');
    networkMonitor = new NetworkMonitor();
  });

  afterEach(() => {
    if (networkMonitor.destroy) {
      networkMonitor.destroy();
    }
  });

  describe('initialization', () => {
    it('should initialize with default values', () => {
      expect(networkMonitor.currentSlide).toBe(0);
      expect(networkMonitor.autoSlideInterval).toBeDefined();
      expect(networkMonitor.updateInterval).toBeDefined();
    });

    it('should start periodic updates', () => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/network-status'),
        expect.any(Object)
      );
    });
  });

  describe('network status updates', () => {
    it('should update IP addresses on successful check', async () => {
      await networkMonitor.updateNetworkInfo();
      
      expect(document.getElementById('publicIP').textContent).toBe('1.2.3.4');
      expect(document.getElementById('privateIP').textContent).toBe('192.168.1.100');
      expect(document.getElementById('dockerIP').textContent).toBe('172.17.0.2');
      expect(document.getElementById('nonPrivateIP').textContent).toBe('10.0.0.1');
    });

    it('should handle network errors gracefully', async () => {
      fetch.mockImplementation(() => Promise.reject(new Error('Network error')));
      
      await networkMonitor.updateNetworkInfo();
      
      expect(document.getElementById('publicIP').textContent).toBe('Connection error');
    });

    it('should update timestamp on successful check', async () => {
      await networkMonitor.updateNetworkInfo();
      
      const timeElement = document.getElementById('lastUpdateTime');
      expect(timeElement.textContent).toMatch(/just now|seconds? ago/i);
    });
  });

  describe('slider functionality', () => {
    it('should move to next slide', () => {
      networkMonitor.nextSlide();
      expect(networkMonitor.currentSlide).toBe(1);
      expect(networkMonitor.slider.style.transform).toBe('translateX(-100%)');
    });

    it('should move to previous slide', () => {
      networkMonitor.currentSlide = 1;
      networkMonitor.previousSlide();
      expect(networkMonitor.currentSlide).toBe(0);
      expect(networkMonitor.slider.style.transform).toBe('translateX(0%)');
    });

    it('should update dots when changing slides', () => {
      networkMonitor.goToSlide(1);
      
      const dots = document.querySelectorAll('.nav-dot');
      expect(dots[0].classList.contains('active')).toBeFalsy();
      expect(dots[1].classList.contains('active')).toBeTruthy();
    });
  });

  describe('touch interaction', () => {
    it('should handle touch swipe right', () => {
      const touchStart = new Touch({
        identifier: 1,
        target: networkMonitor.slider,
        clientX: 200,
        clientY: 0
      });

      const touchEnd = new Touch({
        identifier: 1,
        target: networkMonitor.slider,
        clientX: 100,
        clientY: 0
      });

      networkMonitor.slider.dispatchEvent(new TouchEvent('touchstart', {
        touches: [touchStart]
      }));

      networkMonitor.slider.dispatchEvent(new TouchEvent('touchend', {
        changedTouches: [touchEnd]
      }));

      expect(networkMonitor.currentSlide).toBe(1);
    });

    it('should handle touch swipe left', () => {
      networkMonitor.currentSlide = 1;
      
      const touchStart = new Touch({
        identifier: 1,
        target: networkMonitor.slider,
        clientX: 100,
        clientY: 0
      });

      const touchEnd = new Touch({
        identifier: 1,
        target: networkMonitor.slider,
        clientX: 200,
        clientY: 0
      });

      networkMonitor.slider.dispatchEvent(new TouchEvent('touchstart', {
        touches: [touchStart]
      }));

      networkMonitor.slider.dispatchEvent(new TouchEvent('touchend', {
        changedTouches: [touchEnd]
      }));

      expect(networkMonitor.currentSlide).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should clear intervals on destroy', () => {
      const clearIntervalSpy = jest.spyOn(window, 'clearInterval');
      
      networkMonitor.destroy();
      
      expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
      expect(networkMonitor.autoSlideInterval).toBeNull();
      expect(networkMonitor.updateInterval).toBeNull();
    });
  });
});
