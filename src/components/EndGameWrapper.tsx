// EndGameWrapper.tsx
'use client';
import { useCallback, useImperativeHandle, forwardRef } from 'react';
import { useCsrf } from 'src/context/CsrfContext';
import { useAccount } from 'wagmi';
import { GameStats } from 'src/constants';

interface TelemetryEvent {
  event: string;
  time: number;
  data?: any;
}


interface EndGameWrapperProps {
  gameId: string;
  score: string;
  highScore: string;
  telemetry: TelemetryEvent[];
  stats: GameStats | null;
  onStatusChange: (
    status: 'idle' | 'pending' | 'leader' | 'loser' | 'error',
    errorMessage?: string,
    highScore?: string
  ) => void;
}

const EndGameWrapper = forwardRef<{ endGame: () => Promise<void> }, EndGameWrapperProps>(
  ({ gameId, score, highScore, telemetry, stats, onStatusChange }, ref) => {
    const { csrfToken, refreshCsrfToken } = useCsrf();
    const xapporigin = process.env.NEXT_PUBLIC_APP_ORIGIN;
    const { address } = useAccount();

    const endGame = useCallback(
      async (isRetry = false) => {
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

        // Early check for loser status (client-side)
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
            credentials: 'include',
            body: JSON.stringify({
              action: 'end-game',
              gameId,
              address,
              score,
              telemetry: Number(score) >= 2000 ? telemetry : [],
              stats: Number(score) >= 2000 ? stats : null,
            }),
          });

          const data = await response.json();
          if (data.status === 'success') {
            const isNewHighScore = data.isHighScore;
            const updatedHighScore = data.highScore || highScore;
            console.log('Game ended successfully, tx hash:', data.txHash, 'isNewHighScore:', isNewHighScore);
            onStatusChange(isNewHighScore ? 'leader' : 'loser', undefined, updatedHighScore.toString());
          } else if (data.status.includes('Fail')) {
            throw new Error(data.status);
          } else {
            throw new Error(data.message || 'Failed to end game');
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          if (errorMsg.includes('Invalid or missing CSRF token') && !isRetry) {
            console.log('Refreshing CSRF token due to invalid token');
            await refreshCsrfToken();
            console.log('Retrying endGame with new CSRF token');
            return endGame(true);
          }
          console.error('End game error:', error);
          onStatusChange('error', errorMsg);
        }
      },
      [gameId, address, score, highScore, telemetry, stats, csrfToken, refreshCsrfToken, onStatusChange]
    );

    useImperativeHandle(ref, () => ({
      endGame,
    }));

    return null;
  }
);

EndGameWrapper.displayName = 'EndGameWrapper';

export default EndGameWrapper;
