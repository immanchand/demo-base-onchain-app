// src/app/active-game/page.tsx
'use client';
import Navbar from 'src/components/Navbar';
import React, { useState, useCallback, useEffect } from 'react';
import type { Address } from 'viem';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';
import { publicClient, contractABI, contractAddress, gameMasterAddress, ethPrice } from 'src/constants';
import WalletWrapper from 'src/components/WalletWrapper';
import FlyGame from 'src/components/Fly';
import { useTicketContext } from 'src/context/TicketContext';
import { handleGameAction } from 'src/app/actions/gameActions'; // Import Server Action

interface GameData {
  gameId: number;
  endTime: bigint;
  highScore: bigint;
  leader: Address;
  pot: bigint;
  potHistory: bigint;
  error?: boolean;
}

const useCountdown = (endTime: bigint) => {
  const [countdown, setCountdown] = useState<string>('00:00:00');
  const [isGameOver, setIsGameOver] = useState<boolean>(false);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const now = BigInt(Math.floor(Date.now() / 1000));
      const timeLeft = Number(endTime - now);
      if (timeLeft <= 0) {
        setIsGameOver(true);
        setCountdown('00:00:00');
      } else {
        const hours = Math.floor(timeLeft / 3600);
        const minutes = Math.floor((timeLeft % 3600) / 60);
        const seconds = timeLeft % 60;
        setCountdown(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
        setIsGameOver(false);
      }
    }, 1000);
    return () => clearInterval(intervalId);
  }, [endTime]);

  return { isGameOver, countdown, timeLeft: Number(endTime - BigInt(Math.floor(Date.now() / 1000))) };
};

