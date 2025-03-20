'use client';
import GetGamesWrapper from 'src/components/GetGamesWrapper';
import Navbar from 'src/components/Navbar';
import React, { useState, useCallback, useEffect } from 'react';
import type { Address } from 'viem';
import { formatEther, createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { contractABI, contractAddress, GAME_COUNT } from '../../constants';
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
  userAddress?: Address;
}

const GameCard = React.memo(({ game, refreshing, refreshGame, userAddress }: GameCardProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const currentTime = BigInt(Math.floor(Date.now() / 1000));
  const isOver = game.endTime <= currentTime;

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
              <span className="text-green-500">{new Date(Number(game.endTime) * 1000).toLocaleString()}</span>
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
              onClick={(e) => { e.preventDefault(); handleCopyAddress(); }}
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
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<{ [key: number]: boolean }>({});
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [latestGameId, setLatestGameId] = useState<number>(0);
  const [gameIdInput, setGameIdInput] = useState<string>(''); // State for numeric input
  const [showSpecificGame, setShowSpecificGame] = useState<boolean>(false); // Toggle between specific and recent games
  const { address } = useAccount();

  useEffect(() => {
    async function fetchLatestGameId() {
      const client = createPublicClient({
        chain: baseSepolia,
        transport: http(),
      });
      const id = await client.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'getLatestGameId',
      });
      setLatestGameId(Number(id));
    }
    fetchLatestGameId();
  }, [refreshTrigger]);

  const handleGamesUpdate = useCallback((games: GameData[]) => {
    console.log('handleGamesUpdate called with games:', games.length);
    setGames(games);
    setIsLoading(false);
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
      setGames(prevGames => {
        const gameExists = prevGames.some(g => g.gameId === gameId);
        if (gameExists) {
          return prevGames.map(game => (game.gameId === gameId ? updatedGame : game));
        } else if (showSpecificGame) {
          return [updatedGame]; // Replace list with specific game
        } else {
          return [updatedGame, ...prevGames];
        }
      });
    } catch (error) {
      console.error(`Error refreshing game ${gameId}:`, error);
      const errorGame = { gameId, endTime: 0n, highScore: 0n, leader: '0x0' as Address, pot: 0n, error: true };
      setGames(prevGames => {
        const gameExists = prevGames.some(g => g.gameId === gameId);
        if (gameExists) {
          return prevGames.map(game => (game.gameId === gameId ? errorGame : game));
        } else if (showSpecificGame) {
          return [errorGame]; // Replace list with specific game
        } else {
          return [errorGame, ...prevGames];
        }
      });
    } finally {
      setRefreshing(prev => ({ ...prev, [gameId]: false }));
    }
  }, [showSpecificGame]);

  const handleFetchGame = () => {
    const gameId = parseInt(gameIdInput, 10);
    if (!isNaN(gameId) && gameId > 0) {
      setShowSpecificGame(true); // Switch to specific game mode
      setRefreshTrigger(prev => prev + 1); // Trigger GetGamesWrapper re-fetch
    }
  };

  const handleShowRecentGames = () => {
    setShowSpecificGame(false); // Switch back to recent games mode
    setRefreshTrigger(prev => prev + 1); // Trigger GetGamesWrapper re-fetch
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
          >
            Fetch Game
          </button>
          <button
            onClick={handleShowRecentGames}
            className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Recent Games
          </button>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center w-full h-64">
            <div className="text-gray-600 text-xl animate-pulse">Loading games...</div>
          </div>
        ) : games.length === 0 ? (
          <p>No games available</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
            {games.map(game => (
              <GameCard
                key={game.gameId}
                game={game}
                refreshing={refreshing[game.gameId] || false}
                refreshGame={refreshGame}
                userAddress={address}
              />
            ))}
          </div>
        )}
        {latestGameId > 0 && (
          <GetGamesWrapper
            onGamesUpdate={handleGamesUpdate}
            refreshTrigger={refreshTrigger}
            startGameId={showSpecificGame ? parseInt(gameIdInput) || latestGameId - 1 : latestGameId - 1}
            gameCount={showSpecificGame ? 1 : GAME_COUNT}
          />
        )}
      </section>
    </div>
  );
}
