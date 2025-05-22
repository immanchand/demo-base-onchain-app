'use client';
import './global.css';
import '@coinbase/onchainkit/styles.css';
import '@rainbow-me/rainbowkit/styles.css';
import dynamic from 'next/dynamic';
import { NEXT_PUBLIC_URL } from '../config';
import { useEffect, useState } from 'react';

const OnchainProviders = dynamic(() => import('src/components/OnchainProviders'), { ssr: false });

export const viewport = {
  width: 'device-width',
  initialScale: 1.0,
};

export const metadata = {
  title: 'Stupid Games',
  description: 'Play Stupid Games, Win Awesome Prizes!',
  openGraph: {
    title: 'Stupid Games',
    description: 'Play Stupid Games, Win Awesome Prizes!',
    images: [`${NEXT_PUBLIC_URL}/vibes/vibes-19.png`],
  },
};

import { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {

  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const updateOrientation = () => {
      const wToHRatio = window.innerWidth / window.innerHeight;
      const isMobile = window.innerWidth <= 640; // Tailwind 'sm' breakpoint
      setIsPortrait(isMobile && wToHRatio < 1); // Portrait if mobile and w/h < 1
    };

    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    return () => window.removeEventListener('resize', updateOrientation);
  }, []);

  return (
    <html lang="en" className={isPortrait ? 'rotate-portrait' : ''}>
      <body className="flex items-center justify-center">
        <OnchainProviders>{children}</OnchainProviders>
      </body>
    </html>
  );
}
