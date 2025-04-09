'use client';
import { useCallback, useImperativeHandle, forwardRef } from 'react';
import { encodeFunctionData, Hex } from 'viem';
import { BASE_SEPOLIA_CHAIN_ID, contractABI, contractAddress, publicClient } from 'src/constants';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

interface CreateGameWrapperProps {
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

const CreateGameWrapper = forwardRef<{ createGame: () => Promise<void> }, CreateGameWrapperProps>(
  ({ onStatusChange }, ref) => {
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

    const createGame = useCallback(async () => {
      if (!gameMasterClient) {
        onStatusChange('error', 'Missing game master configuration');
        return;
      }

      if (!contractAddress || !contractABI) {
        onStatusChange('error', 'Invalid contract configuration');
        return;
      }

      try {
        onStatusChange('pending');
        const callData = encodeFunctionData({
          abi: contractABI,
          functionName: 'createGame',
        });

        const hash = await gameMasterClient.sendTransaction({
          to: contractAddress as Hex,
          data: callData,
          chainId: BASE_SEPOLIA_CHAIN_ID,
        });

        await publicClient.waitForTransactionReceipt({ hash });

        console.log('Game created successfully, hash:', hash);
        onStatusChange('success', `Transaction hash: ${hash}`);
      } catch (error) {
        const errorMsg = parseErrorMessage(error);
        onStatusChange('error', errorMsg);
      }
    }, [onStatusChange]);

    useImperativeHandle(ref, () => ({
      createGame,
    }));

    return null;
  }
);

CreateGameWrapper.displayName = 'CreateGameWrapper';

export default CreateGameWrapper;
