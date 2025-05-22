import './global.css';
import '@coinbase/onchainkit/styles.css';
import '@rainbow-me/rainbowkit/styles.css';
import dynamic from 'next/dynamic';
import { NEXT_PUBLIC_URL } from '../config';
import OrientationWrapper from '../components/OrientationWrapper';

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
  return (
    <html lang="en">
      <body>
        <OnchainProviders>
          <OrientationWrapper>{children}</OrientationWrapper>
        </OnchainProviders>
      </body>
    </html>
  );
}
