import { describe, expect, it } from 'vitest';
import {
  MAX_API_PROXY_BODY_BYTES,
  PayloadTooLargeError,
  readBodyWithinLimit,
} from './body-limits';

describe('API proxy request body limit', () => {
  it('reads and combines request chunks up to the configured limit', async () => {
    const request = new Request('http://localhost/api', {
      method: 'POST',
      body: new Blob([new Uint8Array([1, 2]), new Uint8Array([3, 4])]),
    });

    expect(await readBodyWithinLimit(request)).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
  });

  it('rejects a declared request size before reading its body', async () => {
    const request = new Request('http://localhost/api', {
      method: 'POST',
      headers: { 'content-length': String(MAX_API_PROXY_BODY_BYTES + 1) },
      body: 'x',
    });

    await expect(readBodyWithinLimit(request)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
  });

  it('rejects streamed body chunks that cross the limit', async () => {
    const request = new Request('http://localhost/api', {
      method: 'POST',
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_API_PROXY_BODY_BYTES));
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
      }),
      // Required by the Node Fetch implementation for streaming request bodies.
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    await expect(readBodyWithinLimit(request)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
  });
});
