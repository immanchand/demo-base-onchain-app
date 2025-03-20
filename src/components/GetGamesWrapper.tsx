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
  refreshTrigger: number;
  gameCount: number; // New prop to limit the number of games fetched
}

export default function GetGamesWrapper({ onGamesUpdate, refreshTrigger, gameCount }: GetGamesWrapperProps) {
  const [games, setGames] = useState<GameData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchGames() {
      console.log('Starting fetchGames with refreshTrigger:', refreshTrigger, 'gameCount:', gameCount);
      setIsLoading(true);
      const client = createPublicClient({
        chain: baseSepolia,
        transport: http(),
      });

      const latestGameId = await client.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'getLatestGameId',
      });
      const maxGameId = Number(latestGameId);
      console.log('Fetched latestGameId:', maxGameId);

      const gameResults: GameData[] = [];
      const startId = Math.max(1, maxGameId - gameCount + 1); // Ensure we don’t go below 1

      for (let gameId = maxGameId; gameId >= startId; gameId--) {
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
        console.log('Updated games:', gameResults.length);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('Fetch completed. Total games:', gameResults.length);
      setIsLoading(false);
    }

    fetchGames();
  }, [onGamesUpdate, refreshTrigger, gameCount]); // Add gameCount as dependency

  return null;
}
