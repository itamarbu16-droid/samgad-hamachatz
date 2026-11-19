import { api } from '@/server/http';
import { documentUploadContext } from '@/server/document-upload-context';
import { assertWrite } from '@/server/policy';

export async function GET(request: Request) {
  return api(request, async (principal, sessionId) => {
    assertWrite(principal);
    return documentUploadContext(principal, sessionId);
  });
}
