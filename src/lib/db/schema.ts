import { pgTable, serial, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const portalSettings = pgTable('portal_settings', {
  id: serial('id').primaryKey(),
  portalType: text('portal_type').notNull(),
  email: text('email').notNull(),
  settings: text('settings').notNull(),
  autoDetected: boolean('auto_detected').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

