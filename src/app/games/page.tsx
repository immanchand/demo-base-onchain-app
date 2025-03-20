'use client';
import Navbar from 'src/components/Navbar';
import React, { useState, useEffect, useRef } from 'react';
import type { Address } from 'viem';
import { formatEther } from 'viem';
import { publicClient, contractABI, contractAddress, GAME_COUNT } from '../../constants';
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

const GameCard = React.memo(({ game, userAddress }: { game: GameData; userAddress?: Address }) => {
  const [isCopied, setIsCopied] = useState(false);

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
  const currentTime = BigInt(Math.floor(Date.now() / 1000)); // Current time in seconds
  const isGameOver = game.endTime <= currentTime; // Check if game is over

  return (
    <div className="bg-white rounded-xl shadow-md p-4 flex flex-col gap-2 border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-800">Game {game.gameId}</h3>
      {game.error ? (
        <p className="text-red-500">Failed to load game data</p>
      ) : (
        <>
          <p className="text-gray-600">
            <span className="font-medium">End Time:</span>{' '}
            <span className={isGameOver ? 'text-red-500' : 'text-green-500'}>
              {new Date(Number(game.endTime) * 1000).toLocaleString()}
            </span>
          </p>
          <p className="text-gray-600">
            <span className="font-medium">High Score:</span> {game.highScore.toString()}
          </p>
          <p className="text-gray-600 relative group">
            <span className="font-medium text-green-500">WINNER:</span>{' '}
            <Link
              href="#"
              onClick={(e) => {
                e.preventDefault();
                handleCopyAddress();
              }}
              className={`${isUserLeader ? 'text-green-500' : 'text-blue-500'} hover:underline cursor-pointer font-semibold`}
              title="Click to copy address"
            >
              {isUserLeader ? 'YOU!' : `${game.leader.slice(0, 6)}...${game.leader.slice(-4)}`}
            </Link>
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
            <span className="font-medium">***Prize:</span> {formatEther(game.pot)} ETH ***
          </p>
        </>
      )}
    </div>
  );
});

export default function Games() {
  const [games, setGames] = useState<GameData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [gameIdInput, setGameIdInput] = useState<string>('');
  const [showSpecificGame, setShowSpecificGame] = useState<boolean>(false);
  const { address } = useAccount();
  const isFetching = useRef(false);
  const hasMounted = useRef(false);

  const fetchGames = async (startGameId: number, count: number) => {
    if (isFetching.current) return;
    isFetching.current = true;
    setIsLoading(true);
    setGames([]);

    const endId = Math.max(1, startGameId - count + 1);

    for (let gameId = startGameId; gameId >= endId && gameId >= 1; gameId--) {
      try {
        const { endTime, highScore, leader, pot } = await publicClient.readContract({
          address: contractAddress,
          abi: contractABI,
          functionName: 'getGame',
          args: [BigInt(gameId)],
        });
        const gameData = { gameId, endTime, highScore, leader, pot };
        setGames(prev => {
          if (prev.some(g => g.gameId === gameId)) return prev;
          return [...prev, gameData];
        });
      } catch (error) {
        console.error(`Error fetching game ${gameId}:`, error);
        const errorGame = { gameId, endTime: 0n, highScore: 0n, leader: '0x0' as Address, pot: 0n, error: true };
        setGames(prev => {
          if (prev.some(g => g.gameId === gameId)) return prev;
          return [...prev, errorGame];
        });
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setIsLoading(false);
    isFetching.current = false;
  };

  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;

    const loadInitialGames = async () => {
      const latestGameId = await publicClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'getLatestGameId',
      });
      const startId = Number(latestGameId) - 1;
      if (startId >= 1) {
        await fetchGames(startId, GAME_COUNT);
      } else {
        setGames([]);
        setIsLoading(false);
      }
    };
    loadInitialGames();
  }, []);

  const handleFetchGame = async () => {
    const gameId = parseInt(gameIdInput, 10);
    if (!isNaN(gameId) && gameId > 0) {
      setShowSpecificGame(true);
      await fetchGames(gameId, 1);
    }
  };

  const handleShowRecentGames = async () => {
    setShowSpecificGame(false);
    setGameIdInput('');
    const latestGameId = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'getLatestGameId',
    });
    const startId = Number(latestGameId) - 1;
    if (startId >= 1) {
      await fetchGames(startId, GAME_COUNT);
    } else {
      setGames([]);
    }
  };

  return (
    <div className="flex h-full w-96 max-w-full flex-col px-1 md:w-[1008px] rounded-xl">
      <Navbar />
      <section className="templateSection flex w-full flex-col items-center justify-center gap-4 rounded-xl bg-gray-100 px-2 py-4 md:grow">
        <div className="flex justify-center w-full mb-4 gap-2">
          <input
            type="number"
            value={gameIdInput}
            onChange={(e) => setGameIdInput(e.target.value)}
            placeholder="Enter Game ID"
            className="border border-gray-300 rounded-l-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="1"
          />
          <button
            onClick={handleFetchGame}
            className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          >
            Fetch Game
          </button>
          <button
            onClick={handleShowRecentGames}
            className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
            disabled={isLoading}
          >
            Recent Games
          </button>
        </div>
        {games.length === 0 && isLoading ? (
          <div className="flex items-center justify-center w-full h-64">
            <div className="text-gray-600 text-xl animate-pulse">Loading games...</div>
          </div>
        ) : games.length === 0 ? (
          <p>No games available</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
            {games.map(game => (
              <GameCard key={game.gameId} game={game} userAddress={address} />
            ))}
          </div>
        )}
        {isLoading && games.length > 0 && (
          <div className="text-gray-600 text-sm mt-2">Loading more games...</div>
        )}
      </section>
    </div>
  );
}
