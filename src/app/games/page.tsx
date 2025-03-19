'use client';
import GetGamesWrapper from 'src/components/GetGamesWrapper';
import Navbar from 'src/components/Navbar';
import CreateGameWrapper from 'src/components/CreateGameWrapper';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { Address } from 'viem';
import { formatEther, createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { contractABI, contractAddress } from '../../constants';
import Link from 'next/link';
import { useAccount } from 'wagmi';

interface GameData {
  gameId: number;
  endTime: bigint;
  highScore: bigint;
  leader: Address;
  pot: bigint;
  error?: boolean;
}

interface GameCardProps {
  game: GameData;
  refreshing: boolean;
  refreshGame: (gameId: number) => void;
  getCountdown: (endTime: bigint) => { isOver: boolean; countdown: string; timeLeft: number };
  userAddress?: Address;
}

const GameCard = React.memo(({ game, refreshing, refreshGame, getCountdown, userAddress }: GameCardProps) => {
  const { isOver, countdown, timeLeft } = getCountdown(game.endTime);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(game.leader);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  // Check if the leader is the current user (case-insensitive comparison)
  const isUserLeader = userAddress && game.leader.toLowerCase() === userAddress.toLowerCase();

  return (
    <div
      key={game.gameId}
      className="bg-white rounded-xl shadow-md p-4 flex flex-col gap-2 border border-gray-200 relative"
    >
      <h3 className="text-lg font-semibold text-gray-800">Game {game.gameId}</h3>
      <button
        onClick={() => refreshGame(game.gameId)}
        className={`absolute top-2 right-2 w-6 h-6 text-gray-500 hover:text-gray-700 focus:outline-none ${
          refreshing ? 'animate-spin' : ''
        }`}
        disabled={refreshing}
        aria-label={`Refresh game ${game.gameId}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          className="w-6 h-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.001 8.001 0 01-15.356-2m15.356 2H15"
          />
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
              <span className="font-medium">Leader:</span>
            )}{' '}
            <Link
              href="#"
              onClick={(e) => {
                e.preventDefault();
                handleCopyAddress();
              }}
              className={`${
                isUserLeader ? 'text-green-500' : 'text-blue-500'
              } hover:underline cursor-pointer font-semibold`}
              title="Click to copy address"
            >
              {isUserLeader ? 'YOU!' : `${game.leader.slice(0, 6)}...${game.leader.slice(-4)}`}
            </Link>
            {/* Tooltip */}
            <span className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded py-1 px-2">
              {game.leader}
            </span>
            {/* Copied Animation */}
            {isCopied && (
              <span className="absolute right-0 top-full mt-1 text-green-500 text-xs animate-fade-in-out">
                Copied!
              </span>
            )}
          </p>
          <p className="text-gray-600">
            <span className="font-medium">Pot:</span> {formatEther(game.pot)} ETH
          </p>
        </>
      )}
    </div>
  );
});

export default function Games() {
  const [games, setGames] = useState<GameData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<{ [key: number]: boolean }>({}); // Per-game loading state
  const [tick, setTick] = useState<number>(0); // Trigger re-render every 2 seconds
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0); // Force re-fetch
  const { address } = useAccount(); // Get the user's address

  const handleGamesUpdate = useCallback((games: GameData[]) => {
    console.log('handleGamesUpdate called with games:', games.length);
    setGames(games);
    if (games.length > 0) {
      setIsLoading(false);
    }
  }, []);

  const refreshGame = useCallback(async (gameId: number) => {
    setRefreshing(prev => ({ ...prev, [gameId]: true }));
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    try {
      const { endTime, highScore, leader, pot } = await client.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'getGame',
        args: [BigInt(gameId)],
      });

      console.log(`Refreshed Game ${gameId}:`, { endTime, highScore, leader, pot });
      const updatedGame = { gameId, endTime, highScore, leader, pot };
      setGames(prevGames =>
        prevGames.map(game => (game.gameId === gameId ? updatedGame : game))
      );
    } catch (error) {
      console.error(`Error refreshing game ${gameId}:`, error);
      const errorGame = { gameId, endTime: 0n, highScore: 0n, leader: '0x0' as Address, pot: 0n, error: true };
      setGames(prevGames =>
        prevGames.map(game => (game.gameId === gameId ? errorGame : game))
      );
    } finally {
      setRefreshing(prev => ({ ...prev, [gameId]: false }));
    }
  }, []);

  useEffect(() => {
    let frameId: number;
    let lastUpdate = performance.now();

    const update = (currentTime: number) => {
      if (currentTime - lastUpdate >= 2000) {
        setTick(prev => prev + 1);
        lastUpdate = currentTime;
      }
      frameId = requestAnimationFrame(update);
    };

    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const getCountdown = useCallback((endTime: bigint) => {
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
  }, []);

  const sortedGames = useMemo(() => {
    return [...games].sort((a, b) => Number(b.endTime - a.endTime));
  }, [games, tick]);

  const handleGameCreated = useCallback(() => {
    console.log('Game created, triggering refresh');
    setIsLoading(true);
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
            <div className="text-gray-600 text-xl animate-pulse">Loading games...</div>
          </div>
        ) : games.length === 0 ? (
          <p>No games available</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
            {sortedGames.map(game => (
              <GameCard
                key={game.gameId}
                game={game}
                refreshing={refreshing[game.gameId] || false}
                refreshGame={refreshGame}
                getCountdown={getCountdown}
                userAddress={address}
              />
            ))}
          </div>
        )}
        <GetGamesWrapper onGamesUpdate={handleGamesUpdate} refreshTrigger={refreshTrigger} />
      </section>
    </div>
  );
}
