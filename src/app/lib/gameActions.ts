'use server';
// src/lib/gameActions.ts
import { createWalletClient, http, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { contractABI, contractAddress, publicClient } from 'src/constants';

const gameMasterClient = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount(process.env.GAME_MASTER_PRIVATE_KEY as `0x${string}`),
});

export async function performGameAction({ action, gameId, playerAddress, score }: {
  action: 'create' | 'start' | 'end' | 'withdraw';
  gameId?: string;
  playerAddress?: string;
  score?: string;
}) {
  if ((action === 'start' || action === 'end') && (!gameId || !playerAddress)) {
    throw new Error('Missing gameId or playerAddress for start/end actions');
  }
  if (action === 'end' && !score) {
    throw new Error('Missing score for end action');
  }
  if (action === 'withdraw' && !gameId) {
    throw new Error('Missing gameId for withdraw action');
  }

  let hash;
  switch (action) {
    case 'create':
      hash = await gameMasterClient.sendTransaction({
        to: contractAddress,
        data: encodeFunctionData({ abi: contractABI, functionName: 'createGame' }),
      });
      break;
    case 'start':
      hash = await gameMasterClient.sendTransaction({
        to: contractAddress,
        data: encodeFunctionData({
          abi: contractABI,
          functionName: 'startGame',
          args: [BigInt(gameId!), playerAddress! as `0x${string}`],
        }),
      });
      break;
    case 'end':
      hash = await gameMasterClient.sendTransaction({
        to: contractAddress,
        data: encodeFunctionData({
          abi: contractABI,
          functionName: 'endGame',
          args: [BigInt(gameId!), playerAddress! as `0x${string}`, BigInt(score!)],
        }),
      });
      break;
    case 'withdraw':
      hash = await gameMasterClient.sendTransaction({
        to: contractAddress,
        data: encodeFunctionData({
          abi: contractABI,
          functionName: 'winnerWithdraw',
          args: [BigInt(gameId!)],
        }),
      });
      break;
    default:
      throw new Error('Invalid action');
  }
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status };
}
