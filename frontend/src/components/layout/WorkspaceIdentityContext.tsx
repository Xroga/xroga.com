'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type WorkspaceIdentityStatus = 'authenticated' | 'guest';

export interface WorkspaceIdentity {
  status: WorkspaceIdentityStatus;
  userId?: string;
  displayName: string;
  email?: string;
}

const WorkspaceIdentityContext = createContext<WorkspaceIdentity>({
  status: 'authenticated',
  displayName: 'there',
});

export function WorkspaceIdentityProvider({
  children,
  status,
  userId,
  displayName,
  email,
}: WorkspaceIdentity & { children: ReactNode }) {
  return (
    <WorkspaceIdentityContext.Provider
      value={{ status, userId, displayName, email }}
    >
      {children}
    </WorkspaceIdentityContext.Provider>
  );
}

export function useWorkspaceIdentity() {
  return useContext(WorkspaceIdentityContext);
}
