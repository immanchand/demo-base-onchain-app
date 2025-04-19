// EndGameWrapper.tsx
'use client';
import { useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import { useCsrf } from 'src/context/CsrfContext';
import { useAccount } from 'wagmi';
import { GameStats, TELEMETRY_SCORE_THRESHOLD} from 'src/constants';
// Extend the Window interface to include grecaptcha
declare global {
  interface Window {
    grecaptcha: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

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

    useEffect(() => {
      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/api.js?render=${process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}`;
      script.async = true;
      //script.crossOrigin = "anonymous";
      document.body.appendChild(script);
      return () => {
        document.body.removeChild(script);
      };
    }, []);

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
        // Get reCAPTCHA token
        let recaptchaToken = '';
        try {
          recaptchaToken = await new Promise((resolve) => {
            window.grecaptcha.ready(() => {
              window.grecaptcha
                .execute(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || (() => { throw new Error('RECAPTCHA_SITE_KEY is not defined'); })(), { action: 'startGame' })
                .then(resolve);
            });
          });
        } catch (error) {
          console.log('CAPTCHA error: ', error);
          onStatusChange('error', 'CAPTCHA initialization failed');
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
              telemetry: Number(score) >= TELEMETRY_SCORE_THRESHOLD ? telemetry : [],
              stats: Number(score) >= TELEMETRY_SCORE_THRESHOLD ? stats : null,
              recaptchaToken 
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
