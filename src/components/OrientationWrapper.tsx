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
    <>
      {isPortrait && (
        <div className="fixed inset-0 bg-[var(--primary-bg)] bg-opacity-90 flex items-center justify-center z-[1000]">
          <div className="text-center p-4">
            <h2 className="text-2xl font-bold text-[var(--accent-yellow)]">Rotate Your Device</h2>
            <p className="text-[var(--primary-text)] mt-2">Please rotate to landscape mode for the best Stupid Games experience!</p>
          </div>
        </div>
      )}
      <div className={isPortrait ? 'rotate-portrait' : ''}>{children}</div>
    </>
  );
}
