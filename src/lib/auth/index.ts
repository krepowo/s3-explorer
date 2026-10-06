import 'server-only';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { HttpError } from '@/lib/api/route';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Actor = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'uploader';
};

// ─── Constants ────────────────────────────────────────────────────────────────

const COOKIE = 's3exp_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days sliding
const DEFAULT_UPLOAD_LIMIT = 2n * 1024n * 1024n * 1024n; // 2 GB

// ─── Password ─────────────────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// ─── Session token ────────────────────────────────────────────────────────────

function tokenHash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// ─── Login / logout ───────────────────────────────────────────────────────────

export async function createSession(
  userId: string,
  meta: { userAgent?: string; ip?: string },
): Promise<string> {
  const raw = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.session.create({
    data: {
      userId,
      tokenHash: tokenHash(raw),
      userAgent: meta.userAgent,
      ip: meta.ip,
      expiresAt,
    },
  });

  return raw;
}

export async function setSessionCookie(raw: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(Date.now() + SESSION_TTL_MS),
  });
}

export async function deleteSession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) {
    await db.session.deleteMany({ where: { tokenHash: tokenHash(raw) } }).catch(() => {});
    jar.delete(COOKIE);
  }
}

// ─── Session resolution ───────────────────────────────────────────────────────

async function resolveActor(): Promise<Actor | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;

  const hash = tokenHash(raw);
  const session = await db.session.findUnique({
    where: { tokenHash: hash },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) return null;
  if (!session.user.isActive) return null;

  // Sliding: extend expiry on active use. The DB update is always safe; the
  // cookie refresh is only allowed in route handlers and server actions, so a
  // server component render (e.g. the app layout) silently skips it.
  const newExpiry = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.update({
    where: { id: session.id },
    data: { expiresAt: newExpiry },
  }).catch(() => {});

  try {
    const jar2 = await cookies();
    jar2.set(COOKIE, raw, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: newExpiry,
    });
  } catch {
    // Read-only cookie context — the session is still valid, it just keeps the
    // expiry already stored in the database.
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as Actor['role'],
  };
}

// ─── RBAC guards ──────────────────────────────────────────────────────────────

/** Returns the actor or null — for optional-auth pages. */
export async function getActor(): Promise<Actor | null> {
  return resolveActor();
}

/** Throws 401 if not logged in. */
export async function requireUser(): Promise<Actor> {
  const actor = await resolveActor();
  if (!actor) throw new HttpError(401, 'Unauthorized');
  return actor;
}

/** Throws 403 if role not in allowed list. */
export function requireRole(actor: Actor, ...roles: Actor['role'][]): void {
  if (!roles.includes(actor.role)) {
    throw new HttpError(403, 'Forbidden');
  }
}

// ─── Upload limit ─────────────────────────────────────────────────────────────

export async function getUploadLimitBytes(userId: string): Promise<bigint> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { uploadLimitBytes: true },
  });
  return user?.uploadLimitBytes ?? DEFAULT_UPLOAD_LIMIT;
}
