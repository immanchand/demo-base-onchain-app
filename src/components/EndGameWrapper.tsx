'use client';
import { useCallback, useImperativeHandle, useEffect, forwardRef } from 'react';
import { useCsrf } from 'src/context/CsrfContext';
import { useAccount } from 'wagmi';

interface EndGameWrapperProps {
  gameId: string;
  score: string;
  highScore: string;
  onStatusChange: (status: 'idle' | 'pending' | 'leader' | 'loser' | 'error', errorMessage?: string, highScore?: string) => void;
}

const EndGameWrapper = forwardRef<{ endGame: () => Promise<void> }, EndGameWrapperProps>(
  ({ gameId, score, highScore, onStatusChange }, ref) => {
    const { csrfToken, refreshCsrfToken } = useCsrf();
    const xapporigin = process.env.NEXT_PUBLIC_APP_ORIGIN;
    const { address } = useAccount();


    const endGame = useCallback(async () => {
      if (!csrfToken) {
        onStatusChange('error', 'Security token not loaded');
        return;
      }
      if (!xapporigin) {
        onStatusChange('error', 'Application origin not defined');
        return;
      }
      if (!gameId) {
        onStatusChange('error', 'Missing gameId');
        return;
      }
      if (!score) {
        onStatusChange('error', 'Missing score');
        return;
      }
      if (!highScore) {
        onStatusChange('error', 'Missing highScore');
        return;
      }

      // Early check for loser status
      if (Number(score) <= Number(highScore)) {
        onStatusChange('loser', undefined, highScore.toString());
        return;
      }

      try {
        onStatusChange('pending');
        const response = await fetch('/api/server', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            'X-App-Origin': xapporigin,
          },
          credentials: 'include', // Sends gameSig and sessionId cookies
          body: JSON.stringify({ action: 'end-game', gameId, address, score }),
        });

        console.log('End game response:', response);
        const data = await response.json();
        console.log('End game data:', data);
        
        if (data.status === 'success') {
          const isNewHighScore = data.isHighScore; // From backend response
          const updatedHighScore = data.highScore || highScore; // Fallback to prop if not provided
          console.log('Game ended successfully, tx hash:', data.txHash, 'isNewHighScore:', isNewHighScore);
          onStatusChange(isNewHighScore ? 'leader' : 'loser', undefined, updatedHighScore.toString());
        } else {
          throw new Error(data.message || 'Failed to end game');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('End game error:', error);
        onStatusChange('error', errorMsg);
      }
    }, [gameId, address, score, highScore, csrfToken, onStatusChange]);

    useImperativeHandle(ref, () => ({
      endGame,
    }));

    return null; // No UI elements
  }
);

EndGameWrapper.displayName = 'EndGameWrapper';

export default EndGameWrapper;