const GameCard = React.memo(
  ({ game, refreshGame, userAddress }: {
    game: GameData;
    refreshGame: () => void;
    userAddress?: Address;
  }) => {
    const [isCopied, setIsCopied] = useState(false);
    const { isGameOver, countdown, timeLeft } = useCountdown(game.endTime);
    const isUserLeader = userAddress && game.leader.toLowerCase() === userAddress.toLowerCase();
    const isGMLeader = gameMasterAddress && game.leader.toLowerCase() === gameMasterAddress.toLowerCase();
    const isGameWithdrawn = game.potHistory > game.pot;

    const handleWithdraw = useCallback(async () => {
      try {
        await handleGameAction('withdraw', game.gameId.toString());
        refreshGame(); // Refresh to update potHistory
      } catch (error) {
        console.error('Withdraw failed:', error);
      }
    }, [game.gameId, refreshGame]);

    return (
      <div className="card-container">
        {game.error ? (
          <p className="text-error-red text-center">FAILED TO LOAD GAME DATA</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1 text-left flex flex-col justify-between">
              <h3 className="text-lg font-bold text-primary-text">GAME #{game.gameId}</h3>
              <div>
                <p className="font-bold text-primary-text">END TIME</p>
                <p className="text-xl">
                  {isGameOver ? (
                    <span className="text-error-red font-semibold">GAME OVER</span>
                  ) : (
                    <span className={timeLeft < 3600 ? 'text-error-red' : 'text-success-green'}>{countdown}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="col-span-1 text-center relative">
              <p className="text-xl font-bold text-primary-text">HIGH SCORE {game.highScore.toString()}</p>
              <div className="mt-4 flex justify-center items-center">
                {isGameOver && !isGameWithdrawn && isUserLeader && (
                  <button onClick={handleWithdraw} className="btn">
                    Withdraw Winnings
                  </button>
                )}
              </div>
            </div>
            <div className="col-span-1 text-right">
              <div className="relative group">
                <p className="text-primary-text">
                  <span className="font-bold">{isGameOver ? 'WINNER' : 'LEADER'}</span>{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      navigator.clipboard.writeText(game.leader).then(() => {
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 2000);
                      });
                    }}
                    className={`${isUserLeader || isGMLeader ? 'text-success-green' : 'text-accent-yellow'} hover:underline cursor-pointer font-bold`}
                  >
                    {isUserLeader ? 'YOU!' : isGMLeader ? 'NO ONE YET' : `${game.leader.slice(0, 5)}...${game.leader.slice(-3)}`}
                  </a>
                  <span className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-primary-bg text-accent-yellow text-xs py-1 px-2 border border-primary-border z-10">
                    {game.leader}
                  </span>
                  {isCopied && (
                    <span className="absolute left-0 top-full mt-1 text-accent-yellow text-xs animate-fade-in-out">
                      COPIED!
                    </span>
                  )}
                </p>
              </div>
              <div className="mt-4 relative group">
                <p className="font-bold text-primary-text">PRIZE</p>
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
  }
);

export default function ActiveGame() {
  const [gameState, setGameState] = useState<{
    game: GameData | null;
    flowStatus: 'idle' | 'loading' | 'creating' | 'success' | 'error';
    errorMessage: string;
  }>({
    game: null,
    flowStatus: 'idle',
    errorMessage: '',
  });
  const { address } = useAccount();
  const { refreshTickets } = useTicketContext();

  const fetchGame = useCallback(async (gameId: number) => {
    try {
      const { endTime, highScore, leader, pot, potHistory } = await publicClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'getGame',
        args: [BigInt(gameId)],
      });
      return { gameId, endTime, highScore, leader: leader as Address, pot, potHistory };
    } catch (error) {
      return { gameId, endTime: 0n, highScore: 0n, leader: '0x0' as Address, pot: 0n, potHistory: 0n, error: true };
    }
  }, []);

  const initializeGameFlow = useCallback(async () => {
    setGameState(prev => ({ ...prev, flowStatus: 'loading', errorMessage: '' }));
    try {
      const latestGameId = await publicClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'getLatestGameId',
      });
      let gameId = Number(latestGameId);
      let gameData: GameData | null = null;

      if (gameId > 0) {
        gameData = await fetchGame(gameId);
        const currentTime = BigInt(Math.floor(Date.now() / 1000));
        if (gameData.endTime <= currentTime || gameData.error) {
          gameData = null;
        }
      }

      if (!gameData) {
        setGameState(prev => ({ ...prev, flowStatus: 'creating' }));
        await handleGameAction('create');
        gameId = Number(await publicClient.readContract({
          address: contractAddress,
          abi: contractABI,
          functionName: 'getLatestGameId',
        }));
        gameData = await fetchGame(gameId);
      }

      setGameState(prev => ({
        ...prev,
        game: gameData,
        flowStatus: gameData?.error ? 'error' : 'success',
        errorMessage: gameData?.error ? 'Failed to load game data' : '',
      }));
    } catch (error) {
      setGameState(prev => ({
        ...prev,
        game: null,
        flowStatus: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [fetchGame]);

  useEffect(() => {
    initializeGameFlow();
  }, [initializeGameFlow]);

  if (gameState.flowStatus === 'loading' || gameState.flowStatus === 'creating') {
    return (
      <div className="flex flex-col min-h-screen w-96 max-w-full px-1 md:w-[1008px] mx-auto">
        <Navbar />
        <div className="h-[10px]" />
        <section className="flex w-full flex-grow flex-col items-center gap-4 bg-primary-bg px-2 py-4 border-4 border-primary-border">
          <div className="flex items-center justify-center w-full h-64">
            <div className="text-xl animate-pulse-slow">
              {gameState.flowStatus === 'loading' ? 'LOADING ACTIVE GAME...' : 'CREATING NEW GAME...'}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen w-96 max-w-full px-1 md:w-[1008px] mx-auto">
      <Navbar />
      <div className="h-[10px]" />
      <section className="flex w-full flex-grow flex-col items-center gap-4 bg-primary-bg px-2 py-4 border-4 border-primary-border">
        {gameState.flowStatus === 'error' ? (
          <div className="flex flex-col items-center justify-center">
            <p className="text-error-red text-lg font-semibold">ERROR RETRIEVING GAME. TRY AGAIN LATER.</p>
            {gameState.errorMessage && <p className="text-error-red text-sm mt-2">{gameState.errorMessage}</p>}
          </div>
        ) : !gameState.game ? (
          <div className="flex flex-col items-center justify-center w-full mb-4">
            <p className="text-lg font-semibold mb-2">INITIALIZING NEW GAME...</p>
            {gameState.errorMessage && <p className="text-error-red text-sm mt-2">Error: {gameState.errorMessage}</p>}
          </div>
        ) : (
          <>
            <div className="gap-4 w-full animate-fade-in">
              <GameCard game={gameState.game} refreshGame={initializeGameFlow} userAddress={address} />
            </div>
            {address ? (
              <section className="flex w-full flex-col items-center gap-4 px-2 py-4">
                <FlyGame
                  gameId={Number(gameState.game.gameId)}
                  existingHighScore={Number(gameState.game.highScore)}
                  updateTickets={refreshTickets}
                />
              </section>
            ) : (
              <WalletWrapper className="btn-login" text="LOG IN TO PLAY" withWalletAggregator={true} />
            )}
          </>
        )}
      </section>
    </div>
  );
}
