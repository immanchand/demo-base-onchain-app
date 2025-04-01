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
            <p className="text-xl font-bold text-primary-text">HIGH SCORE {game.highScore.toString()}</p>
            <div className="mt-4 flex justify-center">
              {!isGameOver ? (
                <Link href="/active-game" className="btn-primary w-full max-w-xs text-center">
                  PLAY TO WIN
                </Link>
              ) : isGameOver && !isGameWithdrawn && isUserLeader ? (
                <WinnerWithdrawWrapper gameId={game.gameId} userAddress={userAddress} />
              ) : isGameOver && isGameWithdrawn && isUserLeader ? (
                <p className="font-bold text-accent-yellow">PRIZE WITHDRAWN!</p>
              ) : null}
            </div>
          </div>
          <div className="col-span-1 text-right relative group">
            <p className="text-primary-text">
              <span className="font-bold">{isGameOver ? 'WINNER' : 'LEADER'}</span>{' '}
              <Link
                href="#"
                onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText(game.leader).then(() => setIsCopied(true)).then(() => setTimeout(() => setIsCopied(false), 2000)); }}
                className={`${isUserLeader ? 'text-success-green text-2xl' : 'text-accent-yellow'} hover:underline cursor-pointer font-bold`}
              >
                {isUserLeader ? 'YOU!' : `${game.leader.slice(0, 5)}...${game.leader.slice(-3)}`}
              </Link>
              <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block bg-primary-bg text-accent-yellow text-xs py-1 px-2 border border-primary-border">
                {game.leader}
              </span>
              {isCopied && <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 text-accent-yellow text-xs animate-fade-in-out">COPIED!</span>}
            </p>
            <div className="mt-4">
              <p className="font-bold text-primary-text">PRIZE</p>
              <p className="text-accent-yellow text-2xl font-bold">{formatEther(game.pot > game.potHistory ? game.pot : game.potHistory)} ETH</p>
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
            address: contractAddress,
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

  return (
    <div className="flex flex-col min-h-screen w-96 max-w-full px-1 md:w-[1008px]">
      <Navbar />
      <div className="h-[10px]" />
      <section className="templateSection flex w-full flex-col items-center justify-center gap-4 bg-black px-2 py-4 md:grow border-4 border-[#FFFF00]">
        <style>
          {`
            .input-field {
              transition: all 0.3s ease;
              background: rgba(255, 255, 255, 0.1);
              border: 2px solid #FFFF00;
            }
            .input-field:focus {
              box-shadow: 0 0 8px rgba(255, 255, 0, 0.5);
            }
            .input-field::placeholder {
              color: #FFFF00;
            }
            .button {
              transition: all 0.3s ease;
            }
            .button:hover {
              transform: scale(1.05);
              box-shadow: 0 0 8px rgba(255, 255, 0, 0.5);
            }
            .button:disabled {
              opacity: 0.6;
              cursor: not-allowed;
            }
            .pulse {
              animation: pulse 1.5s infinite ease-in-out;
            }
            @keyframes pulse {
              0% { opacity: 0.6; }
              50% { opacity: 1; }
              100% { opacity: 0.6; }
            }
            .fade-in {
              animation: fadeIn 0.5s ease-in forwards;
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}
        </style>
        <div className="flex justify-center w-full mb-4 gap-2 fade-in">
          <input
            type="number"
            value={gameIdInput}
            onChange={(e) => setGameIdInput(e.target.value)}
            placeholder="enter game #"
            className="input-field px-3 py-2 text-white placeholder-[#FFFF00] focus:outline-none"
            style={{ fontFamily: "'Courier New', Courier, monospace" }}
            min="1"
            disabled={isLoading}
          />
          <button
            onClick={handleFetchGame}
            className="button bg-yellow-500 font-bold text-white px-4 py-2 hover:bg-black hover:text-yellow-500 border-2 border-yellow-500 disabled:bg-yellow-500 disabled:text-white"
            disabled={isLoading}
            style={{ fontFamily: "'Courier New', Courier, monospace" }}
          >
            FETCH GAME
          </button>
          <button
            onClick={handleShowRecentGames}
            className="button bg-yellow-500 font-bold text-white px-4 py-2 hover:bg-black hover:text-yellow-500 border-2 border-yellow-500 disabled:bg-yellow-500 disabled:text-white"
            disabled={isLoading}
            style={{ fontFamily: "'Courier New', Courier, monospace" }}
          >
            RECENT GAMES
          </button>
          <Link href={'/active-game'}>
            <p className="bg-yellow-500 font-bold text-white px-4 py-2 hover:bg-black hover:text-yellow-500 border-2 border-yellow-500 disabled:bg-yellow-500 disabled:text-white">
              LATEST GAME
            </p>
          </Link>
        </div>
        {error ? (
          <p className="text-red-500 text-lg fade-in" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
            {error}
          </p>
        ) : games.length === 0 && isLoading ? (
          <div className="flex items-center justify-center w-full h-64">
            <div className="text-white text-xl pulse" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
              LOADING GAME...
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 w-full fade-in">
            {games.map(game => (
              <GameCard key={game.gameId} game={game} userAddress={address} />
            ))}
            {isLoading && (
              <div className="col-span-full text-white text-sm mt-2 text-center" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                LOADING MORE GAMES...
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
