'use client';

import { createContext, useContext } from 'react';

interface ShellIdentity {
  displayName: string;
  email?: string;
}

const ShellIdentityContext = createContext<ShellIdentity>({ displayName: 'there' });

export function ShellIdentityProvider({
  children,
  displayName,
  email,
}: ShellIdentity & { children: React.ReactNode }) {
  return (
    <ShellIdentityContext.Provider value={{ displayName, email }}>
      {children}
    </ShellIdentityContext.Provider>
  );
}

export function useShellIdentity() {
  return useContext(ShellIdentityContext);
}
