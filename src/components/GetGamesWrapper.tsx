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
  refreshTrigger: number; // Add this to force re-fetch
}

export default function GetGamesWrapper({ onGamesUpdate, refreshTrigger }: GetGamesWrapperProps) {
  const [games, setGames] = useState<GameData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchGames() {
      console.log('Starting fetchGames with refreshTrigger:', refreshTrigger);
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
      let gameOverCount = 0;
      const currentTime = BigInt(Math.floor(Date.now() / 1000));

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

          if (endTime <= currentTime) {
            gameOverCount++;
            console.log(`Game ${gameId} is over. GameOverCount: ${gameOverCount}`);
          }

          if (gameOverCount >= 7) {
            console.log('Found 7 Game Over games, stopping fetch');
            break;
          }
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
  }, [onGamesUpdate, refreshTrigger]); // Depend on refreshTrigger

  return null;
}
