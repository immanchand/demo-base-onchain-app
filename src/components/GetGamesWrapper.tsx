'use client';
import { createPublicClient, http } from 'viem';
import type { Address } from 'viem';
import { baseSepolia } from 'viem/chains';
import { contractABI, contractAddress } from '../constants';
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

      // Fetch latestGameId from the contract
      const latestGameId = await client.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'getLatestGameId',
      });
      const maxGameId = Number(latestGameId);

      const gameResults: GameData[] = [];
      let gameOverCount = 0;
      const currentTime = BigInt(Math.floor(Date.now() / 1000)); // Current timestamp in seconds

      // Loop backwards from latestGameId to 1
      for (let gameId = maxGameId; gameId >= 1; gameId--) {
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

          // Check if the game is over (endTime <= currentTime)
          if (endTime <= currentTime) {
            gameOverCount++;
          }

          // Stop after finding 7 Game Over games
          if (gameOverCount >= 7) {
            break;
          }
        } catch (error) {
          console.error(`Error fetching game ${gameId}:`, error);
          const errorGame = { gameId, endTime: 0n, highScore: 0n, leader: '0x0' as Address, pot: 0n, error: true };
          gameResults.push(errorGame);
          // Treat errors as non-Game Over for counting purposes, continue looping
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
