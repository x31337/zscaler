declare namespace chrome.system {
  interface NetworkInterface {
    address: string;
    name: string;
    prefixLength: number;
  }

  namespace network {
    function getNetworkInterfaces(): Promise<NetworkInterface[]>;
  }
}

