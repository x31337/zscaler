import React, { useEffect, useState } from 'react'

interface SystemStatus {
  status: string;
  timestamp: string;
}

function App() {
  const [health, setHealth] = useState<SystemStatus | null>(null);
  const [networkStatus, setNetworkStatus] = useState<any>(null);
  const [protectionStatus, setProtectionStatus] = useState<any>(null);
  const [portalStatus, setPortalStatus] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [healthRes, networkRes, protectionRes, portalRes] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/network/status'),
          fetch('/api/protection/status'),
          fetch('/api/portal/status/company')
        ]);

        setHealth(await healthRes.json());
        setNetworkStatus(await networkRes.json());
        setProtectionStatus(await protectionRes.json());
        setPortalStatus(await portalRes.json());
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Zscaler Portal Status</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatusCard title="System Health" data={health} />
          <StatusCard title="Network Status" data={networkStatus} />
          <StatusCard title="Protection Status" data={protectionStatus} />
          <StatusCard title="Portal Status" data={portalStatus} />
        </div>
      </div>
    </div>
  );
}

interface StatusCardProps {
  title: string;
  data: any;
}

function StatusCard({ title, data }: StatusCardProps) {
  if (!data) return <div className="bg-white p-6 rounded-lg shadow">Loading...</div>;

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      <div className="space-y-2">
        <div className="flex items-center">
          <span className={`h-3 w-3 rounded-full ${data.status === 'healthy' || data.status === 'active' ? 'bg-green-500' : 'bg-red-500'} mr-2`}></span>
          <span className="capitalize">{data.status}</span>
        </div>
        <div className="text-sm text-gray-500">
          Last updated: {new Date(data.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

export default App;
