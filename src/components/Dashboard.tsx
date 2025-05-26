import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  healthAPI,
  networkAPI,
  protectionAPI,
  portalAPI,
} from '../api';

export const Dashboard: React.FC = () => {
  const health = useQuery({ 
    queryKey: ['health'], 
    queryFn: healthAPI.check,
    refetchInterval: 5000 
  });

  const network = useQuery({ 
    queryKey: ['network'], 
    queryFn: networkAPI.getStatus,
    refetchInterval: 5000 
  });

  const protection = useQuery({ 
    queryKey: ['protection'], 
    queryFn: protectionAPI.getStatus,
    refetchInterval: 5000 
  });

  const portal = useQuery({ 
    queryKey: ['portal'], 
    queryFn: () => portalAPI.getStatus('company'),
    refetchInterval: 5000 
  });

  const isLoading = health.isLoading || network.isLoading || protection.isLoading || portal.isLoading;
  const hasError = health.error || network.error || protection.error || portal.error;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg">Loading dashboard data...</div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-red-50 text-red-700 p-6 rounded-lg max-w-lg">
          <h3 className="font-bold text-lg mb-2">Error loading dashboard</h3>
          <p>{hasError.toString()}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Zscaler Security Dashboard</h1>
          <p className="text-gray-500 mt-2">Real-time system monitoring</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Health Status */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">System Health</h2>
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium
              ${health.data?.data.status === 'healthy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {health.data?.data.status}
            </div>
            <div className="mt-4 text-sm text-gray-600">
              Last updated: {new Date(health.data?.data.timestamp).toLocaleString()}
            </div>
          </div>

          {/* Network Status */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Network Status</h2>
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium
              ${network.data?.data.status === 'connected' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {network.data?.data.status}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Latency</p>
                <p className="font-medium">{network.data?.data.latency?.toFixed(2)}ms</p>
              </div>
              <div>
                <p className="text-gray-600">Last Check</p>
                <p className="font-medium">{new Date(network.data?.data.timestamp).toLocaleTimeString()}</p>
              </div>
            </div>
          </div>

          {/* Protection Status */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Protection Status</h2>
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium
              ${protection.data?.data.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {protection.data?.data.enabled ? 'Protected' : 'Disabled'}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Threats Blocked</p>
                <p className="font-medium">{protection.data?.data.threats?.blocked || 0}</p>
              </div>
              <div>
                <p className="text-gray-600">Last Check</p>
                <p className="font-medium">{new Date(protection.data?.data.lastCheck).toLocaleTimeString()}</p>
              </div>
            </div>
          </div>

          {/* Portal Status */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Portal Status</h2>
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium
              ${portal.data?.data.connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {portal.data?.data.connected ? 'Connected' : 'Disconnected'}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Portal</p>
                <p className="font-medium">{portal.data?.data.type}</p>
              </div>
              <div>
                <p className="text-gray-600">URL</p>
                <p className="font-medium">{portal.data?.data.url}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
