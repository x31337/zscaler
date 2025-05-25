import { z } from 'zod';

export const PortalSettingsSchema = z.object({
  type: z.enum(['company', 'partner']),
  email: z.string().email(),
});

export type PortalSettings = z.infer<typeof PortalSettingsSchema>;

export const savePortalSettings = async (settings: PortalSettings): Promise<void> => {
  const response = await fetch('http://localhost:3000/api/portal-settings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      portal_type: settings.type,
      email: settings.email,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to save portal settings');
  }
};

