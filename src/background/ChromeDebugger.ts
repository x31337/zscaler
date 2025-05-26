export class ChromeDebugger {
  private debuggeeId: chrome.debugger.Debuggee | null = null;
  private isAttached: boolean = false;

  async initialize(): Promise<void> {
    try {
      // Get the current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.id) {
        throw new Error('No active tab found');
      }

      this.debuggeeId = { tabId: tab.id };
      
      // Attach debugger if not already attached
      if (!this.isAttached) {
        await this.attach();
      }

      // Listen for debugger events
      chrome.debugger.onEvent.addListener((source, method, params) => {
        this.handleDebuggerEvent(source, method, params);
      });

      // Listen for debugger detach events
      chrome.debugger.onDetach.addListener((source, reason) => {
        if (this.debuggeeId && source.tabId === this.debuggeeId.tabId) {
          this.isAttached = false;
          console.log('Debugger detached:', reason);
        }
      });

    } catch (error) {
      console.error('Failed to initialize debugger:', error);
      throw error;
    }
  }

  private async attach(): Promise<void> {
    if (!this.debuggeeId) {
      throw new Error('Debugger not initialized');
    }

    try {
      await chrome.debugger.attach(this.debuggeeId, '1.3');
      this.isAttached = true;

      // Enable network tracking
      await chrome.debugger.sendCommand(this.debuggeeId, 'Network.enable');
      
      console.log('Debugger attached successfully');
    } catch (error) {
      console.error('Failed to attach debugger:', error);
      throw error;
    }
  }

  private handleDebuggerEvent(
    source: chrome.debugger.Debuggee,
    method: string,
    params?: object
  ): void {
    // Handle specific debugger events
    switch (method) {
      case 'Network.requestWillBeSent':
        this.handleNetworkRequest(params);
        break;
      case 'Network.responseReceived':
        this.handleNetworkResponse(params);
        break;
      case 'Network.loadingFailed':
        this.handleNetworkError(params);
        break;
    }
  }

  private handleNetworkRequest(params: any): void {
    if (params?.request?.url) {
      console.debug('Network request:', params.request.url);
    }
  }

  private handleNetworkResponse(params: any): void {
    if (params?.response) {
      const { url, status, headers } = params.response;
      console.debug('Network response:', { url, status, headers });
    }
  }

  private handleNetworkError(params: any): void {
    if (params?.errorText) {
      console.error('Network error:', params.errorText);
    }
  }

  public async cleanup(): Promise<void> {
    if (this.debuggeeId && this.isAttached) {
      try {
        await chrome.debugger.detach(this.debuggeeId);
        this.isAttached = false;
        console.log('Debugger detached during cleanup');
      } catch (error) {
        console.error('Error detaching debugger:', error);
      }
    }
  }
}

