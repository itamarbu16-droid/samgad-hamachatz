import {beforeEach, describe, expect, it, vi} from 'vitest';
import {POST as create} from '../src/app/api/documents/route';
import {POST as begin} from '../src/app/api/documents/uploads/route';
import {POST as chunk} from '../src/app/api/documents/uploads/chunks/route';
import {GET as context} from '../src/app/api/documents/upload-context/route';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), principalFor: vi.fn(), create: vi.fn(), begin: vi.fn(), chunk: vi.fn(),
}));
vi.mock('next/server', () => ({after: vi.fn()}));
vi.mock('../src/server/notifications', () => ({flushPush: vi.fn()}));
vi.mock('../src/server/auth', () => ({getAuth: async () => ({api: {getSession: mocks.getSession}})}));
vi.mock('../src/server/service', () => ({principalFor: mocks.principalFor}));
vi.mock('../src/server/app-url', () => ({appUrl: () => 'https://example.test'}));
vi.mock('../src/server/documents', () => ({createDocument: mocks.create}));
vi.mock('../src/server/document-uploads', () => ({
  beginDocumentUpload: mocks.begin, putDocumentChunk: mocks.chunk,
}));

const session = {user: {id: 'user-1', name: 'Synthetic'}, session: {id: 'synthetic-session', token: 'never-return'}};
const principal = {userId: 'user-1', organizationId: 'org-1', workspaceOwnerId: 'owner-1', role: 'contributor'};
const scope = () => context(new Request('https://example.test/api/documents/upload-context'));
const routes = [
  {path: '/api/documents', handler: create, mutation: mocks.create},
  {path: '/api/documents/uploads', handler: begin, mutation: mocks.begin},
  {path: '/api/documents/uploads/chunks', handler: chunk, mutation: mocks.chunk},
];
function expectedHeaders(binding: {userId: string; organizationId: string; workspaceOwnerId: string; sessionMarker: string}) {
  return {
    'x-document-user': binding.userId,
    'x-document-organization': binding.organizationId,
    'x-document-owner': binding.workspaceOwnerId,
    'x-document-session': binding.sessionMarker,
  };
}
const request = (path: string, binding: Record<string, string> = {}, body = '{}') =>
  new Request('https://example.test' + path, {
    method: 'POST', body, headers: {origin: 'https://example.test', 'content-type': 'application/json', ...binding},
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.principalFor.mockResolvedValue(principal);
  for (const {mutation} of routes) mutation.mockResolvedValue({id: 'synthetic-record'});
});

it('returns an opaque session marker, scoped identity only, and does not cache the response', async () => {
  const response = await scope();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({
    userId: 'user-1', organizationId: 'org-1', workspaceOwnerId: 'owner-1',
    sessionMarker: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
});

it('requires an authenticated writer for the context', async () => {
  mocks.getSession.mockResolvedValueOnce(null);
  expect((await scope()).status).toBe(401);
  mocks.principalFor.mockResolvedValueOnce({...principal, role: 'viewer'});
  expect((await scope()).status).toBe(403);
});

describe.each(routes)('$path', ({path, handler, mutation}) => {
  it('rejects changed account, organization, owner or session before reading the body or mutating', async () => {
    const binding = expectedHeaders(await (await scope()).json());
    const changes = [
      {...principal, userId: 'another-user'},
      {...principal, organizationId: 'another-org'},
      {...principal, workspaceOwnerId: 'another-owner'},
      principal,
    ];
    for (const changed of changes) {
      mocks.principalFor.mockResolvedValueOnce(changed);
      if (changed === principal) mocks.getSession.mockResolvedValueOnce({...session, session: {id: 'new-session'}});
      const response = await handler(request(path, binding, 'unparsed body'));
      expect(response.status).toBe(409);
      expect(await response.json()).toHaveProperty('code', 'DOCUMENT_UPLOAD_CONTEXT_CHANGED');
    }
    expect(mutation).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated, demoted and partially bound mutations', async () => {
    const binding = expectedHeaders(await (await scope()).json());
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await handler(request(path, binding))).status).toBe(401);
    mocks.principalFor.mockResolvedValueOnce({...principal, role: 'viewer'});
    expect((await handler(request(path, binding))).status).toBe(403);
    expect((await handler(request(path, {'x-document-session': binding['x-document-session']}))).status).toBe(409);
    expect(mutation).not.toHaveBeenCalled();
  });

  it('allows an exact binding and is backwards-compatible with unbound foreground mutations', async () => {
    mocks.principalFor.mockResolvedValue({...principal, workspaceOwnerId: undefined});
    const binding = expectedHeaders(await (await scope()).json());
    expect(binding['x-document-owner']).toBe('');
    expect((await handler(request(path, binding))).status).toBe(200);
    expect((await handler(request(path))).status).toBe(200);
    expect(mutation).toHaveBeenCalledTimes(2);
  });
});
