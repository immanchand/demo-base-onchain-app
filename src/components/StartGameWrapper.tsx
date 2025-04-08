'use client';
import { useCallback, useImperativeHandle, forwardRef } from 'react';

interface StartGameWrapperProps {
  gameId: string;
  playerAddress: string;
  onStatusChange: (status: 'idle' | 'pending' | 'success' | 'error', errorMessage?: string) => void;
}

const StartGameWrapper = forwardRef<{ startGame: () => Promise<void> }, StartGameWrapperProps>(
  ({ gameId, playerAddress, onStatusChange }, ref) => {
    const startGame = useCallback(async () => {
      try {
        onStatusChange('pending');
        const response = await fetch('/api/game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start', gameId, playerAddress }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to start game');
        onStatusChange('success');
      } catch (error) {
        onStatusChange('error', error instanceof Error ? error.message : 'Unknown error');
      }
    }, [gameId, playerAddress, onStatusChange]);

    useImperativeHandle(ref, () => ({ startGame }));
    return null;
  }
);

StartGameWrapper.displayName = 'StartGameWrapper';
export default StartGameWrapper;
