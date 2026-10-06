'use client';

import { createContext, useContext } from 'react';
import type { AppRole } from './navigation';

/**
 * The signed-in user's role, resolved on the server by the (app) layout and
 * passed down here. Pages used to fetch it client-side (or hardcode it), which
 * made the sidebar render the wrong menu.
 */
const RoleContext = createContext<AppRole>('uploader');

export const RoleProvider = RoleContext.Provider;

export function useRole(): AppRole {
  return useContext(RoleContext);
}
