'use client';
import Navbar from 'src/components/Navbar';
import CreateGameWrapper from 'src/components/CreateGameWrapper';
import React, { useState, useCallback, useEffect } from 'react';
import type { Address } from 'viem';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';
import { publicClient, contractABI, contractAddress } from '../../constants';

interface GameData {
  gameId: number;
  endTime: bigint;
  highScore: bigint;
  leader: Address;
  pot: bigint;
  error?: boolean;
}

const GameCard = React.memo(({ game, refreshing, refreshGame, userAddress }: {
  game: GameData;
  refreshing: boolean;
  refreshGame: (gameId: number) => void;
  userAddress?: Address;
}) => {
  const [tick, setTick] = useState<number>(0);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setTick(prev => prev + 1);
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);

  const getCountdown = (endTime: bigint) => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const timeLeft = Number(endTime - now);

    if (timeLeft <= 0) {
      return { isOver: true, countdown: '00:00:00', timeLeft };
    }

    const hours = Math.floor(timeLeft / 3600);
    const minutes = Math.floor((timeLeft % 3600) / 60);
    const seconds = timeLeft % 60;

    const countdown = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return { isOver: false, countdown, timeLeft };
  };

  const { isOver, countdown, timeLeft } = getCountdown(game.endTime);

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(game.leader);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  const isUserLeader = userAddress && game.leader.toLowerCase() === userAddress.toLowerCase();

  return (
    <div className="bg-white rounded-xl shadow-md p-4 flex flex-col gap-2 border border-gray-200 relative">
      <h3 className="text-lg font-semibold text-gray-800">Game {game.gameId}</h3>
      <button
        onClick={() => refreshGame(game.gameId)}
        className={`absolute top-2 right-2 w-6 h-6 text-gray-500 hover:text-gray-700 focus:outline-none ${refreshing ? 'animate-spin' : ''}`}
        disabled={refreshing}
        aria-label={`Refresh game ${game.gameId}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.001 8.001 0 01-15.356-2m15.356 2H15" />
        </svg>
      </button>
      {game.error ? (
        <p className="text-red-500">Failed to load game data</p>
      ) : (
        <>
          <p className="text-gray-600">
            <span className="font-medium">End Time:</span>{' '}
            {isOver ? (
              <span className="text-red-500 font-semibold">Game Over</span>
            ) : (
              <span className={timeLeft < 3600 ? 'text-red-500' : 'text-green-500'}>{countdown}</span>
            )}
          </p>
          <p className="text-gray-600">
            <span className="font-medium">High Score:</span> {game.highScore.toString()}
          </p>
          <p className="text-gray-600 relative group">
            {isOver ? (
              <span className="font-medium text-green-500">WINNER:</span>
            ) : (
              <span className="font-medium text-green-500">Leader:</span>
            )}{' '}
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); handleCopyAddress(); }}
              className={`${isUserLeader ? 'text-green-500' : 'text-blue-500'} hover:underline cursor-pointer font-semibold`}
              title="Click to copy address"
            >
              {isUserLeader ? 'YOU!' : `${game.leader.slice(0, 6)}...${game.leader.slice(-4)}`}
            </a>
            <span className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded py-1 px-2">
              {game.leader}
            </span>
            {isCopied && (
              <span className="absolute right-0 top-full mt-1 text-green-500 text-xs animate-fade-in-out">
                Copied!
              </span>
            )}
          </p>
          <p className="text-gray-600">
            <span className="font-large">***Prize:</span> {formatEther(game.pot)} ETH ***
          </p>
        </>
      )}
    </div>
  );
});

export default function ActiveGame() {
  const [latestGame, setLatestGame] = useState<GameData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const { address } = useAccount();

  const fetchLatestGame = useCallback(async () => {
    setIsLoading(true);

    try {
      const latestGameId = await publicClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'getLatestGameId',
      });
      const gameId = Number(latestGameId);

      if (gameId > 0) {
        const { endTime, highScore, leader, pot } = await publicClient.readContract({
          address: contractAddress,
          abi: contractABI,
          functionName: 'getGame',
          args: [BigInt(gameId)],
        });
        setLatestGame({ gameId, endTime, highScore, leader, pot });
      } else {
        setLatestGame(null);
      }
    } catch (error) {
      console.error('Error fetching latest game:', error);
      setLatestGame(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshGame = useCallback(async (gameId: number) => {
    setRefreshing(true);

    try {
      const { endTime, highScore, leader, pot } = await publicClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'getGame',
        args: [BigInt(gameId)],
      });
      setLatestGame({ gameId, endTime, highScore, leader, pot });
    } catch (error) {
      console.error(`Error refreshing game ${gameId}:`, error);
      setLatestGame({ gameId, endTime: 0n, highScore: 0n, leader: '0x0' as Address, pot: 0n, error: true });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLatestGame();
  }, [fetchLatestGame, refreshTrigger]);

  const handleGameCreated = useCallback(() => {
    console.log('Game created, triggering refresh');
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return (
    <div className="flex h-full w-96 max-w-full flex-col px-1 md:w-[1008px] rounded-xl">
      <Navbar />
      <section className="templateSection flex w-full flex-col items-center justify-center gap-4 rounded-xl bg-gray-100 px-2 py-4 md:grow">
        <div className="flex justify-center w-full mb-4">
          <CreateGameWrapper onSuccess={handleGameCreated} />
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center w-full h-64">
            <div className="text-gray-600 text-xl animate-pulse">Loading active game...</div>
          </div>
        ) : !latestGame ? (
          <p>No active game available</p>
        ) : (
          <div className="w-full max-w-md">
            <GameCard
              game={latestGame}
              refreshing={refreshing}
              refreshGame={refreshGame}
              userAddress={address}
            />
          </div>
        )}
      </section>
    </div>
  );
}
