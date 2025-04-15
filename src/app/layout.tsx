import './global.css';
import '@coinbase/onchainkit/styles.css';
import '@rainbow-me/rainbowkit/styles.css';
import dynamic from 'next/dynamic';
import { NEXT_PUBLIC_URL } from '../config';

const OnchainProviders = dynamic(() => import('src/components/OnchainProviders'), { ssr: false });

export const viewport = {
  width: 'device-width',
  initialScale: 1.0,
};

export const metadata = {
  title: 'Onchain App Template',
  description: 'Built with OnchainKit',
  openGraph: {
    title: 'Onchain App Template',
    description: 'Built with OnchainKit',
    images: [`${NEXT_PUBLIC_URL}/vibes/vibes-19.png`],
  },
};

import { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex items-center justify-center">
        <OnchainProviders>{children}</OnchainProviders>
      </body>
    </html>
  );
}
