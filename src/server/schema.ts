import {sql} from 'drizzle-orm';
import { pgTable, text, timestamp, boolean, integer, date, jsonb, index, uniqueIndex, bigint } from 'drizzle-orm/pg-core';

export const rateLimit = pgTable('auth_rate_limit', { id: text('id').primaryKey(), key: text('key').notNull().unique(), count: integer('count').notNull(), lastRequest: bigint('last_request', { mode: 'number' }).notNull() });
export const taskPins=pgTable('task_pins',{id:text('id').primaryKey(),organizationId:text('organization_id').notNull(),userId:text('user_id').notNull(),taskKey:text('task_key').notNull()});
export const calendarConnections=pgTable('calendar_connections',{id:text('id').primaryKey(),organizationId:text('organization_id').notNull(),userId:text('user_id').notNull(),encryptedTokens:text('encrypted_tokens').notNull()});
export const calendarBookings=pgTable('calendar_bookings',{id:text('id').primaryKey(),organizationId:text('organization_id').notNull(),userId:text('user_id').notNull(),taskKey:text('task_key').notNull(),eventId:text('event_id').notNull(),eventUrl:text('event_url').notNull(),startsAt:text('starts_at').notNull(),endsAt:text('ends_at').notNull()});
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
  role: text('role').notNull(), editAll: boolean('edit_all').notNull().default(false), companyId: text('company_id').references(() => companies.id), domainId: text('domain_id').references(() => domains.id), active: boolean('active').notNull().default(true),
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

export const rhythmGroups = pgTable('rhythm_groups', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id),
  creatorId: text('creator_id').notNull().references(() => user.id), name: text('name').notNull(),
  emails: jsonb('emails').$type<string[]>().notNull(), version: integer('version').notNull().default(1),
});
export const rhythmItems = pgTable('rhythm_items', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id),
  creatorId: text('creator_id').notNull().references(() => user.id), title: text('title').notNull(), description: text('description').notNull().default(''),
  important: boolean('important').notNull().default(false), manualUrgent: boolean('manual_urgent').notNull().default(false),
  hasDeadline: boolean('has_deadline').notNull().default(true), category: text('category').notNull().default('task'), frequency: text('frequency').notNull(), startDate: date('start_date').notNull(), endDate: date('end_date'),
  completionMode: text('completion_mode').notNull(), assigneeIds: jsonb('assignee_ids').$type<string[]>().notNull(),
  archived: boolean('archived').notNull().default(false), version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const rhythmOccurrences = pgTable('rhythm_occurrences', {
  id: text('id').primaryKey(), itemId: text('item_id').notNull().references(() => rhythmItems.id), dueDate: date('due_date').notNull(), scheduledDate:date('scheduled_date'),
  reports: jsonb('reports').$type<Record<string, string>>().notNull().default({}), completions: jsonb('completions').$type<Record<string, string>>().notNull().default({}), completedBy: text('completed_by').references(() => user.id),
  completedAt: timestamp('completed_at', { withTimezone: true }), urgent: boolean('urgent').notNull().default(false), version: integer('version').notNull().default(1),
}, (t) => [uniqueIndex('rhythm_occurrence_schedule').on(t.itemId, sql`coalesce(${t.scheduledDate},${t.dueDate})`)]);
export const rhythmMail = pgTable('rhythm_mail', {
  id: text('id').primaryKey(), occurrenceId: text('occurrence_id').notNull().references(() => rhythmOccurrences.id),
  recipientId: text('recipient_id').notNull().references(() => user.id), kind: text('kind').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }), skippedAt: timestamp('skipped_at', { withTimezone: true }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }), attempts: integer('attempts').notNull().default(0),
  payload: jsonb('payload').$type<{ from: string; to: string[]; subject: string; text: string }>(), firstAttemptAt: timestamp('first_attempt_at', { withTimezone: true }),
}, (t) => [uniqueIndex('rhythm_mail_once').on(t.occurrenceId, t.recipientId, t.kind)]);

