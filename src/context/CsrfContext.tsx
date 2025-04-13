// src/context/CsrfContext.tsx
'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface CsrfContextType {
  csrfToken: string | null;
  refreshCsrfToken: () => Promise<string | null>;
}

const CsrfContext = createContext<CsrfContextType | undefined>(undefined);

export const CsrfProvider = ({ children }: { children: ReactNode }) => {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const xapporigin = process.env.NEXT_PUBLIC_APP_ORIGIN;

  const fetchCsrfToken = async () => {
    if (!xapporigin) {
      console.error('NEXT_PUBLIC_APP_ORIGIN is not defined');
      return null;
    }
    try {
      const response = await fetch('/api/csrf', {
        method: 'GET',
        credentials: 'include',
        headers: { 'X-App-Origin': xapporigin },
      });
      const data = await response.json();
      setCsrfToken(data.token);
      return data.token;
    } catch (error) {
      console.error('Failed to fetch CSRF token:', error);
      setCsrfToken(null);
      return null;
    }
  };

  useEffect(() => {
    fetchCsrfToken(); // Fetch on mount
  }, []);

  return (
    <CsrfContext.Provider value={{ csrfToken, refreshCsrfToken: fetchCsrfToken }}>
      {children}
    </CsrfContext.Provider>
  );
};

export const useCsrf = () => {
  const context = useContext(CsrfContext);
  if (!context) {
    throw new Error('useCsrf must be used within a CsrfProvider');
  }
  return context;
};
