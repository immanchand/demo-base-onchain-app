'use client';
import Navbar from 'src/components/Navbar';
import CreateGameWrapper from 'src/components/CreateGameWrapper';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Address } from 'viem';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';
import { publicClient, contractABI, contractAddress } from 'src/constants';
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

const GameCard = React.memo(({ game, isLoading, refreshGame, userAddress }: {
  game: GameData;
  isLoading: boolean;
  refreshGame: () => void;
  userAddress?: Address;
}) => {
  const [tick, setTick] = useState<number>(0);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    const intervalId = setInterval(() => setTick(prev => prev + 1), 1000);
    return () => clearInterval(intervalId);
  }, []);

  const getCountdown = (endTime: bigint) => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const timeLeft = Number(endTime - now);
    if (timeLeft <= 0) return { isGameOver: true, countdown: '00:00:00', timeLeft };
    const hours = Math.floor(timeLeft / 3600);
    const minutes = Math.floor((timeLeft % 3600) / 60);
    const seconds = timeLeft % 60;
    
    return {
      isGameOver: false,
      countdown: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}`,
      timeLeft,
    };
  };

  const { isGameOver, countdown, timeLeft } = getCountdown(game.endTime);

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
    refreshGame();
  };

  const isUserLeader = userAddress && game.leader.toLowerCase() === userAddress.toLowerCase();
  const isGameWithdrawn = game.potHistory > game.pot;

  return (
    <div className="bg-black p-4 flex flex-col gap-2 border-2 border-[#FFFF00] transition-all duration-300 ease-in-out hover:scale-102 hover:brightness-110 hover:shadow-[0_0_8px_rgba(255,255,0,0.5)]">
      {game.error ? (
        <p className="text-red-500 text-center" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
          FAILED TO LOAD GAME DATA
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1 text-left flex flex-col justify-between">
            <h3 className="text-lg font-bold text-white" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
              GAME #{game.gameId}
            </h3>
            <div>
              <p className="text-white font-bold" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                END TIME
              </p>
              <p className="text-white text-xl" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                {isGameOver ? (
                  <span className="text-red-500 font-semibold">GAME OVER</span>
                ) : (
                  <span className={timeLeft < 3600 ? 'text-red-500' : 'text-green-500'}>{countdown}</span>
                )}
              </p>
            </div>
          </div>
          <div className="col-span-1 text-center relative">
            <p className="text-white font-bold text-xl" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
              HIGH SCORE {game.highScore.toString()}
            </p>
            <div className="mt-4 flex justify-center items-center">
              {!isGameOver ? (
                <button
                  onClick={refreshGame}
                  className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-white hover:text-yellow-500 focus:outline-none ${isLoading ? 'animate-spin' : ''}`}
                  disabled={isLoading}
                  aria-label={`Refresh game ${game.gameId}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.001 8.001 0 01-15.356-2m15.356 2H15" />
                  </svg>
                </button>
              ) : isGameOver && !isGameWithdrawn && isUserLeader ? (
                <WinnerWithdrawWrapper 
                  gameId={game.gameId}
                  onSuccess={handleWithdrawSuccess}
                  userAddress={userAddress}
                />
              ) : isGameOver && isGameWithdrawn && isUserLeader ? (
                <p className="font-bold text-yellow-500" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                    PRIZE WITHDRAWN!
                </p>
              ) : null}
            </div>
          </div>
          <div className="col-span-1 text-right">
            <p className="text-white relative group" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
              {isGameOver ? (
                <span className="font-bold">WINNER</span>
              ) : (
                <span className="font-bold">LEADER</span>
              )}{' '}
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); handleCopyAddress(); }}
                className={`${isUserLeader ? 'text-green-500 text-2xl' : 'text-yellow-500'} hover:underline cursor-pointer font-bold`}
                title="Click to copy address"
              >
                {isUserLeader ? 'YOU!' : `${game.leader.slice(0, 5)}...${game.leader.slice(-3)}`}
              </a>
              <span className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 hidden group-hover:block bg-black text-yellow-500 text-xs py-1 px-2 border border-yellow-500">
                {game.leader}
              </span>
              {isCopied && (
                <span className="absolute left-1/2 transform -translate-x-1/2 top-full mt-1 text-yellow-500 text-xs animate-fade-in-out">
                  COPIED!
                </span>
              )}
            </p>
            <div className="mt-4">
              <p className="font-bold text-white" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                PRIZE
              </p>
              <p className="text-yellow-500 text-2xl text-bold" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                {formatEther(game.pot > game.potHistory ? game.pot : game.potHistory)} ETH
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default function ActiveGame() {
  const [state, setState] = useState<{
    game: GameData | null;
    status: 'idle' | 'loading' | 'success' | 'error';
  }>({ game: null, status: 'idle' });
  const [createGameStatus, setCreateGameStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const { address } = useAccount();
  const { refreshTickets } = useTicketContext();
  const currentTime = BigInt(Math.floor(Date.now() / 1000));
  const isGameOver = state.game ? state.game.endTime <= currentTime : false;
  const createGameRef = useRef<{ createGame: () => Promise<void> }>(null);
  const [selectedGame, setSelectedGame] = useState<'space-invaders' | 'asteroids' | null>(null);
  
  const handleGameSelect = (game: 'space-invaders' | 'asteroids') => {
    setSelectedGame(game);
  };

  const updateTickets = useCallback(() => {
    refreshTickets();
  }, [refreshTickets]);

  const fetchGame = useCallback(async (gameId: number): Promise<GameData> => {
    try {
      const { endTime, highScore, leader, pot, potHistory } = await publicClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'getGame',
        args: [BigInt(gameId)],
      });
      return { gameId, endTime, highScore, leader, pot, potHistory };
    } catch (error) {
      return { gameId, endTime: 0n, highScore: 0n, leader: '0x0' as Address, pot: 0n, potHistory: 0n, error: true };
    }
  }, []);

  const fetchLatestGame = useCallback(async () => {
    setState(prev => ({ ...prev, status: 'loading' }));
    try {
      const latestGameId = await publicClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'getLatestGameId',
      });
      const gameId = Number(latestGameId);
      if (gameId > 0) { 
        const gameData = await fetchGame(gameId);
        setState({ game: gameData, status: gameData.error ? 'error' : 'success' });
      } else {
        setState({ game: null, status: 'success' });
      }
    } catch (error) {
      setState({ game: null, status: 'error' });
    }
  }, [fetchGame]);

  const handleCreateGame = useCallback(async () => {
    if (!createGameRef.current || createGameStatus === 'pending') return;
    
    setCreateGameStatus('pending');
    setErrorMessage('');
    
    try {
      await createGameRef.current.createGame();
    } catch (error) {
      setCreateGameStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error during game creation');
    }
  }, [createGameStatus]);

  const handleCreateGameStatusChange = useCallback(async (status: 'idle' | 'pending' | 'success' | 'error', message?: string) => {
    setCreateGameStatus(status);
    
    if (status === 'error' && message) {
      setErrorMessage(message);
    } else if (status === 'success' && message?.startsWith('Transaction hash:')) {
      setErrorMessage('');
      const txHash = message.split('Transaction hash: ')[1];
      console.log('Waiting for transaction confirmation:', txHash);
      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`,
        });
        console.log('Transaction confirmed, hash:', txHash);
        await fetchLatestGame();
      } catch (error) {
        setCreateGameStatus('error');
        setErrorMessage('Failed to confirm transaction: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    }
  }, [fetchLatestGame]);

  useEffect(() => {
    fetchLatestGame();
  }, [fetchLatestGame]);

  useEffect(() => {
    if (state.status === 'success' && (!state.game || isGameOver) && createGameStatus === 'idle') {
      handleCreateGame();
    }
  }, [state.status, state.game, isGameOver, createGameStatus, handleCreateGame]);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (createGameStatus === 'pending') {
      timeout = setTimeout(() => {
        setCreateGameStatus('error');
        setErrorMessage('Game creation timed out after 30 seconds');
      }, 30000);
    }
    return () => clearTimeout(timeout);
  }, [createGameStatus]);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col min-h-screen w-96 max-w-full px-1 md:w-[1008px]">
        <Navbar />
        <div className="h-[10px]" />
        <section className="templateSection flex w-full flex-col items-center justify-center gap-4 bg-black px-2 py-4 md:grow border-4 border-[#FFFF00]">
          <div className="flex items-center justify-center w-full h-64">
            <div className="text-white text-xl animate-pulse" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
              LOADING ACTIVE GAME...
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen w-96 max-w-full px-1 md:w-[1008px]">
      <Navbar />
      <div className="h-[10px]" />
      <section className="templateSection flex w-full flex-col items-center justify-center gap-4 bg-black px-2 py-4 md:grow border-4 border-[#FFFF00]">
        {state.status === 'error' ? (
          <div className="flex flex-col items-center">
            <p className="text-red-500 text-lg font-semibold" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
              ERROR RETRIEVING GAME. TRY AGAIN LATER.
            </p>
            {errorMessage && (
              <p className="text-red-500 text-sm mt-2" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                {errorMessage}
              </p>
            )}
          </div>
        ) : !state.game || isGameOver ? (
          <div className="flex flex-col items-center w-full mb-4">
            <p className="text-white text-lg font-semibold mb-2" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
              {createGameStatus === 'pending' ? 'CREATING A NEW GAME...' : 'INITIALIZING NEW GAME...'}
            </p>
            {errorMessage && (
              <p className="text-red-500 text-sm mt-2" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                Error: {errorMessage}
              </p>
            )}
            <CreateGameWrapper 
              ref={createGameRef} 
              onStatusChange={handleCreateGameStatusChange}
            />
          </div>
        ) : (
          <>
            <div className="w-full max-w-md">
              <GameCard
                game={state.game}
                isLoading={false}
                refreshGame={fetchLatestGame}
                userAddress={address}
              />
            </div>
            {address ? (
              <section className="templateSection flex w-full flex-col items-center justify-center gap-4 rounded-xl px-2 py-4 md:grow">
                <div className="flex w-full justify-center gap-4 mb-4">
                  <button
                    onClick={() => handleGameSelect('space-invaders')}
                    className={`px-4 py-2 text-lg font-mono transition-all ${
                      selectedGame === 'space-invaders'
                        ? 'bg-yellow-500 text-black px-4 py-2 border-2 border-[#FFFF00] hover:bg-black hover:text-yellow-500 transition-all'
                        : 'bg-black text-yellow-500 hover:bg-yellow-500 hover:text-black'
                    }`}
                  >
                    SPACE INVADERS
                  </button>
                  <button
                    onClick={() => handleGameSelect('asteroids')}
                    className={`px-4 py-2 text-lg font-mono transition-all ${
                      selectedGame === 'asteroids'
                        ? 'bg-yellow-500 text-black px-4 py-2 border-2 border-[#FFFF00] hover:bg-black hover:text-yellow-500 transition-all'
                        : 'bg-black text-yellow-500 hover:bg-yellow-500 hover:text-black'
                    }`}
                  >
                    ASTEROIDS
                  </button>
                </div>            
                {!selectedGame && (
                  <p className="font-mono text-white">select a game to play!</p>
                )}
                {selectedGame === 'space-invaders' && (
                  <div className="w-full">
                    <SpaceInvaders gameId={Number(state.game.gameId)} existingHighScore={Number(state.game.highScore)} />
                  </div>
                )}
                {selectedGame === 'asteroids' && (
                  <div className="w-full">
                    <Asteroids gameId={Number(state.game.gameId)} existingHighScore={Number(state.game.highScore)} updateTickets={updateTickets} />
                  </div>
                )}
              </section>
            ) : (
              <WalletWrapper
                className="w-[450px] max-w-full button bg-yellow-500 text-white hover:bg-black hover:text-yellow-500 border-2 border-yellow-500 disabled:bg-yellow-500 disabled:text-white"
                text="LOG IN TO PLAY"
                withWalletAggregator={true}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}