export const documentEntries = pgTable('document_entries', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id),
  folderId: text('folder_id').notNull(), creatorId: text('creator_id').notNull().references(() => user.id),
  title: text('title').notNull(), body: text('body').notNull().default(''), documentDate: date('document_date'),
  archived: boolean('archived').notNull().default(false), version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const documentAttachments = pgTable('document_attachments', {
  id: text('id').primaryKey(), entryId: text('entry_id').notNull().references(() => documentEntries.id),
  filename: text('filename').notNull(), contentType: text('content_type').notNull(), byteSize: integer('byte_size').notNull(),
  contentBase64: text('content_base64').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rhythmUndo = pgTable('rhythm_undo', { id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), actorId: text('actor_id').notNull(), kind: text('kind').notNull(), entityId: text('entity_id').notNull(), snapshot: jsonb('snapshot').$type<{task?: typeof tasks.$inferSelect; item?: typeof rhythmItems.$inferSelect; occurrences: Array<typeof rhythmOccurrences.$inferSelect>}>().notNull(), expectedVersion: integer('expected_version').notNull(), expiresAt: timestamp('expires_at', {withTimezone:true}).notNull() });

export const workspaceSettings = pgTable('workspace_settings', {
  organizationId: text('organization_id').primaryKey().references(() => organizations.id),
  ownerId: text('owner_id').notNull().references(() => user.id),
  publicRead: boolean('public_read').notNull().default(true),
});

export const workspaceAccessGrants=pgTable('workspace_access_grants', {userId:text('user_id').primaryKey().references(()=>user.id),organizationId:text('organization_id').notNull().references(()=>organizations.id),grantedBy:text('granted_by').notNull().references(()=>user.id),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()});

export const documentUploads=pgTable('document_uploads',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull(),creatorId:text('creator_id').notNull(),
 filename:text('filename').notNull(),byteSize:integer('byte_size').notNull(),consumedBy:text('consumed_by'),
 expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),touchedAt:timestamp('touched_at',{withTimezone:true}).notNull().defaultNow(),
});
export const documentUploadChunks=pgTable('document_upload_chunks',{
 id:text('id').primaryKey(),uploadId:text('upload_id').notNull().references(()=>documentUploads.id,{onDelete:'cascade'}),
 chunkIndex:integer('chunk_index').notNull(),contentBase64:text('content_base64').notNull(),
});

export const deadlineRequests=pgTable('deadline_requests',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull(),requesterId:text('requester_id').notNull().references(()=>user.id),
 kind:text('kind').notNull(),taskId:text('task_id').notNull(),occurrenceId:text('occurrence_id'),title:text('title').notNull(),
 originalDate:date('original_date'),requestedDate:date('requested_date').notNull(),reason:text('reason').notNull(),status:text('status').notNull().default('pending'),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),resolvedAt:timestamp('resolved_at',{withTimezone:true}),resolvedBy:text('resolved_by').references(()=>user.id),
});
export const pushSubscriptions=pgTable('push_subscriptions',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull(),userId:text('user_id').notNull().references(()=>user.id),endpoint:text('endpoint').notNull().unique(),p256dh:text('p256dh').notNull(),auth:text('auth').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});
export const pushEvents=pgTable('push_events',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull(),recipientId:text('recipient_id').notNull().references(()=>user.id),title:text('title').notNull(),body:text('body').notNull(),url:text('url').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),sentAt:timestamp('sent_at',{withTimezone:true}),attempts:integer('attempts').notNull().default(0),
});
export const pushConfig=pgTable('push_config',{organizationId:text('organization_id').primaryKey(),publicKey:text('public_key').notNull(),encryptedPrivateKey:text('encrypted_private_key').notNull()});
export const expiredTaskRecords=pgTable('expired_task_records',{taskKey:text('task_key').primaryKey(),expiredAt:timestamp('expired_at',{withTimezone:true}).notNull().defaultNow()});
