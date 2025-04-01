'use client';
import { useCallback, useImperativeHandle, forwardRef } from 'react';
import { Address, encodeFunctionData, Hex } from 'viem';
import { BASE_SEPOLIA_CHAIN_ID, contractABI, contractAddress } from '../constants';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { publicClient } from '../constants';

interface StartGameWrapperProps {
  gameId: string;
  playerAddress: string;
  onStatusChange: (status: 'idle' | 'pending' | 'success' | 'error', errorMessage?: string) => void;
}

const gameMasterPrivateKey = process.env.NEXT_PUBLIC_GAME_MASTER_PRIVATE_KEY;
const gameMasterClient = gameMasterPrivateKey
  ? createWalletClient({
      chain: baseSepolia,
      transport: http(),
      account: privateKeyToAccount(gameMasterPrivateKey as Hex),
    })
  : null;

const StartGameWrapper = forwardRef<{ startGame: () => Promise<void> }, StartGameWrapperProps>(
  ({ gameId, playerAddress, onStatusChange }, ref) => {
    const parseErrorMessage = (error: unknown): string => {
      if (error instanceof Error) {
        const fullMessage = error.message;
        const detailsIndex = fullMessage.indexOf('Details:');
        if (detailsIndex !== -1) {
          const detailsStart = detailsIndex + 'Details:'.length;
          const nextNewline = fullMessage.indexOf('\n', detailsStart);
          const detailsEnd = nextNewline !== -1 ? nextNewline : fullMessage.length;
          return fullMessage.slice(detailsStart, detailsEnd).trim();
        }
        return fullMessage.split('\n')[0] || 'An unknown error occurred';
      }
      return 'An unknown error occurred';
    };

    const handleStartGame = useCallback(async () => {
      if (!gameMasterClient || !gameId || !playerAddress) {
        onStatusChange('error', 'Missing required data');
        return;
      }

      try {
        onStatusChange('pending');

        const callData = encodeFunctionData({
          abi: contractABI,
          functionName: 'startGame',
          args: [BigInt(gameId), playerAddress as Address],
        });

        const hash = await gameMasterClient.sendTransaction({
          to: contractAddress as Hex,
          data: callData,
          value: BigInt(0),
          chainId: BASE_SEPOLIA_CHAIN_ID,
        });

        // Wait for transaction confirmation
        await publicClient.waitForTransactionReceipt({ hash });

        onStatusChange('success');
        console.log('Game started successfully, tx hash:', hash);
      } catch (error) {
        console.error('Start game error:', error);
        onStatusChange('error', parseErrorMessage(error));
      }
    }, [gameId, playerAddress, onStatusChange]);

    useImperativeHandle(ref, () => ({
      startGame: handleStartGame,
    }));

    return null; // No UI elements
  }
);

StartGameWrapper.displayName = 'StartGameWrapper';

export default StartGameWrapper;
