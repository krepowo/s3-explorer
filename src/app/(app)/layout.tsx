import { redirect } from 'next/navigation';
import { getActor } from '@/lib/auth';
import { RoleProvider } from '@/components/layout/RoleContext';

/**
 * Route group for authenticated app pages. The APIs enforce auth on their own;
 * this guard exists so a signed-out visitor lands on /login instead of seeing
 * an empty shell full of failed requests.
 *
 * The role is resolved here, once, so every page renders the right sidebar
 * without asking the client to fetch it.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect('/login');

  return <RoleProvider value={actor.role}>{children}</RoleProvider>;
}
