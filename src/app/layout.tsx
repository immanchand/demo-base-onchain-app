'use client';
import './global.css';
import '@coinbase/onchainkit/styles.css';
import '@rainbow-me/rainbowkit/styles.css';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const OnchainProviders = dynamic(() => import('src/components/OnchainProviders'), { ssr: false });

export const viewport = {
  width: 568, // Landscape-like width for mobile
  initialScale: 1.0,
};

export const metadata = {
  title: 'Stupid Games',
  description: 'Play Stupid Games, Win Awesome Prizes!',
  openGraph: {
    title: 'Stupid Games',
    description: 'Play Stupid Games, Win Awesome Prizes!',
    images: ['/vibes/vibes-19.png'], // Static path, update after setting NEXT_PUBLIC_URL
  },
};

import { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  const [isPortrait, setIsPortrait] = useState<boolean | null>(null);

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

  // Skip rendering until isPortrait is determined to avoid hydration mismatch
  if (isPortrait === null) {
    return null;
  }

  return (
    <html lang="en" className={isPortrait ? 'rotate-portrait' : ''}>
      <body>
        <OnchainProviders>
          {isPortrait && (
            <div className="fixed inset-0 bg-[var(--primary-bg)] bg-opacity-90 flex items-center justify-center z-[1000]">
              <div className="text-center p-4">
                <h2 className="text-2xl font-bold text-[var(--accent-yellow)]">Rotate Your Device</h2>
                <p className="text-[var(--primary-text)] mt-2">Please rotate to landscape mode for the best Stupid Games experience!</p>
              </div>
            </div>
          )}
          {children}
        </OnchainProviders>
      </body>
    </html>
  );
}
