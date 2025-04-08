// src/app/api/game/route.ts
import { createWalletClient, http, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { contractABI, contractAddress, publicClient } from 'src/constants';
import { NextResponse } from 'next/server';

const gameMasterClient = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount(process.env.GAME_MASTER_PRIVATE_KEY as `0x${string}`),
});

export async function POST(request: Request) {
  const { action, gameId, playerAddress, score } = await request.json();

  if (!action) {
    return NextResponse.json({ error: 'Missing action parameter' }, { status: 400 });
  }

  // Validate parameters based on action
  if ((action === 'start' || action === 'end') && (!gameId || !playerAddress)) {
    return NextResponse.json({ error: 'Missing gameId or playerAddress for start/end actions' }, { status: 400 });
  }
  if (action === 'end' && !score) {
    return NextResponse.json({ error: 'Missing score for end action' }, { status: 400 });
  }
  if (action === 'withdraw' && !gameId) {
    return NextResponse.json({ error: 'Missing gameId for withdraw action' }, { status: 400 });
  }

  try {
    let hash;
    switch (action) {
      case 'create':
        const createData = encodeFunctionData({
          abi: contractABI,
          functionName: 'createGame',
        });
        hash = await gameMasterClient.sendTransaction({
          to: contractAddress,
          data: createData,
        });
        break;

      case 'start':
        const startData = encodeFunctionData({
          abi: contractABI,
          functionName: 'startGame',
          args: [BigInt(gameId), playerAddress],
        });
        hash = await gameMasterClient.sendTransaction({
          to: contractAddress,
          data: startData,
        });
        break;

      case 'end':
        const endData = encodeFunctionData({
          abi: contractABI,
          functionName: 'endGame',
          args: [BigInt(gameId), playerAddress, BigInt(score)],
        });
        hash = await gameMasterClient.sendTransaction({
          to: contractAddress,
          data: endData,
        });
        break;

      case 'withdraw':
        const withdrawData = encodeFunctionData({
          abi: contractABI,
          functionName: 'winnerWithdraw',
          args: [BigInt(gameId)],
        });
        hash = await gameMasterClient.sendTransaction({
          to: contractAddress,
          data: withdrawData,
        });
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return NextResponse.json({ hash, status: receipt.status });
  } catch (error) {
    const errorMessage = (error as { details?: string; message?: string }).details || (error as { message?: string }).message || 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
