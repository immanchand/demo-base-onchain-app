'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTicketContext } from 'src/context/TicketContext';
import StartGameWrapper from 'src/components/StartGameWrapper';
import EndGameWrapper from 'src/components/EndGameWrapper';
import { useAccount } from 'wagmi';
import Button from './Button';

interface JumpProps {
    gameId: number;
    existingHighScore: number;
    updateTickets: () => void;
}

interface Entity {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface Obstacle extends Entity {
    dx: number;
}

type EnemyType = 'asteroid' | 'bitcoin' | 'xrp' | 'solana' | 'gensler';
type ShipType = 'ship' | 'eth' | 'base';

// Constants
const SHIP_SIZE = 40;
const OBSTACLE_SIZE = 40;
const GRAVITY = 0.5;
const JUMP_VELOCITY = -12;
const OBSTACLE_SPEED = -3;
const GROUND_HEIGHT = 100;

const Jump: React.FC<JumpProps> = ({ gameId, existingHighScore, updateTickets }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [gameStarted, setGameStarted] = useState<boolean>(false);
    const [gameOver, setGameOver] = useState<boolean>(false);
    const [score, setScore] = useState<number>(0);
    const [enemyType, setEnemyType] = useState<EnemyType>('asteroid');
    const [shipType, setShipType] = useState<ShipType>('ship');
    const [imagesLoaded, setImagesLoaded] = useState<boolean>(false);
    const [enemyImages, setEnemyImages] = useState<Record<EnemyType, HTMLImageElement>>({} as Record<EnemyType, HTMLImageElement>);
    const [shipImages, setShipImages] = useState<Record<ShipType, HTMLImageElement>>({} as Record<ShipType, HTMLImageElement>);
    const lastFrameTimeRef = useRef<number>(performance.now());
    const animationFrameIdRef = useRef<number>(0);
    const { ticketCount } = useTicketContext();
    const startGameRef = useRef<{ startGame: () => Promise<void> }>(null);
    const endGameRef = useRef<{ endGame: () => Promise<void> }>(null);
    const [startGameStatus, setStartGameStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
    const [endGameStatus, setEndGameStatus] = useState<'idle' | 'pending' | 'leader' | 'loser' | 'error'>('idle');
    const [startGameError, setStartGameError] = useState<string>('');
    const [endGameError, setEndGameError] = useState<string>('');
    const [endGameMessage, setEndGameMessage] = useState<string>('');
    const { address } = useAccount();

    // Preload images (reused from Asteroids)
    useEffect(() => {
        const images = {
            asteroid: new Image(),
            bitcoin: new Image(),
            xrp: new Image(),
            solana: new Image(),
            gensler: new Image(),
            ship: new Image(),
            eth: new Image(),
            base: new Image(),
        };
        images.asteroid.src = '/images/asteroid.webp';
        images.bitcoin.src = '/images/bitcoin.png';
        images.xrp.src = '/images/xrp.png';
        images.solana.src = '/images/solana.png';
        images.gensler.src = '/images/gensler.png';
        images.ship.src = '/images/spaceship.png';
        images.eth.src = '/images/ethereum.png';
        images.base.src = '/images/base.png';

        let loadedCount = 0;
        const totalImages = Object.keys(images).length;

        const onImageLoad = () => {
            loadedCount += 1;
            if (loadedCount === totalImages) {
                setEnemyImages({
                    asteroid: images.asteroid,
                    bitcoin: images.bitcoin,
                    xrp: images.xrp,
                    solana: images.solana,
                    gensler: images.gensler,
                });
                setShipImages({
                    ship: images.ship,
                    eth: images.eth,
                    base: images.base,
                });
                setImagesLoaded(true);
            }
        };

        Object.values(images).forEach(img => {
            img.onload = onImageLoad;
        });
    }, []);

    // Game logic
    const spawnObstacle = useCallback((canvas: HTMLCanvasElement): Obstacle => {
        return {
            x: canvas.width,
            y: canvas.height - GROUND_HEIGHT - OBSTACLE_SIZE,
            width: OBSTACLE_SIZE,
            height: OBSTACLE_SIZE,
            dx: OBSTACLE_SPEED,
        };
    }, []);

    const drawShip = (ctx: CanvasRenderingContext2D, ship: { x: number; y: number }) => {
        const image = shipImages[shipType] || shipImages.ship;
        ctx.drawImage(image, ship.x, ship.y, SHIP_SIZE, SHIP_SIZE);
    };

    const drawObstacles = (ctx: CanvasRenderingContext2D, obstaclePool: Obstacle[]) => {
        obstaclePool.forEach((obstacle) => {
            const image = enemyImages[enemyType] || enemyImages.asteroid;
            ctx.drawImage(image, obstacle.x, obstacle.y, OBSTACLE_SIZE, OBSTACLE_SIZE);
        });
    };

    const drawGround = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
        ctx.fillStyle = '#555555';
        ctx.fillRect(0, canvas.height - GROUND_HEIGHT, canvas.width, GROUND_HEIGHT);
    };

    // Game loop setup
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !imagesLoaded) return;

