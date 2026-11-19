import {createHash} from 'node:crypto';
import {AppError, assertWrite, type Principal} from './policy';

export const documentUploadContextChangedCode = 'DOCUMENT_UPLOAD_CONTEXT_CHANGED';

export class DocumentUploadContextChanged extends AppError {
  constructor() {
    super(409, 'החיבור למרחב העבודה השתנה. יש לבחור את הקבצים מחדש');
  }
}

export function documentUploadContext(principal: Principal, sessionId: string) {
  return {
    userId: principal.userId,
    organizationId: principal.organizationId,
    workspaceOwnerId: principal.workspaceOwnerId ?? '',
    sessionMarker: createHash('sha256').update('document-upload-context:').update(sessionId).digest('hex'),
  };
}

const fields = {
  userId: 'x-document-user',
  organizationId: 'x-document-organization',
  workspaceOwnerId: 'x-document-owner',
  sessionMarker: 'x-document-session',
} as const;

export function assertDocumentUploadContext(headers: Headers, principal: Principal, sessionId: string) {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  // Old foreground callers are unchanged. Background callers supply all four.
  if (!keys.some(key => headers.has(fields[key]))) return;
  const expected = documentUploadContext(principal, sessionId);
  if (keys.some(key => headers.get(fields[key]) !== expected[key]))
    throw new DocumentUploadContextChanged();
  assertWrite(principal);
}
