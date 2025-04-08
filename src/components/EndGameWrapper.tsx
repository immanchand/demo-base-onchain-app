'use client';
import { useCallback, useImperativeHandle, forwardRef } from 'react';

interface EndGameWrapperProps {
  gameId: string;
  playerAddress: string;
  score: string;
  highScore: string;
  onStatusChange: (status: 'idle' | 'pending' | 'leader' | 'loser' | 'error', errorMessage?: string, highScore?: string) => void;
}

const EndGameWrapper = forwardRef<{ endGame: () => Promise<void> }, EndGameWrapperProps>(
  ({ gameId, playerAddress, score, highScore, onStatusChange }, ref) => {
    const endGame = useCallback(async () => {
      if (Number(score) <= Number(highScore)) {
        onStatusChange('loser', undefined, highScore);
        return;
      }
      try {
        onStatusChange('pending');
        const response = await fetch('/api/game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'end', gameId, playerAddress, score }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to end game');
        const isNewHighScore = Number(score) > Number(highScore); // Simplified check (server doesn’t return this yet)
        onStatusChange(isNewHighScore ? 'leader' : 'loser', undefined, isNewHighScore ? score : highScore);
      } catch (error) {
        onStatusChange('error', error instanceof Error ? error.message : 'Unknown error');
      }
    }, [gameId, playerAddress, score, highScore, onStatusChange]);

    useImperativeHandle(ref, () => ({ endGame }));
    return null;
  }
);

EndGameWrapper.displayName = 'EndGameWrapper';
export default EndGameWrapper;
