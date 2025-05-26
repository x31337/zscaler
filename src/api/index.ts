import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
  timeout: 5000,
});

export const healthAPI = {
  check: () => api.get('/health'),
};

export const networkAPI = {
  getStatus: () => api.get('/network/status'),
  getPublicIP: () => api.get('/network/ip/public'),
  getPrivateIPs: () => api.get('/network/ip/private'),
  getLatency: () => api.get('/network/latency'),
};

export const protectionAPI = {
  getStatus: () => api.get('/protection/status'),
  toggle: (enabled: boolean) => api.post('/protection/toggle', { enabled }),
  getThreats: () => api.get('/protection/threats'),
  getLogs: () => api.get('/protection/logs'),
};

export const portalAPI = {
  getStatus: (type: 'company' | 'partner') => api.get(`/portal/status/${type}`),
  configure: (config: any) => api.post('/portal/configure', config),
  getSettings: (type: string) => api.get(`/portal/settings/${type}`),
  saveSettings: (settings: any) => api.post('/portal/settings', settings),
};

export const monitorAPI = {
  getStats: () => api.get('/monitor/stats'),
  getResources: () => api.get('/monitor/resources'),
  getPerformance: () => api.get('/monitor/performance'),
  getErrors: () => api.get('/monitor/errors'),
  resetStats: () => api.post('/monitor/reset'),
};