        const resizeCanvas = () => {
            const { width, height } = container.getBoundingClientRect();
            canvas.width = width;
            canvas.height = height;
        };

        resizeCanvas();
        const resizeObserver = new ResizeObserver(resizeCanvas);
        resizeObserver.observe(container);

        let ship = {
            x: 50,
            y: canvas.height - GROUND_HEIGHT - SHIP_SIZE,
            width: SHIP_SIZE,
            height: SHIP_SIZE,
            vy: 0, // Vertical velocity for jumping
        };
        let obstaclePool: Obstacle[] = [];
        let lastObstacleSpawn = 0;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawGround(ctx, canvas);
            if (!gameOver) {
                drawShip(ctx, ship);
            }
            drawObstacles(ctx, obstaclePool);
        };

        const update = (deltaTime: number) => {
            // Update ship
            if (!gameOver) {
                ship.vy += GRAVITY;
                ship.y += ship.vy;
                if (ship.y > canvas.height - GROUND_HEIGHT - SHIP_SIZE) {
                    ship.y = canvas.height - GROUND_HEIGHT - SHIP_SIZE;
                    ship.vy = 0;
                }
                setScore((prev) => prev + deltaTime * 10); // Score increases over time
            }

            // Update obstacles
            obstaclePool.forEach((obstacle) => {
                obstacle.x += obstacle.dx;
            });
            obstaclePool = obstaclePool.filter((obstacle) => obstacle.x + OBSTACLE_SIZE > 0);

            // Spawn new obstacles
            lastObstacleSpawn += deltaTime;
            if (lastObstacleSpawn > 2 && !gameOver) { // Spawn every 2 seconds
                obstaclePool.push(spawnObstacle(canvas));
                lastObstacleSpawn = 0;
            }

            // Check collisions
            if (!gameOver) {
                obstaclePool.forEach((obstacle) => {
                    const dx = ship.x + SHIP_SIZE / 2 - (obstacle.x + OBSTACLE_SIZE / 2);
                    const dy = ship.y + SHIP_SIZE / 2 - (obstacle.y + OBSTACLE_SIZE / 2);
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < (SHIP_SIZE + OBSTACLE_SIZE) / 2) {
                        setGameOver(true);
                    }
                });
            }
        };

        const gameLoop = (time: number) => {
            const deltaTime = (time - lastFrameTimeRef.current) / 1000;
            lastFrameTimeRef.current = time;
            draw();
            update(deltaTime);
            animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !gameOver && ship.y === canvas.height - GROUND_HEIGHT - SHIP_SIZE) {
                ship.vy = JUMP_VELOCITY;
            }
        };

        if (gameStarted) {
            ship.y = canvas.height - GROUND_HEIGHT - SHIP_SIZE;
            ship.vy = 0;
            obstaclePool = [spawnObstacle(canvas)];
            lastObstacleSpawn = 0;

            window.addEventListener('keydown', handleKeyDown);
            lastFrameTimeRef.current = performance.now();
            animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        }

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('keydown', handleKeyDown);
            cancelAnimationFrame(animationFrameIdRef.current);
        };
    }, [gameStarted, gameOver, imagesLoaded, shipType, enemyType, spawnObstacle]);

    const startGame = useCallback(async () => {
        if (ticketCount > 0 && startGameRef.current) {
            setStartGameStatus('pending');
            await startGameRef.current.startGame();
        } else if (ticketCount < 1) {
            setStartGameStatus('error');
            setStartGameError('You need one ticket to play!');
        }
    }, [ticketCount]);

    const endGame = useCallback(async () => {
        if (endGameRef.current && gameStarted) {
            setEndGameStatus('pending');
            await endGameRef.current.endGame();
        }
    }, [gameStarted]);

    const handleStartGameStatusChange = useCallback((status: 'idle' | 'pending' | 'success' | 'error', errorMessage?: string) => {
        setStartGameStatus(status);
        if (status === 'pending') {
            setStartGameError('');
        } else if (status === 'success') {
            updateTickets();
            setGameStarted(true);
            setGameOver(false);
            setScore(0);
            setEndGameStatus('idle');
            setEndGameError('');
            setEndGameMessage('');
            containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            canvasRef.current?.focus();
        } else if (status === 'error') {
            setStartGameError(errorMessage || 'Failed to start game');
            setGameStarted(false);
        }
    }, [updateTickets]);

    const handleEndGameStatusChange = useCallback((status: 'idle' | 'pending' | 'leader' | 'loser' | 'error', errorMessage?: string, highScore?: string) => {
        setEndGameStatus(status);
        if (status === 'pending') {
            setEndGameError('');
        } else if (status === 'leader') {
            setEndGameMessage('CONGRATULATIONS! YOU SET A NEW HIGH SCORE!');
            console.log('New leader score:', Math.floor(score));
        } else if (status === 'loser') {
            setEndGameMessage(`YOU DID NOT BEAT THE HIGH SCORE: ${highScore}!`);
            console.log('Game ended, not the leader. Player Score:', Math.floor(score), 'High Score:', highScore);
        } else if (status === 'error') {
            setEndGameError(errorMessage || 'Failed to end game');
        }
    }, [score]);

    useEffect(() => {
        if (gameOver && gameStarted && endGameStatus === 'idle') {
            endGame();
        }
    }, [gameOver, gameStarted, endGameStatus, endGame]);

    const gameOverMessages: Record<string, JSX.Element> = {
        pending: <p>SUBMITTING SCORE...</p>,
        leader: <p>{endGameMessage}</p>,
        loser: <p>{endGameMessage}</p>,
        error: <p className="text-error-red">Error: {endGameError || 'Failed to submit score'}</p>,
        idle: <p></p>,
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-primary-bg p-4">
            <StartGameWrapper
                ref={startGameRef}
                gameId={gameId.toString()}
                playerAddress={address || '0x0'}
                onStatusChange={handleStartGameStatusChange}
            />
            <EndGameWrapper
                ref={endGameRef}
                gameId={gameId.toString()}
                playerAddress={address || '0x0'}
                score={Math.floor(score).toString()}
                highScore={existingHighScore.toString()}
                onStatusChange={handleEndGameStatusChange}
            />
            {!gameStarted ? (
                <div className="text-center text-primary-text font-mono">
                    <h1 className="text-3xl text-accent-yellow mb-4">JUMP</h1>
                    <p className="text-xl mb-2">INSTRUCTIONS:</p>
                    <p className="mb-2">Press the spacebar to make your ship jump.</p>
                    <p className="mb-4">Avoid hitting obstacles to keep going!</p>
                    <p className="mb-2">CONTROLS:</p>
                    <p className="mb-4">Spacebar: Jump</p>
                    <div className="mb-4 flex items-center justify-center">
                        <p className="mr-2">CHOOSE SPACE SHIP:</p>
                        {imagesLoaded && shipImages[shipType] && (
                            <img src={shipImages[shipType].src} alt={shipType} className="w-10 h-10 mr-2" />
                        )}
                        <select
                            value={shipType}
                            onChange={(e) => setShipType(e.target.value as ShipType)}
                            className="bg-primary-bg text-primary-text border border-primary-border p-1"
                        >
                            <option value="ship">DEFAULT</option>
                            <option value="eth">ETHEREUM</option>
                            <option value="base">BASE</option>
                        </select>
                    </div>
                    <div className="mb-4 flex items-center justify-center">
                        <p className="mr-2">CHOOSE OBSTACLE:</p>
                        {imagesLoaded && enemyImages[enemyType] && (
                            <img src={enemyImages[enemyType].src} alt={enemyType} className="w-10 h-10 mr-2" />
                        )}
                        <select
                            value={enemyType}
                            onChange={(e) => setEnemyType(e.target.value as EnemyType)}
                            className="bg-primary-bg text-primary-text border border-primary-border p-1"
                        >
                            <option value="asteroid">DEFAULT</option>
                            <option value="bitcoin">BITCOIN</option>
                            <option value="xrp">XRP</option>
                            <option value="solana">SOLANA</option>
                            <option value="gensler">GENSLER</option>
                        </select>
                    </div>
                    <Button onClick={startGame} disabled={startGameStatus === 'pending' || !imagesLoaded}>
                        {startGameStatus === 'pending' ? 'starting...' : !imagesLoaded ? 'Loading...' : 'START GAME'}
                    </Button>
                    <p className="mt-2">COST: 1 TICKET</p>
                    {startGameStatus === 'error' && startGameError && (
                        <p className="text-error-red mt-2">{startGameError}</p>
                    )}
                </div>
            ) : (
                <div ref={containerRef} className="w-full max-w-[1008px] h-[80vh] min-h-[400px] min-w-[300px] relative">
                    <div className="text-primary-text mb-1 text-center font-mono">
                        <span className="text-2xl text-accent-yellow">SCORE: {Math.floor(score)}</span>
                        <span className="text-2xl text-accent-yellow ml-8">HIGH SCORE: {existingHighScore}</span>
                    </div>
                    {gameOver && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-primary-text text-2xl font-mono">
                            <p>GAME OVER - YOUR SCORE: {Math.floor(score)}</p>
                            {gameOverMessages[endGameStatus]}
                            <Button
                                className="mt-6"
                                onClick={startGame}
                                disabled={startGameStatus === 'pending' || endGameStatus === 'pending' || endGameStatus === 'leader'}
                            >
                                {startGameStatus === 'pending' ? 'starting...' : 'PLAY AGAIN'}
                            </Button>
                            {startGameStatus === 'error' && startGameError && (
                                <p className="text-error-red mt-2">{startGameError}</p>
                            )}
                        </div>
                    )}
                    <canvas ref={canvasRef} className="w-full h-full border-2 border-primary-border" tabIndex={0} />
                </div>
            )}
        </div>
    );
};

export default Jump;
