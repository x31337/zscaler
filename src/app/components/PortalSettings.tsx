import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChromeDriver } from '@/lib/chrome/driver';
import { savePortalSettings } from '@/lib/api/portal';

export const PortalSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [email, setEmail] = React.useState('');
  const [partnerEmail, setPartnerEmail] = React.useState('');

  const mutation = useMutation({
    mutationFn: savePortalSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-settings'] });
    }
  });

  const handleSave = async (type: 'company' | 'partner') => {
    const emailToUse = type === 'company' ? email : partnerEmail;
    if (!emailToUse) return;

    try {
      await mutation.mutateAsync({
        type,
        email: emailToUse
      });

      // Initialize Chrome driver and check status
      const driver = new ChromeDriver();
      await driver.init();
      const isLoggedIn = await driver.checkPortalStatus(
        type === 'company' ? 'https://admin.zscaler.net' : 'https://partner.zscaler.net'
      );
      await driver.close();

      if (isLoggedIn) {
        console.log(`Successfully connected to ${type} portal`);
      }
    } catch (error) {
      console.error(`Error saving ${type} portal settings:`, error);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Company Portal</h3>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter corporate email"
          className="w-full px-3 py-2 border rounded-md text-sm"
        />
        <button
          onClick={() => handleSave('company')}
          className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          Configure Company Portal
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Partner Portal</h3>
        <input
          type="email"
          value={partnerEmail}
          onChange={(e) => setPartnerEmail(e.target.value)}
          placeholder="Enter partner email"
          className="w-full px-3 py-2 border rounded-md text-sm"
        />
        <button
          onClick={() => handleSave('partner')}
          className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          Configure Partner Portal
        </button>
      </div>
    </div>
  );
};

