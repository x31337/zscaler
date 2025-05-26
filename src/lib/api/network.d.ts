declare namespace chrome.system {
  export interface NetworkInterface {
    address: string;
    name: string;
    prefixLength: number;
  }

  export interface NetworkGetInterfacesCallback {
    (networkInterfaces: NetworkInterface[]): void;
  }

  export namespace network {
    export function getNetworkInterfaces(): Promise<NetworkInterface[]>;
  }
}

