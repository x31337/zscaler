export interface NetworkStatus {
  externalIp: string;
  internalIp: string;
  containerIp: string | null;
  domain: string;
}

export const getNetworkStatus = async (): Promise<NetworkStatus> => {
  const externalIp = await fetch('https://api.ipify.org?format=json')
    .then(r => r.json())
    .then(data => data.ip);
  
  const internalIps = await chrome.system.network.getNetworkInterfaces();
  const internalIp = internalIps.find((ip) => 
    !ip.address.startsWith('172.17.')
  )?.address || 'Not available';
  
  const containerIp = internalIps.find((ip) => 
    ip.address.startsWith('172.17.')
  )?.address || null;
  
  return {
    externalIp,
    internalIp,
    containerIp,
    domain: 'zscaler.net'
  };
};

