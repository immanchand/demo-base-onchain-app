'use client';
import { useEffect, useState } from 'react';
import { ReactNode } from 'react';

export default function OrientationWrapper({ children }: { children: ReactNode }) {
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
    <div className={isPortrait ? 'rotate-portrait' : ''}>
      {children}
    </div>
  );
}
