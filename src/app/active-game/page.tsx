'use client';
import Navbar from 'src/components/Navbar';
import CreateGameWrapper from 'src/components/CreateGameWrapper';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Address } from 'viem';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';
import { publicClient, contractABI, CONTRACT_ADDRESS, gameMasterAddress, ethPrice } from 'src/constants';
import WalletWrapper from 'src/components/WalletWrapper';
import WinnerWithdrawWrapper from 'src/components/WinnerWithdrawWrapper';
import Shoot from 'src/components/Shoot';
import Jump from 'src/components/Jump';
import { useTicketContext } from 'src/context/TicketContext';
import Button from 'src/components/Button';
import FlyGame from 'src/components/Fly';

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
    ({ game, isLoading, refreshGame, userAddress }: {
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
                                ) : isGameOver && !isGameWithdrawn && isUserLeader ? (
                                    <WinnerWithdrawWrapper gameId={game.gameId} userAddress={userAddress} />
                                ) : isGameOver && isGameWithdrawn && isUserLeader ? (
                                    <p className="font-bold text-accent-yellow">PRIZE WITHDRAWN!</p>
                                ) : (
                                    <Button onClick={refreshGame} disabled={isLoading}>
                                        NEW GAME
                                    </Button>
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
                                            navigator.clipboard
                                                .writeText(game.leader)
                                                .then(() => setIsCopied(true))
                                                .then(() => setTimeout(() => setIsCopied(false), 2000));
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
    const createGameRef = useRef<{ createGame: () => Promise<void> } | null>(null);
    const [selectedGame, setSelectedGame] = useState< 'jump' | 'shoot' | 'fly' | null>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);

    const fetchGame = useCallback(async (gameId: number) => {
        try {
            const { endTime, highScore, leader, pot, potHistory } = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
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
                address: CONTRACT_ADDRESS,
                abi: contractABI,
                functionName: 'getLatestGameId',
            });
            const gameId = Number(latestGameId);
            let gameData: GameData | null = null;

            if (gameId > 0) {
                gameData = await fetchGame(gameId);
                const currentTime = BigInt(Math.floor(Date.now() / 1000));
                if (gameData.endTime <= currentTime || gameData.error) {
                    gameData = null;
                }
            }

            if (!gameData && createGameRef.current) {
                setGameState(prev => ({ ...prev, flowStatus: 'creating' }));
                await createGameRef.current.createGame();
                const newGameId = gameId + 1;
                gameData = await fetchGame(newGameId);
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

    const handleCreateGameStatusChange = useCallback(
        async (status: 'idle' | 'pending' | 'success' | 'error', message?: string) => {
            if (status === 'success' && message?.startsWith('Transaction hash:')) {
                const txHash = message.split('Transaction hash: ')[1];
                await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
            } else if (status === 'error' && message) {
                setGameState(prev => ({ ...prev, flowStatus: 'error', errorMessage: message }));
            }
        },
        []
    );

    // Preload reCAPTCHA script
    useEffect(() => {
        const script = document.createElement('script');
        script.src = `https://www.google.com/recaptcha/api.js?render=${process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}`;
        script.async = true;
        script.onload = () => console.log('reCAPTCHA script loaded');
        script.onerror = () => console.error('reCAPTCHA script failed to load');
        document.body.appendChild(script);
        return () => {
            document.body.removeChild(script);
        };
    }, []);
    
    useEffect(() => {
        initializeGameFlow();
    }, [initializeGameFlow]);

    const handleGameSelection = (game: 'jump' | 'shoot' | 'fly') => {
        if (isTransitioning) return;
        setIsTransitioning(true);
        setSelectedGame(game);
        setTimeout(() => setIsTransitioning(false), 500); // Match fade-in duration
    };

    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const isGameOver = gameState.game ? gameState.game.endTime <= currentTime : false;

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
                    <CreateGameWrapper ref={createGameRef} onStatusChange={handleCreateGameStatusChange} />
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
                        <CreateGameWrapper ref={createGameRef} onStatusChange={handleCreateGameStatusChange} />
                    </div>
                ) : (
                    <>
                        <div className="gap-4 w-full animate-fade-in">
                            <GameCard game={gameState.game} isLoading={false} refreshGame={initializeGameFlow} userAddress={address} />
                        </div>
                       
                            <section className="flex w-full flex-col items-center gap-4 px-2 py-4">
                                <div className="flex w-full justify-center gap-4 mb-4">
                                    <button
                                        onClick={() => handleGameSelection('jump')}
                                        className={`${selectedGame === 'jump' ? 'btn-menu-selected' : 'btn-menu-idle'} ${isTransitioning ? 'opacity-60 cursor-not-allowed' : ''}`}
                                        disabled={isTransitioning}
                                    >
                                        JUMP
                                    </button>
                                    <button
                                        onClick={() => handleGameSelection('shoot')}
                                        className={`${selectedGame === 'shoot' ? 'btn-menu-selected' : 'btn-menu-idle'} ${isTransitioning ? 'opacity-60 cursor-not-allowed' : ''}`}
                                        disabled={isTransitioning}
                                    >
                                        SHOOT
                                    </button>
                                    <button
                                        onClick={() => handleGameSelection('fly')}
                                        className={`${selectedGame === 'fly' ? 'btn-menu-selected' : 'btn-menu-idle'} ${isTransitioning ? 'opacity-60 cursor-not-allowed' : ''}`}
                                        disabled={isTransitioning}
                                    >
                                        FLY
                                    </button>
                                </div>
                                {!selectedGame && <p className="text-primary-text">select a game to play!</p>}
                                {selectedGame === 'jump' && (
                                    <div className="w-full animate-fade-in">
                                        <Jump
                                            gameId={Number(gameState.game.gameId)}
                                            existingHighScore={Number(gameState.game.highScore)}
                                            updateTickets={refreshTickets}
                                        />
                                    </div>
                                )}
                                {selectedGame === 'shoot' && (
                                    <div className="w-full animate-fade-in">
                                        <Shoot
                                            gameId={Number(gameState.game.gameId)}
                                            existingHighScore={Number(gameState.game.highScore)}
                                            updateTickets={refreshTickets}
                                        />
                                    </div>
                                )}
                                {selectedGame === 'fly' && (
                                    <div className="w-full animate-fade-in">
                                        <FlyGame
                                            gameId={Number(gameState.game.gameId)}
                                            existingHighScore={Number(gameState.game.highScore)}
                                            updateTickets={refreshTickets}
                                        />
                                    </div>
                                )}
                            </section>
                        
                    </>
                )}
            </section>
        </div>
    );
}
