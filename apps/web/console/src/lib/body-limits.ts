export const MAX_API_PROXY_BODY_BYTES = 10 * 1024 * 1024;

export class PayloadTooLargeError extends Error {
  constructor() {
    super('Request body exceeds the FishEye API proxy limit.');
  }
}

export async function readBodyWithinLimit(
  request: Request,
): Promise<ArrayBuffer | undefined> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_API_PROXY_BODY_BYTES
  ) {
    throw new PayloadTooLargeError();
  }
  if (!request.body) return undefined;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_API_PROXY_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer as ArrayBuffer;
}
