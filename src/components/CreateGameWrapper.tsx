// CreateGameWrapper.tsx
'use client';
import { useCallback, useImperativeHandle, forwardRef } from 'react';
import { useCsrf } from 'src/context/CsrfContext'; // Replaced useCsrfToken
import { useAccount } from 'wagmi';


interface CreateGameWrapperProps {
  onStatusChange: (status: 'idle' | 'pending' | 'success' | 'error', errorMessage?: string) => void;
}

const CreateGameWrapper = forwardRef<{ createGame: () => Promise<void> }, CreateGameWrapperProps>(
  ({ onStatusChange }, ref) => {
    const { csrfToken, refreshCsrfToken } = useCsrf();
    const xapporigin = process.env.NEXT_PUBLIC_APP_ORIGIN;
    const { address } = useAccount();
    const createGame = useCallback(async (isRetry = false): Promise<void> => {
      
      if (!csrfToken) { //check it again after refreshing
        onStatusChange('error', 'Security token not loaded');
        return;
      }
      if (!xapporigin) {
        onStatusChange('error', 'Application origin not defined');
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
          body: JSON.stringify({ action: 'create-game', address }),
        });
        console.log('going to do const data = await response.json();');
        const data = await response.json();
        console.log('data = await response.json() = ',data);
        if (data.status === 'success') {
          console.log('Game created successfully, hash:', data.txHash);
          onStatusChange('success', `Transaction hash: ${data.txHash}`);
        } else {
          throw new Error(data.message || 'Failed to create game');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Create game error:', error);
        
        // Check if the error is due to an invalid CSRF token and handle retry
        if (errorMsg.includes('Invalid or missing CSRF token') && !isRetry) {
          console.log('Refreshing CSRF token due to invalid token');
          await refreshCsrfToken();
          console.log('Retrying createGame with new CSRF token');
          return createGame(true); // Retry with the new token, marking it as a retry
        }

        // If not retryable or retry failed, show error to user
        onStatusChange('error', errorMsg);
      }
    }, [csrfToken, refreshCsrfToken, onStatusChange]);

    useImperativeHandle(ref, () => ({
      createGame: () => createGame(false), // Initial call is not a retry
    }));

    return null;
  }
);

CreateGameWrapper.displayName = 'CreateGameWrapper';

export default CreateGameWrapper;
