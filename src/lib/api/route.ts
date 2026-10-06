import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/** Thrown by guards such as requireUser/requireRole; mapped to a real HTTP response. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Next.js route handlers do not turn a thrown Response into an HTTP response —
 * it surfaces as a 500. Wrapping handlers keeps the guards readable while
 * still returning 401/403 to the client.
 *
 * Invalid input is caught here too, so a bad query string is a 400 rather than
 * an unexplained 500 on every route that parses with Zod.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            error: 'Invalid request',
            issues: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
          { status: 400 },
        );
      }
      throw error;
    }
  };
}
