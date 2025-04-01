'use client';
import { useCallback, useImperativeHandle, forwardRef } from 'react';
import { Address, encodeFunctionData, Hex } from 'viem';
import { BASE_SEPOLIA_CHAIN_ID, contractABI, contractAddress, publicClient } from 'src/constants';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

interface EndGameWrapperProps {
  gameId: string;
  playerAddress: string;
  score: string;
  highScore: string;
  onStatusChange: (status: 'idle' | 'pending' | 'leader' | 'loser' | 'error', errorMessage?: string, highScore?: string) => void;
}

// Load private key from .env
const gameMasterPrivateKey = process.env.NEXT_PUBLIC_GAME_MASTER_PRIVATE_KEY;
const gameMasterClient = gameMasterPrivateKey
  ? createWalletClient({
      chain: baseSepolia,
      transport: http(),
      account: privateKeyToAccount(gameMasterPrivateKey as Hex),
    })
  : null;

const EndGameWrapper = forwardRef<{ endGame: () => Promise<void> }, EndGameWrapperProps>(
  ({ gameId, playerAddress, score, highScore, onStatusChange }, ref) => {
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

    const handleEndGame = useCallback(async () => {
      if (!gameMasterClient || !gameId || !playerAddress || !score) {
        onStatusChange('error', 'Missing required parameters or game master client is not initialized.');
        return;
      }

      if (Number(score)<=Number(highScore)) {
        onStatusChange('loser', undefined, highScore.toString());
        return;
      }

      try {
        onStatusChange('pending');

        // Prepare the arguments
        const gameIdBigInt = BigInt(gameId);
        const playerAddr = playerAddress as Address;
        const scoreBigInt = BigInt(score);

        // Simulate the contract call to get return values
        const { result } = await publicClient.simulateContract({
          address: contractAddress,
          abi: contractABI,
          functionName: 'endGame',
          args: [gameIdBigInt, playerAddr, scoreBigInt],
          account: gameMasterClient.account,
        });

        const [isNewHighScore, highScore] = result as [boolean, bigint];

        // Encode the function data for the transaction
        const callData = encodeFunctionData({
          abi: contractABI,
          functionName: 'endGame',
          args: [gameIdBigInt, playerAddr, scoreBigInt],
        });

        // Execute the transaction
        const hash = await gameMasterClient.sendTransaction({
          to: contractAddress as Hex,
          data: callData,
          value: BigInt(0),
          chainId: BASE_SEPOLIA_CHAIN_ID,
        });

        // Wait for transaction confirmation
        await publicClient.waitForTransactionReceipt({ hash });

        // Update status based on whether the player set a new high score
        onStatusChange(isNewHighScore ? 'leader' : 'loser', undefined, highScore.toString());
        console.log('Game ended successfully, tx hash:', hash, 'isNewHighScore:', isNewHighScore, 'highScore:', highScore.toString());
      } catch (error) {
        console.error('End game error:', error);
        onStatusChange('error', parseErrorMessage(error));
      }
    }, [gameId, playerAddress, score, onStatusChange]);

    useImperativeHandle(ref, () => ({
      endGame: handleEndGame,
    }));

    return null; // No UI elements
  }
);

EndGameWrapper.displayName = 'EndGameWrapper';

export default EndGameWrapper;
