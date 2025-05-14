'use client';
import Navbar from 'src/components/Navbar';
import React, { useState, useCallback } from 'react';
import type { Address } from 'viem';
import { formatEther } from 'viem';
import { publicClient, contractABI, CONTRACT_ADDRESS, GAME_COUNT } from 'src/constants';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import WinnerWithdrawWrapper from 'src/components/WinnerWithdrawWrapper';
import Button from 'src/components/Button';

interface GameData {
  gameId: number;
  endTime: bigint;
  highScore: bigint;
  leader: Address;
  pot: bigint;
  potHistory: bigint;
  error?: boolean;
}

const ethPrice = Number(process.env.ETH_PRICE) || 2000;
const GameCard = React.memo(({ game, userAddress }: { game: GameData; userAddress?: Address }) => {
  const [isCopied, setIsCopied] = useState(false);
  const isUserLeader = userAddress && game.leader.toLowerCase() === userAddress.toLowerCase();
  const currentTime = BigInt(Math.floor(Date.now() / 1000));
  const isGameOver = game.endTime <= currentTime;
  const isGameNotExist = game.endTime === 0n;
  const isGameWithdrawn = game.potHistory > game.pot;


  return (
    <div className="card-container">
      {game.error || isGameNotExist ? (
        <p className="text-error-red text-center">FAILED TO LOAD GAME DATA OR GAME DOES NOT EXIST</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1 text-left">
            <h3 className="text-lg font-bold text-primary-text">GAME #{game.gameId}</h3>
            <div className="mt-4">
              <p className="font-bold text-primary-text">END TIME</p>
              <p className={`text-xl ${isGameOver ? 'text-error-red' : 'text-success-green'}`}>
                {new Date(Number(game.endTime) * 1000).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="col-span-1 text-center">
            <p className="text-xl font-bold text-primary-text">TOP SCORE {game.highScore.toString()}</p>
            <div className="mt-4 flex justify-center">
              {!isGameOver ? (
                <Link href="/active-game" className="btn-primary w-full max-w-xs text-center">
                  PLAY TO WIN
                </Link>
              ) : isGameOver && !isGameWithdrawn && isUserLeader ? (
                <WinnerWithdrawWrapper gameId={game.gameId} userAddress={userAddress} />
              ) : isGameOver && isGameWithdrawn && isUserLeader ? (
                <p className="font-bold text-accent-yellow">LOOT WITHDRAWN!</p>
              ) : null}
            </div>
          </div>
          <div className="col-span-1 text-right">
            <div className="relative group">
              <p className="text-primary-text">
                <span className="font-bold">{isGameOver ? 'CHAMP' : 'BOSS'}</span>{' '}
                <Link
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    navigator.clipboard.writeText(game.leader).then(() => setIsCopied(true)).then(() => setTimeout(() => setIsCopied(false), 2000));
                  }}
                  className={`${isUserLeader ? 'text-success-green text-2xl' : 'text-accent-yellow'} hover:underline cursor-pointer font-bold`}
                >
                  {isUserLeader ? 'YOU!' : `${game.leader.slice(0, 5)}...${game.leader.slice(-3)}`}
                </Link>
                <span className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-primary-bg text-accent-yellow text-xs py-1 px-2 border border-primary-border z-10">
                  {game.leader}
                </span>
                {isCopied && <span className="absolute left-0 top-full mt-1 text-accent-yellow text-xs animate-fade-in-out">COPIED!</span>}
              </p>
            </div>
            <div className="mt-4 relative group">
              <p className="font-bold text-primary-text">LOOT</p>
              <p className="text-accent-yellow text-2xl font-bold">
                ${(Number(formatEther(game.pot > game.potHistory ? game.pot : game.potHistory)) * ethPrice).toFixed(2)}
                <span className="absolute right-0 bottom-full mb-2 hidden group-hover:block bg-primary-bg text-accent-yellow text-xs py-1 px-2 border border-primary-border z-10">
                  {formatEther(game.pot > game.potHistory ? game.pot : game.potHistory)} ETH
                </span>
              </p>
            </div>
          </div>
        </div>
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
    setGames([]);
    const endId = Math.max(1, startGameId - count + 1);
    try {
      for (let gameId = startGameId; gameId >= endId && gameId >= 1; gameId--) {
        try {
          const { endTime, highScore, leader, pot, potHistory } = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: contractABI,
            functionName: 'getGame',
            args: [BigInt(gameId)],
          });
          const gameData = { gameId, endTime, highScore, leader, pot, potHistory };
          setGames(prev => [...prev, gameData]);
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (err) {
          console.error(`Error fetching game ${gameId}:`, err);
          const errorGame = { gameId, endTime: 0n, highScore: 0n, leader: '0x0' as Address, pot: 0n, potHistory: 0n, error: true };
          setGames(prev => [...prev, errorGame]);
          await new Promise(resolve => setTimeout(resolve, 200));
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
      address: CONTRACT_ADDRESS,
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
    const startId = Math.max(1, latestId);
    if (startId >= 1) {
      await fetchGames(startId, GAME_COUNT);
    } else {
      setGames([]);
    }
  }, [fetchGames, getLatestGameId]);

  return (
    <div className="flex flex-col min-h-screen w-96 max-w-full px-1 md:w-[1008px] mx-auto">
      <Navbar />
      <div className="h-[10px]" />
      <div className="flex flex-col flex-grow bg-primary-bg border-4 border-primary-border">
        <section className="flex flex-col flex-grow w-full items-center gap-4 px-2 py-4">
          <div className="flex justify-center w-full mb-4 gap-2 animate-fade-in">
            <input
              type="number"
              value={gameIdInput}
              onChange={(e) => setGameIdInput(e.target.value)}
              placeholder="enter game #"
              className="input-field"
              min="1"
              disabled={isLoading}
            />
            <Button onClick={handleFetchGame} disabled={isLoading}>
              FETCH GAME
            </Button>
            <Button onClick={handleShowRecentGames} disabled={isLoading}>
              RECENT GAMES
            </Button>
            <Link href="/active-game" className="btn-primary">
              LATEST GAME
            </Link>
          </div>
          {error ? (
            <p className="text-error-red text-lg animate-fade-in">{error}</p>
          ) : games.length === 0 && isLoading ? (
            <div className="flex items-center justify-center w-full h-full">
              <div className="text-xl animate-pulse-slow">LOADING GAME...</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 w-full animate-fade-in">
              {games.map(game => (
                <GameCard key={game.gameId} game={game} userAddress={address} />
              ))}
              {isLoading && <div className="col-span-full text-sm mt-2 text-center">LOADING MORE GAMES...</div>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
