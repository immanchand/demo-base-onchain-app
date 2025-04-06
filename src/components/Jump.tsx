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

type EnemyType = 'obstacle' | 'bitcoin' | 'xrp' | 'solana' | 'gensler';
type ShipType = 'runner' | 'eth' | 'base';

// Constants
const SHIP_SIZE = 40;
const OBSTACLE_SIZE = 40;
const GRAVITY = 0.5;
const JUMP_VELOCITY = -12;
const BASE_OBSTACLE_SPEED = -3;
const GROUND_HEIGHT = 100;
const DOUBLE_PRESS_THRESHOLD = 300; // 300ms for double press detection
const SOIL_PARTICLE_COUNT = 100; // Number of soil particles for scrolling effect
const SOIL_PARTICLE_SIZE = 2; // Size of each soil particle
const BACKGROUND_SPEED = 0.3; // Speed for background scrolling (slower than soil)

const Jump: React.FC<JumpProps> = ({ gameId, existingHighScore, updateTickets }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [gameStarted, setGameStarted] = useState<boolean>(false);
    const [gameOver, setGameOver] = useState<boolean>(false);
    const [score, setScore] = useState<number>(0);
    const [enemyType, setEnemyType] = useState<EnemyType>('obstacle');
    const [shipType, setShipType] = useState<ShipType>('runner');
    const [imagesLoaded, setImagesLoaded] = useState<boolean>(false);
    const [enemyImages, setEnemyImages] = useState<Record<EnemyType, HTMLImageElement>>({} as Record<EnemyType, HTMLImageElement>);
    const [shipImages, setShipImages] = useState<Record<ShipType, HTMLImageElement>>({} as Record<ShipType, HTMLImageElement>);
    const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null); // State for background image
    const lastFrameTimeRef = useRef<number>(performance.now());
    const animationFrameIdRef = useRef<number>(0);
    const lastKeyPressRef = useRef<number>(0);
    const jumpCountRef = useRef<number>(0);
    const startTimeRef = useRef<number>(0);
    const { ticketCount } = useTicketContext();
    const startGameRef = useRef<{ startGame: () => Promise<void> }>(null);
    const endGameRef = useRef<{ endGame: () => Promise<void> }>(null);
    const [startGameStatus, setStartGameStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
    const [endGameStatus, setEndGameStatus] = useState<'idle' | 'pending' | 'leader' | 'loser' | 'error'>('idle');
    const [startGameError, setStartGameError] = useState<string>('');
    const [endGameError, setEndGameError] = useState<string>('');
    const [endGameMessage, setEndGameMessage] = useState<string>('');
    const { address } = useAccount();

    // Preload images
    useEffect(() => {
        const images = {
            obstacle: new Image(),
            bitcoin: new Image(),
            xrp: new Image(),
            solana: new Image(),
            gensler: new Image(),
            runner: new Image(),
            eth: new Image(),
            base: new Image(),
            background: new Image(), // Add background image
        };
        images.obstacle.src = '/images/obstacle.png';
        images.bitcoin.src = '/images/bitcoin_sq.png';
        images.xrp.src = '/images/xrp_sq.png';
        images.solana.src = '/images/solana.png';
        images.gensler.src = '/images/gensler_sq.png';
        images.runner.src = '/images/runner.png';
        images.eth.src = '/images/ethereum_up.png';
        images.base.src = '/images/base.png';
        images.background.src = '/images/clouds.png'; // Your 1024x600px image

        let loadedCount = 0;
        const totalImages = Object.keys(images).length;

        const onImageLoad = () => {
            loadedCount += 1;
            if (loadedCount === totalImages) {
                setEnemyImages({
                    obstacle: images.obstacle,
                    bitcoin: images.bitcoin,
                    xrp: images.xrp,
                    solana: images.solana,
                    gensler: images.gensler,
                });
                setShipImages({
                    runner: images.runner,
                    eth: images.eth,
                    base: images.base,
                });
                setBackgroundImage(images.background); // Set the background image
                setImagesLoaded(true);
            }
        };

        Object.values(images).forEach(img => {
            img.onload = onImageLoad;
        });
    }, []);

    // Game logic
    const spawnObstacles = useCallback((canvas: HTMLCanvasElement, speed: number, elapsedTime: number): Obstacle[] => {
        const obstacles: Obstacle[] = [];
        const baseX = canvas.width;
        const baseY = canvas.height - GROUND_HEIGHT - OBSTACLE_SIZE;

        let widthCount = 1;
        let heightCount = 1;

        const timeLevel = Math.floor(elapsedTime / 10);
        if (timeLevel >= 1) heightCount = 2; // 1x2 at 10s
        if (timeLevel >= 2) widthCount = 2;   // 2x1 at 20s
        if (timeLevel >= 3) {                // 2x2 at 30s
            widthCount = 2;
            heightCount = 2;
        }
        if (timeLevel >= 4 && Math.random() < 0.3) heightCount = 3; // 1x3 or 2x3 at 40s+

        for (let w = 0; w < widthCount; w++) {
            for (let h = 0; h < heightCount; h++) {
                obstacles.push({
                    x: baseX + w * OBSTACLE_SIZE,
                    y: baseY - h * OBSTACLE_SIZE,
                    width: OBSTACLE_SIZE,
                    height: OBSTACLE_SIZE,
                    dx: speed,
                });
            }
        }
        return obstacles;
    }, []);

    const drawBackground = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, offset: number) => {
        if (!backgroundImage) return; // Wait for image to load
        const bgWidth = backgroundImage.width; // 1024px
        const bgHeight = canvas.height - GROUND_HEIGHT; // Fit sky area
        let x = -offset % bgWidth; // Loop the image

        // Draw the image twice for seamless tiling
        ctx.drawImage(backgroundImage, x, 0, bgWidth, bgHeight);
        ctx.drawImage(backgroundImage, x + bgWidth, 0, bgWidth, bgHeight);
    };

    const drawGround = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, soilParticles: { x: number; y: number }[], offset: number) => {
        ctx.fillStyle = '#8B4513'; // Brown soil color
        ctx.fillRect(0, canvas.height - GROUND_HEIGHT, canvas.width, GROUND_HEIGHT);

        ctx.fillStyle = '#5D2E0A'; // Darker brown for particles
        soilParticles.forEach(particle => {
            let x = particle.x - offset;
            while (x < 0) x += canvas.width; // Ensure x stays positive
            x = x % canvas.width; // Wrap around
            ctx.fillRect(x, particle.y, SOIL_PARTICLE_SIZE, SOIL_PARTICLE_SIZE);
        });
    };

    const drawShip = (ctx: CanvasRenderingContext2D, ship: { x: number; y: number }) => {
        const image = shipImages[shipType] || shipImages.runner;
        ctx.drawImage(image, ship.x, ship.y, SHIP_SIZE, SHIP_SIZE);
    };

    const drawObstacles = (ctx: CanvasRenderingContext2D, obstaclePool: Obstacle[]) => {
        obstaclePool.forEach((obstacle) => {
            const image = enemyImages[enemyType] || enemyImages.obstacle;
            ctx.drawImage(image, obstacle.x, obstacle.y, OBSTACLE_SIZE, OBSTACLE_SIZE);
        });
    };

    // Game loop setup
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !imagesLoaded || !backgroundImage) return;

        const resizeCanvas = () => {
            const { width, height } = container.getBoundingClientRect();
            canvas.width = width;
            canvas.height = height;
        };

        resizeCanvas();
        const resizeObserver = new ResizeObserver(resizeCanvas);
        resizeObserver.observe(container);

        let ship = {
            x: 200,
            y: canvas.height - GROUND_HEIGHT - SHIP_SIZE,
            width: SHIP_SIZE,
            height: SHIP_SIZE,
            vy: 0,
        };
        let obstaclePool: Obstacle[] = [];
        let lastObstacleSpawnX = canvas.width;
        let backgroundOffset = 0;
        let cloudOffset = 0; // Used for background image scrolling

        // Initialize soil particles
        const soilParticles: { x: number; y: number; dx: number }[] = [];
        for (let i = 0; i < SOIL_PARTICLE_COUNT; i++) {
            soilParticles.push({
                x: Math.random() * canvas.width,
                y: canvas.height - GROUND_HEIGHT + Math.random() * GROUND_HEIGHT,
                dx: 0.5, // Positive dx for right-to-left movement
            });
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            drawBackground(ctx, canvas, cloudOffset); // Draw scrolling background
            drawGround(ctx, canvas, soilParticles, backgroundOffset);
            if (!gameOver) {
                drawShip(ctx, ship);
            }
            drawObstacles(ctx, obstaclePool);
        };

        const update = (deltaTime: number) => {
            const elapsedTime = (performance.now() - startTimeRef.current) / 1000;
            const timeLevel = Math.min(Math.floor(elapsedTime / 5), 10);
            const speedMultiplier = 1 + timeLevel * 0.05;
            const obstacleSpeed = BASE_OBSTACLE_SPEED * speedMultiplier;
            const minGap = OBSTACLE_SIZE * (50 - timeLevel * 4);

            // Update background (clouds)
            cloudOffset += BACKGROUND_SPEED * deltaTime * 60; // Scroll slower than soil

            // Update soil particles
            backgroundOffset += Math.abs(obstacleSpeed) * deltaTime * 60; // Still positive offset
            soilParticles.forEach(particle => {
                particle.x += particle.dx * deltaTime * 60; // Move right
                if (particle.x > canvas.width) {
                    particle.x = 0; // Respawn on left
                    particle.y = canvas.height - GROUND_HEIGHT + Math.random() * GROUND_HEIGHT;
                }
            });

            // Update ship
            if (!gameOver) {
                ship.vy += GRAVITY;
                ship.y += ship.vy;
                if (ship.y > canvas.height - GROUND_HEIGHT - SHIP_SIZE) {
                    ship.y = canvas.height - GROUND_HEIGHT - SHIP_SIZE;
                    ship.vy = 0;
                    jumpCountRef.current = 0;
                }
                setScore((prev) => prev + deltaTime * 10 * speedMultiplier);
            }

            // Update obstacles
            obstaclePool.forEach((obstacle) => {
                obstacle.dx = obstacleSpeed;
                obstacle.x += obstacle.dx;
            });
            obstaclePool = obstaclePool.filter((obstacle) => obstacle.x + OBSTACLE_SIZE > 0);

            // Spawn new obstacles
            const rightmostObstacle = obstaclePool.reduce((max, obs) => Math.max(max, obs.x), -minGap);
            if (canvas.width - rightmostObstacle >= minGap && !gameOver) {
                obstaclePool.push(...spawnObstacles(canvas, obstacleSpeed, elapsedTime));
                lastObstacleSpawnX = canvas.width;
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
            if (e.code === 'Space' && !gameOver && jumpCountRef.current < 2) {
                const now = Date.now();
                const timeSinceLastPress = now - lastKeyPressRef.current;
                if (timeSinceLastPress < DOUBLE_PRESS_THRESHOLD && lastKeyPressRef.current !== 0 && jumpCountRef.current === 1) {
                    ship.vy = JUMP_VELOCITY;
                    jumpCountRef.current += 1;
                } else if (jumpCountRef.current === 0) {
                    ship.vy = JUMP_VELOCITY;
                    jumpCountRef.current += 1;
                }
                lastKeyPressRef.current = now;
            }
        };

        const handleMouseDown = () => {
            if (gameOver) return;
            if (!gameOver && jumpCountRef.current < 2) {
                const now = Date.now();
                const timeSinceLastPress = now - lastKeyPressRef.current;
                if (timeSinceLastPress < DOUBLE_PRESS_THRESHOLD && lastKeyPressRef.current !== 0 && jumpCountRef.current === 1) {
                    ship.vy = JUMP_VELOCITY;
                    jumpCountRef.current += 1;
                } else if (jumpCountRef.current === 0) {
                    ship.vy = JUMP_VELOCITY;
                    jumpCountRef.current += 1;
                }
                lastKeyPressRef.current = now;
            }
        };

        if (gameStarted && !gameOver) {
            ship.y = canvas.height - GROUND_HEIGHT - SHIP_SIZE;
            ship.vy = 0;
            jumpCountRef.current = 0;
            obstaclePool = spawnObstacles(canvas, BASE_OBSTACLE_SPEED, 0);
            lastObstacleSpawnX = canvas.width;
            startTimeRef.current = performance.now();
            backgroundOffset = 0;
            cloudOffset = 0; // Reset background offset

            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('mousedown', handleMouseDown);
            lastFrameTimeRef.current = performance.now();
            animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        }

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mousedown', handleMouseDown);
            cancelAnimationFrame(animationFrameIdRef.current);
        };
    }, [gameStarted, gameOver, imagesLoaded, shipType, enemyType, spawnObstacles, backgroundImage]);

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
                    <p className="mb-2">Use the spacebar or mouse to jump.</p>
                    <p className="mb-2">Double-press or click quickly for a higher jump.</p>
                    <p className="mb-4">Avoid hitting obstacles to keep going!</p>
                    <p className="mb-2">CONTROLS:</p>
                    <p className="mb-4">Spacebar: Jump (Double-press for higher jump)</p>
                    <p className="mb-4">Mouse Click: Jump (Double-click for higher jump)</p>
                    <div className="mb-4 flex items-center justify-center">
                        <p className="mr-2">CHOOSE RUNNER:</p>
                        {imagesLoaded && shipImages[shipType] && (
                            <img src={shipImages[shipType].src} alt={shipType} className="w-10 h-10 mr-2" />
                        )}
                        <select
                            value={shipType}
                            onChange={(e) => setShipType(e.target.value as ShipType)}
                            className="bg-primary-bg text-primary-text border border-primary-border p-1"
                        >
                            <option value="runner">DEFAULT</option>
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
                            <option value="obstacle">DEFAULT</option>
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
