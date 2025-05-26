declare namespace chrome {
  export namespace system {
    export interface NetworkInterface {
      address: string;
      name: string;
      prefixLength: number;
    }

    export namespace network {
      export function getNetworkInterfaces(): Promise<NetworkInterface[]>;
    }
  }
}

// Ensure this module is treated as an external module
export {};

