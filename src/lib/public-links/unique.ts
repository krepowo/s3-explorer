import 'server-only';
import { db } from '@/lib/db';
import { generatePublicToken } from '.';

/**
 * A token that is not already taken.
 *
 * Five letters collide far sooner than the old 128-bit value (birthday bound is
 * around 3–4k users), so the free check matters. The unique index on
 * `User.publicToken` is the backstop if two creations race.
 */
export async function newPublicToken(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generatePublicToken();
    const taken = await db.user.findUnique({
      where: { publicToken: token },
      select: { id: true },
    });
    if (!taken) return token;
  }
  throw new Error('Could not allocate a unique public token.');
}
