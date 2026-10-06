import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HttpError, route } from '@/lib/api/route';

describe('route wrapper', () => {
  it('passes a normal response through', async () => {
    const handler = route(async () => new Response('ok'));
    expect(await (await handler()).text()).toBe('ok');
  });

  it('turns an HttpError into its status', async () => {
    const handler = route(async () => {
      throw new HttpError(403, 'Forbidden');
    });
    const res = await handler();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('turns a ZodError into a 400 instead of a 500', async () => {
    // Guards must not let a bad query string surface as an unexplained 500.
    const schema = z.object({ limit: z.coerce.number().max(100) });
    const handler = route(async () => {
      schema.parse({ limit: '200' });
      return new Response('unreachable');
    });

    const res = await handler();
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe('Invalid request');
    expect(body.issues).toEqual([{ path: 'limit', message: expect.any(String) }]);
  });

  it('rethrows anything else so real bugs stay visible', async () => {
    const handler = route(async () => {
      throw new Error('boom');
    });
    await expect(handler()).rejects.toThrow('boom');
  });
});
