import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNetworkStatus } from '@/lib/api/network';

export const NetworkStatus: React.FC = () => {
  const { data: networkStatus } = useQuery({
    queryKey: ['network-status'],
    queryFn: getNetworkStatus,
    refetchInterval: 5000
  });

  return (
    <div className="p-4 border-b border-gray-200">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Network Status</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">External IP:</span>
            <span className="text-xs font-mono">{networkStatus?.externalIp || 'Loading...'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">Internal IP:</span>
            <span className="text-xs font-mono">{networkStatus?.internalIp || 'Loading...'}</span>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">Container IP:</span>
            <span className="text-xs font-mono">{networkStatus?.containerIp || 'None'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">Domain:</span>
            <span className="text-xs">{networkStatus?.domain || 'zscaler.net'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

