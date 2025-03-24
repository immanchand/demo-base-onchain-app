'use client';
import Navbar from 'src/components/Navbar';
import React, { useState, useCallback } from 'react';
import type { Address } from 'viem';
import { formatEther } from 'viem';
import { publicClient, contractABI, contractAddress, GAME_COUNT } from 'src/constants';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import WinnerWithdrawWrapper from 'src/components/WinnerWithdrawWrapper';

interface GameData {
  gameId: number;
  endTime: bigint;
  highScore: bigint;
  leader: Address;
  pot: bigint;
  potHistory: bigint;
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

  const handleWithdrawSuccess = () => {
    // Optional: Add logic to refresh game data after successful withdrawal
    console.log('Prize claimed successfully');
  };

  const isUserLeader = userAddress && game.leader.toLowerCase() === userAddress.toLowerCase();
  const currentTime = BigInt(Math.floor(Date.now() / 1000));
  const isGameOver = game.endTime <= currentTime;
  const isGameNotExist = game.endTime === 0n;
  const isGameWithdrawn = game.potHistory > game.pot;

  return (
    <div className="bg-white rounded-xl shadow-md p-4 flex flex-col gap-2 border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-800">Game #{game.gameId}</h3>
      {game.error || isGameNotExist ? (
        <p className="text-red-500">Failed to load game data or game does not exist</p>
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
            {isGameOver ? (
              <span className="font-medium">WINNER:</span>
            ) : (
              <span className="font-medium">Leader:</span>
            )}{' '}
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
          <p className="font-semibold">
            Prize:{' '}{isGameWithdrawn ? formatEther(game.pot) : formatEther(game.potHistory)} ETH
          </p>
          {isGameOver && !isGameWithdrawn ? (
            <div className="mt-2">
              <WinnerWithdrawWrapper
                gameId={game.gameId}
                onSuccess={handleWithdrawSuccess}
                userAddress={userAddress}
              />
            </div>
          ) : (
            <Link href={'/active-game'}>
              <p className="rounded-md w-full items-center justify-center text-white bg-green-500 hover:bg-green-600">Play & Win</p>
            </Link>
          )}
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
  const [error, setError] = useState<string | null>(null);
  const { address } = useAccount();


  const fetchGames = useCallback(async (startGameId: number, count: number) => {
    setIsLoading(true);
    setError(null);
    setGames([]); // Clear existing games

    const endId = Math.max(1, startGameId - count + 1);

    try {
      for (let gameId = startGameId; gameId >= endId && gameId >= 1; gameId--) {
        try {
          const { endTime, highScore, leader, pot, potHistory } = await publicClient.readContract({
            address: contractAddress,
            abi: contractABI,
            functionName: 'getGame',
            args: [BigInt(gameId)],
          });
          const gameData = { gameId, endTime, highScore, leader, pot, potHistory };
          setGames(prev => [...prev, gameData]);
          await new Promise(resolve => setTimeout(resolve, 500)); // Delay for UX
        } catch (err) {
          console.error(`Error fetching game ${gameId}:`, err);
          const errorGame = { gameId, endTime: 0n, highScore: 0n, leader: '0x0' as Address, pot: 0n, potHistory: 0n, error: true };
          setGames(prev => [...prev, errorGame]);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (err) {
      setError('Failed to fetch games. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getLatestGameId = useCallback(async () => {
    const latestGameId = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'getLatestGameId',
    });
    return Number(latestGameId);
  }, []);

  const handleFetchGame = useCallback(async () => {
    const gameId = parseInt(gameIdInput, 10);
    if (!isNaN(gameId) && gameId > 0) {
      setShowSpecificGame(true);
      await fetchGames(gameId, 1);
    }
  }, [gameIdInput, fetchGames]);

  const handleShowRecentGames = useCallback(async () => {
    setShowSpecificGame(false);
    setGameIdInput('');
    const latestId = await getLatestGameId();
    const startId = Math.max(1, latestId - 1);
    if (startId >= 1) {
      await fetchGames(startId, GAME_COUNT);
    } else {
      setGames([]);
    }
  }, [fetchGames, getLatestGameId]);

  // Removed useEffect to prevent initial load

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
            disabled={isLoading}
          />
          <button
            onClick={handleFetchGame}
            className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300"
            disabled={isLoading}
          >
            Fetch Game
          </button>
          <button
            onClick={handleShowRecentGames}
            className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300"
            disabled={isLoading}
          >
            Show Recent Games
          </button>
        </div>
        {error ? (
          <p className="text-red-500 text-lg">{error}</p>
        ) : games.length === 0 && isLoading ? (
          <div className="flex items-center justify-center w-full h-64">
            <div className="text-gray-600 text-xl animate-pulse">Loading games...</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
            {games.map(game => (
              <GameCard key={game.gameId} game={game} userAddress={address} />
            ))}
            {isLoading && (
              <div className="col-span-full text-gray-600 text-sm mt-2 text-center">
                Loading more games...
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
