'use client';
import { useCallback, useImperativeHandle, forwardRef } from 'react';

interface CreateGameWrapperProps {
  onStatusChange: (status: 'idle' | 'pending' | 'success' | 'error', errorMessage?: string) => void;
}

const CreateGameWrapper = forwardRef<{ createGame: () => Promise<void> }, CreateGameWrapperProps>(
  ({ onStatusChange }, ref) => {
    const createGame = useCallback(async () => {
      try {
        onStatusChange('pending');
        const response = await fetch('/api/game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create' }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to create game');
        onStatusChange('success', `Transaction hash: ${data.hash}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        onStatusChange('error', errorMessage);
      }
    }, [onStatusChange]);

    useImperativeHandle(ref, () => ({ createGame }));
    return null;
  }
);

CreateGameWrapper.displayName = 'CreateGameWrapper';
export default CreateGameWrapper;
