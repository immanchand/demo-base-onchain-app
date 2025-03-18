// GetGamesWrapper.tsx
'use client';
import { createPublicClient, http } from 'viem';
import type { Address, Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { contractABI, contractAddress, GAME_COUNT } from '../constants';
import React, { useEffect, useState } from 'react';

interface GameData {
  gameId: number;
  endTime: bigint;
  highScore: bigint;
  leader: Address;
  pot: bigint;
  error?: boolean;
}

interface GetGamesWrapperProps {
  onGamesUpdate: (games: GameData[]) => void;
}

export default function GetGamesWrapper({ onGamesUpdate }: GetGamesWrapperProps) {
  const [games, setGames] = useState<GameData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchGames() {
      setIsLoading(true);
      const client = createPublicClient({
        chain: baseSepolia,
        transport: http(),
      });

      const gameResults: GameData[] = [];

      for (let gameId = GAME_COUNT; gameId >= 1; gameId--) {
        try {
          const { endTime, highScore, leader, pot } = await client.readContract({
            address: contractAddress,
            abi: contractABI,
            functionName: 'getGame',
            args: [BigInt(gameId)],
          });

          console.log(`Game ${gameId}:`, { endTime, highScore, leader, pot });
          const gameData = { gameId, endTime, highScore, leader, pot };
          gameResults.push(gameData);
        } catch (error) {
          console.error(`Error fetching game ${gameId}:`, error);
          const errorGame = { gameId, endTime: 0n, highScore: 0n, leader: '0x0' as Address, pot: 0n, error: true };
          gameResults.push(errorGame);
        }
        setGames([...gameResults]);
        onGamesUpdate([...gameResults]);
        await new Promise(resolve => setTimeout(resolve, 100)); // Optional delay
      }

      setIsLoading(false);
    }

    fetchGames();
  }, [onGamesUpdate]);

  return null;
}
