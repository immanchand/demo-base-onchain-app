'use client';
import Navbar from 'src/components/Navbar';
import CreateGameWrapper from 'src/components/CreateGameWrapper';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Address } from 'viem';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';
import { publicClient, contractABI, contractAddress, gameMasterAddress} from 'src/constants';
import WalletWrapper from 'src/components/WalletWrapper';
import WinnerWithdrawWrapper from 'src/components/WinnerWithdrawWrapper';
import SpaceInvaders from 'src/components/SpaceInvaders';
import Asteroids from 'src/components/Asteroids';
import { useTicketContext } from 'src/context/TicketContext';

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

const GameCard = React.memo(({ game, isLoading, refreshGame, userAddress }: {
  game: GameData;
  isLoading: boolean;
  refreshGame: () => void;
  userAddress?: Address;
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const { isGameOver, countdown, timeLeft } = useCountdown(game.endTime);
  const isUserLeader = userAddress && game.leader.toLowerCase() === userAddress.toLowerCase();
  const isGMLeader = gameMasterAddress && game.leader.toLowerCase() === gameMasterAddress.toLowerCase();
  const isGameWithdrawn = game.potHistory > game.pot;

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
              {!isGameOver ? (
                <button
                  onClick={refreshGame}
                  className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 hover:text-accent-yellow focus:outline-none ${isLoading ? 'animate-spin' : ''}`}
                  disabled={isLoading}
                  aria-label={`Refresh game ${game.gameId}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.001 8.001 0 01-15.356-2m15.356 2H15" />
                  </svg>
                </button>
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
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText(game.leader).then(() => setIsCopied(true)).then(() => setTimeout(() => setIsCopied(false), 2000)); }}
                className={`${isUserLeader ? 'text-success-green text-2xl' : 'text-accent-yellow'} hover:underline cursor-pointer font-bold`}
              >
                {isUserLeader ? 'YOU!' : (isGMLeader ? 'NO ONE YET' : `${game.leader.slice(0, 5)}...${game.leader.slice(-3)}`)}
              </a>
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

export default function ActiveGame() {
  const [gameState, setGameState] = useState<{
    game: GameData | null;
    status: 'idle' | 'loading' | 'success' | 'error';
    createStatus: 'idle' | 'pending' | 'success' | 'error';
    errorMessage: string;
  }>({
    game: null,
    status: 'idle',
    createStatus: 'idle',
    errorMessage: '',
  });
  const { address } = useAccount();
  const { refreshTickets } = useTicketContext();
  const currentTime = BigInt(Math.floor(Date.now() / 1000));
  const isGameOver = gameState.game ? gameState.game.endTime <= currentTime : false;
  const createGameRef = useRef<{ createGame: () => Promise<void> } | null>(null);
  const [selectedGame, setSelectedGame] = useState<'space-invaders' | 'asteroids' | null>(null);

  interface GameSelectionHandler {
    (game: 'space-invaders' | 'asteroids'): void;
  }

  const handleGameSelect: GameSelectionHandler = (game) => setSelectedGame(game);

  const updateTickets = useCallback(() => refreshTickets(), [refreshTickets]);

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

  const fetchLatestGame = useCallback(async () => {
    setGameState(prev => ({ ...prev, status: 'loading' }));
    try {
      const latestGameId = await publicClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'getLatestGameId',
      });
      const gameId = Number(latestGameId);
      if (gameId > 0) {
        const gameData = await fetchGame(gameId);
        setGameState(prev => ({ ...prev, game: gameData, status: gameData.error ? 'error' : 'success' }));
      } else {
        setGameState(prev => ({ ...prev, game: null, status: 'success' }));
      }
    } catch (error) {
      setGameState(prev => ({ ...prev, game: null, status: 'error' }));
    }
  }, [fetchGame]);

  const handleCreateGame = useCallback(async () => {
    if (!createGameRef.current || gameState.createStatus === 'pending') return;
    setGameState(prev => ({ ...prev, createStatus: 'pending', errorMessage: '' }));
    try {
      await createGameRef.current.createGame();
    } catch (error) {
      setGameState(prev => ({
        ...prev,
        createStatus: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error during game creation',
      }));
    }
  }, [gameState.createStatus]);

  const handleCreateGameStatusChange = useCallback(async (status: 'idle' | 'pending' | 'success' | 'error', message?: string) => {
    setGameState(prev => ({ ...prev, createStatus: status }));
    if (status === 'error' && message) {
      setGameState(prev => ({ ...prev, errorMessage: message }));
    } else if (status === 'success' && message?.startsWith('Transaction hash:')) {
      setGameState(prev => ({ ...prev, errorMessage: '' }));
      const txHash = message.split('Transaction hash: ')[1];
      try {
        await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
        const gameData = await fetchGame(gameState.game ? gameState.game.gameId + 1 : 1);
        setGameState(prev => ({ ...prev, game: gameData, status: gameData.error ? 'error' : 'success' }));
      } catch (error) {
        setGameState(prev => ({
          ...prev,
          createStatus: 'error',
          errorMessage: 'Failed to confirm transaction: ' + (error instanceof Error ? error.message : 'Unknown error'),
        }));
      }
    }
  }, [fetchGame, gameState.game]);

  useEffect(() => {
    if (!gameState.game || isGameOver) fetchLatestGame();
  }, [fetchLatestGame, gameState.game, isGameOver]);

  useEffect(() => {
    if (gameState.status === 'success' && (!gameState.game || isGameOver) && gameState.createStatus === 'idle') handleCreateGame();
  }, [gameState.status, gameState.game, isGameOver, gameState.createStatus, handleCreateGame]);

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined;
    if (gameState.createStatus === 'pending') {
      timeout = setTimeout(() => {
        setGameState(prev => ({
          ...prev,
          createStatus: 'error',
          errorMessage: 'Game creation timed out after 30 seconds',
        }));
      }, 30000);
    }
    return () => clearTimeout(timeout);
  }, [gameState.createStatus]);

  if (gameState.status === 'loading') {
    return (
      <div className="flex flex-col min-h-screen w-96 max-w-full px-1 md:w-[1008px] mx-auto">
        <Navbar />
        <div className="h-[10px]" />
        <section className="flex w-full flex-col items-center justify-center gap-4 bg-primary-bg px-2 py-4 border-4 border-primary-border">
          <div className="flex items-center justify-center w-full h-64">
            <div className="text-xl animate-pulse-slow">LOADING ACTIVE GAME...</div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen w-96 max-w-full px-1 md:w-[1008px] mx-auto">
      <Navbar />
      <div className="h-[10px]" />
      <section className="flex w-full flex-col items-center justify-center gap-4 bg-primary-bg px-2 py-4 border-4 border-primary-border">
        {gameState.status === 'error' ? (
          <div className="flex flex-col items-center">
            <p className="text-error-red text-lg font-semibold">ERROR RETRIEVING GAME. TRY AGAIN LATER.</p>
            {gameState.errorMessage && <p className="text-error-red text-sm mt-2">{gameState.errorMessage}</p>}
          </div>
        ) : !gameState.game || isGameOver ? (
          <div className="flex flex-col items-center w-full mb-4">
            <p className="text-lg font-semibold mb-2">
              {gameState.createStatus === 'pending' ? 'CREATING A NEW GAME...' : 'INITIALIZING NEW GAME...'}
            </p>
            {gameState.errorMessage && <p className="text-error-red text-sm mt-2">Error: {gameState.errorMessage}</p>}
            <CreateGameWrapper ref={createGameRef} onStatusChange={handleCreateGameStatusChange} />
          </div>
        ) : (
          <>
            <div className="w-full max-w-md">
              <GameCard game={gameState.game} isLoading={false} refreshGame={fetchLatestGame} userAddress={address} />
            </div>
            {address ? (
              <section className="flex w-full flex-col items-center justify-center gap-4 px-2 py-4">
                <div className="flex w-full justify-center gap-4 mb-4">
                  <button
                    onClick={() => handleGameSelect('space-invaders')}
                    className={`px-4 py-2 text-lg transition-all ${selectedGame === 'space-invaders' ? 'bg-accent-yellow-dark text-primary-bg border-2 border-primary-border hover:bg-primary-bg hover:text-accent-yellow' : 'bg-primary-bg text-accent-yellow hover:bg-accent-yellow-dark hover:text-primary-bg'}`}
                  >
                    SPACE INVADERS
                  </button>
                  <button
                    onClick={() => handleGameSelect('asteroids')}
                    className={`px-4 py-2 text-lg transition-all ${selectedGame === 'asteroids' ? 'bg-accent-yellow-dark text-primary-bg border-2 border-primary-border hover:bg-primary-bg hover:text-accent-yellow' : 'bg-primary-bg text-accent-yellow hover:bg-accent-yellow-dark hover:text-primary-bg'}`}
                  >
                    ASTEROIDS
                  </button>
                </div>
                {!selectedGame && <p className="text-primary-text">select a game to play!</p>}
                {selectedGame === 'space-invaders' && (
                  <div className="w-full">
                    <SpaceInvaders gameId={Number(gameState.game.gameId)} existingHighScore={Number(gameState.game.highScore)} />
                  </div>
                )}
                {selectedGame === 'asteroids' && (
                  <div className="w-full">
                    <Asteroids gameId={Number(gameState.game.gameId)} existingHighScore={Number(gameState.game.highScore)} updateTickets={updateTickets} />
                  </div>
                )}
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
