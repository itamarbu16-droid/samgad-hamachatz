import { pgTable, text, timestamp, boolean, integer, date, jsonb, index, uniqueIndex, bigint } from 'drizzle-orm/pg-core';

export const rateLimit = pgTable('auth_rate_limit', { id: text('id').primaryKey(), key: text('key').notNull().unique(), count: integer('count').notNull(), lastRequest: bigint('last_request', { mode: 'number' }).notNull() });
export const mutationReceipts = pgTable('mutation_receipts', { key: text('key').primaryKey(), fingerprint: text('fingerprint').notNull(), result: jsonb('result'), createdAt: timestamp('created_at', {withTimezone:true}).notNull().defaultNow() });

export const user = pgTable('auth_user', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false), image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const session = pgTable('auth_session', {
  id: text('id').primaryKey(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(), ipAddress: text('ip_address'), userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
});
export const account = pgTable('auth_account', {
  id: text('id').primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }), refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'), password: text('password'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const verification = pgTable('auth_verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const organizations = pgTable('organizations', { id: text('id').primaryKey(), name: text('name').notNull(), timeZone: text('time_zone').notNull().default('Asia/Jerusalem') });
export const companies = pgTable('companies', { id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), name: text('name').notNull() });
export const domains = pgTable('domains', { id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), name: text('name').notNull(), color: text('color').notNull().default('#267d75') });
export const memberships = pgTable('memberships', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => user.id), organizationId: text('organization_id').notNull().references(() => organizations.id),
  role: text('role').notNull(), companyId: text('company_id').references(() => companies.id), domainId: text('domain_id').references(() => domains.id), active: boolean('active').notNull().default(true),
}, (t) => [uniqueIndex('membership_user_org').on(t.userId, t.organizationId)]);
export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), companyId: text('company_id').references(() => companies.id), domainId: text('domain_id').notNull().references(() => domains.id),
  title: text('title').notNull(), description: text('description').notNull().default(''), creatorId: text('creator_id').notNull().references(() => user.id), ownerId: text('owner_id').notNull().references(() => user.id),
  priority: text('priority').notNull().default('normal'), status: text('status').notNull().default('open'), dueDate: date('due_date'),
  completedAt: timestamp('completed_at', { withTimezone: true }), completedBy: text('completed_by').references(() => user.id), blockerReason: text('blocker_reason'),
  requiresReview: boolean('requires_review').notNull().default(false), version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('tasks_scope_status').on(t.organizationId, t.companyId, t.status), index('tasks_owner').on(t.ownerId)]);
export const comments = pgTable('task_comments', { id: text('id').primaryKey(), taskId: text('task_id').notNull().references(() => tasks.id), actorId: text('actor_id').notNull().references(() => user.id), body: text('body').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow() });
export const decisions = pgTable('decisions', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), companyId: text('company_id').references(() => companies.id), domainId: text('domain_id').notNull().references(() => domains.id),
  title: text('title').notNull(), description: text('description').notNull().default(''), requesterId: text('requester_id').notNull().references(() => user.id), deciderId: text('decider_id').notNull().references(() => user.id),
  priority: text('priority').notNull().default('normal'), status: text('status').notNull().default('pending'), notes: text('notes'), taskId: text('task_id').references(() => tasks.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }), version: integer('version').notNull().default(1), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('decisions_scope_status').on(t.organizationId, t.companyId, t.status)]);
export const auditEvents = pgTable('audit_events', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), entityType: text('entity_type').notNull(), entityId: text('entity_id').notNull(),
  actorId: text('actor_id').notNull().references(() => user.id), action: text('action').notNull(), summary: text('summary').notNull(), details: jsonb('details').notNull().default({}), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('audit_org_created').on(t.organizationId, t.createdAt)]);
