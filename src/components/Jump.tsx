'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTicketContext } from 'src/context/TicketContext';
import StartGameWrapper from 'src/components/StartGameWrapper';
import EndGameWrapper from 'src/components/EndGameWrapper';
import Button from './Button';
import { GameStats, Entity, JUMP_PARAMETERS, TELEMETRY_LIMIT, TELEMETRY_SCORE_THRESHOLD } from 'src/constants';
import { useAccount } from 'wagmi';
import LoginButton from './LoginButton';

// Extend the Window interface to include grecaptcha
declare global {
    interface Window {
        grecaptcha: {
            ready: (callback: () => void) => void;
            execute: (siteKey: string, options: { action: string }) => Promise<string>;
        };
    }
}

interface JumpProps {
    gameId: number;
    existingHighScore: number;
    updateTickets: () => void;
}

interface Obstacle extends Entity {
    dx: number;
    dodged: boolean;
}

interface TelemetryEvent {
    event: 'jump' | 'spawn' | 'collision' | 'frame' | 'fps';
    time: number;
    frameId?: number;
    data?: { 
        deltaTime?: number;
        difficulty?: number;
        x?: number;
        y?: number;
        vy?: number;
        speed?: number;
        score?: number;
        fps?: number;
        width?: number;
        height?: number;
    };
    obsData?: {
        obstacles?: {
            x: number;
            y: number;
            dx: number;
            dodged: boolean;
            width: number;
            height: number;
        }[];
    };
    parameters?: {
    }
}

type EnemyType = 'obstacle' | 'barrel' | 'bitcoin' | 'xrp' | 'solana' | 'gensler';
type ShipType = 'runner' | 'lady' | 'eth' | 'base';

const Jump: React.FC<JumpProps> = ({ gameId, existingHighScore, updateTickets }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [gameStarted, setGameStarted] = useState<boolean>(false);
    const [gameOver, setGameOver] = useState<boolean>(false);
    const [score, setScore] = useState<number>(0);
    const [enemyType, setEnemyType] = useState<EnemyType>('obstacle');
    const [shipType, setShipType] = useState<ShipType>('runner');
    const [imagesLoaded, setImagesLoaded] = useState<boolean>(false);
    const [isRecaptchaReady, setIsRecaptchaReady] = useState<boolean>(false);
    const [enemyImages, setEnemyImages] = useState<Record<EnemyType, HTMLImageElement>>({} as Record<EnemyType, HTMLImageElement>);
    const [shipImages, setShipImages] = useState<Record<ShipType, HTMLImageElement>>({} as Record<ShipType, HTMLImageElement>);
    const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
    const [groundImage, setGroundImage] = useState<HTMLImageElement | null>(null);
    const lastFrameTimeRef = useRef<number>(performance.now());
    const animationFrameIdRef = useRef<number>(0);
    const lastSpawnTimeRef = useRef(performance.now());
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
    const [telemetry, setTelemetry] = useState<TelemetryEvent[]>([]);
    const telemetryRef = useRef<TelemetryEvent[]>([]);
    const [isTelemetrySyncing, setIsTelemetrySyncing] = useState<boolean>(false);
    const [stats, setStats] = useState<GameStats>({
        game: 'jump',
        score: 0,
        shots: 0,
        kills: 0,
        time: 0,
        hitRate: 0,
        jumps: 0,
        obstaclesCleared: 0,
        jumpsPerSec: 0,
        flaps: 0,
        flapsPerSec: 0,
        maxObstacles: 0,
        inputsPerSec: 0,
        canvasWidth: canvasRef.current?.width || 1008,
        canvasHeight: canvasRef.current?.height || 900,
        framesCount: 0,
        shipX: 0,
    });

    // Check reCAPTCHA readiness
    useEffect(() => {
        if (window.grecaptcha) {
            window.grecaptcha.ready(() => {
                console.log('reCAPTCHA initialized');
                setIsRecaptchaReady(true);
            });
        } else {
            console.warn('reCAPTCHA script not loaded yet');
        }
    }, []);

    // Preload images
    useEffect(() => {
        const images = {
            obstacle: new Image(),
            barrel: new Image(),
            bitcoin: new Image(),
            xrp: new Image(),
            solana: new Image(),
            gensler: new Image(),
            runner: new Image(),
            lady: new Image(),
            eth: new Image(),
            base: new Image(),
            background: new Image(),
            ground: new Image(),
        };
        images.obstacle.src = '/images/WOODEN_CRATE.png';
        images.barrel.src = '/images/BARREL.png';
        images.bitcoin.src = '/images/BTC_SQ.png';
        images.xrp.src = '/images/XRP_SQ.png';
        images.solana.src = '/images/SOLANA.png';
        images.gensler.src = '/images/CLOWN_SQ.png';
        images.runner.src = '/images/RUNNER_DEF.png';
        images.lady.src = '/images/RUNNER_LADY.png';
        images.eth.src = '/images/ETH_RUNNING.png';
        images.base.src = '/images/BASE_RUNNING.png';
        images.background.src = '/images/clouds.png';
        images.ground.src = '/images/ground_bricksred.png';

        let loadedCount = 0;
        const totalImages = Object.keys(images).length;

        const onImageLoad = () => {
            loadedCount += 1;
            if (loadedCount === totalImages) {
                setEnemyImages({
                    obstacle: images.obstacle,
                    barrel: images.barrel,
                    bitcoin: images.bitcoin,
                    xrp: images.xrp,
                    solana: images.solana,
                    gensler: images.gensler,
                });
                setShipImages({
                    runner: images.runner,
                    lady: images.lady,
                    eth: images.eth,
                    base: images.base,
                });
                setBackgroundImage(images.background);
                setGroundImage(images.ground);
                setImagesLoaded(true);
            }
        };

        Object.values(images).forEach(img => {
            img.onload = onImageLoad;
        });
    }, []);

    // Game logic
    const spawnObstacles = useCallback((canvas: HTMLCanvasElement, speed: number, frameCount: number, widthCount: number, heightCount: number): Obstacle[] => {
        const obstacles: Obstacle[] = [];
        const baseX = canvas.width;
        const baseY = canvas.height * JUMP_PARAMETERS.GROUND_HEIGHT_RATIO - JUMP_PARAMETERS.SHIP_HEIGHT;

        for (let w = 0; w < widthCount; w++) {
            for (let h = 0; h < heightCount; h++) {
                const newEvent = { event: 'spawn' as const, time: performance.now(), frameId: frameCount, 
                    data: {x: baseX + w * JUMP_PARAMETERS.OBSTACLE_SIZE, y: baseY - h * JUMP_PARAMETERS.OBSTACLE_SIZE, speed, width: JUMP_PARAMETERS.OBSTACLE_SIZE, height: JUMP_PARAMETERS.OBSTACLE_SIZE, w } };
                        telemetryRef.current = telemetryRef.current.length >= TELEMETRY_LIMIT
                            ? [...telemetryRef.current.slice(1), newEvent]
                            : [...telemetryRef.current, newEvent];
                obstacles.push({
                    x: baseX + w * JUMP_PARAMETERS.OBSTACLE_SIZE,
                    y: baseY - h * JUMP_PARAMETERS.OBSTACLE_SIZE,
                    width: JUMP_PARAMETERS.OBSTACLE_SIZE,
                    height: JUMP_PARAMETERS.OBSTACLE_SIZE,
                    dx: speed,
                    dodged: false
                });
            }
        }
        return obstacles;
    }, []);

    const drawBackground = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, offset: number) => {
        if (!backgroundImage) return;
        const bgWidth = backgroundImage.width;
        const bgHeight = canvas.height * JUMP_PARAMETERS.GROUND_HEIGHT_RATIO;
        let x = -offset % bgWidth;
        ctx.drawImage(backgroundImage, x, 0, bgWidth, bgHeight);
        ctx.drawImage(backgroundImage, x + bgWidth, 0, bgWidth, bgHeight);
    };

    const drawGround = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, offset: number) => {
        if (!groundImage) return;
        const groundWidth = groundImage.width;
        const groundHeight = canvas.height - canvas.height * JUMP_PARAMETERS.GROUND_HEIGHT_RATIO;
        let x = -offset % groundWidth;
        ctx.drawImage(groundImage, x, canvas.height - groundHeight, groundWidth, groundHeight);
        ctx.drawImage(groundImage, x + groundWidth, canvas.height - groundHeight, groundWidth, groundHeight);
    };

    const drawShip = (ctx: CanvasRenderingContext2D, ship: { x: number; y: number }) => {
        const image = shipImages[shipType] || shipImages.runner;
        ctx.drawImage(image, ship.x, ship.y, JUMP_PARAMETERS.SHIP_WIDTH, JUMP_PARAMETERS.SHIP_HEIGHT);
    };

    const drawObstacles = (ctx: CanvasRenderingContext2D, obstaclePool: Obstacle[]) => {
        obstaclePool.forEach((obstacle) => {
            const image = enemyImages[enemyType] || enemyImages.obstacle;
            ctx.drawImage(image, obstacle.x, obstacle.y, JUMP_PARAMETERS.OBSTACLE_SIZE, JUMP_PARAMETERS.OBSTACLE_SIZE);
        });
    };

    // Game loop setup
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !imagesLoaded || !backgroundImage || !groundImage) return;

        const resizeCanvas = () => {
            const { width, height } = container.getBoundingClientRect();
            canvas.width = width;
            canvas.height = height;
            setStats((prev) => ({ ...prev, canvasWidth: width, canvasHeight: height }));
        };

        resizeCanvas();
        const resizeObserver = new ResizeObserver(resizeCanvas);
        resizeObserver.observe(container);

        let ship = {
            x: canvasRef.current.width * 0.15,
            y: canvas.height * JUMP_PARAMETERS.GROUND_HEIGHT_RATIO - JUMP_PARAMETERS.SHIP_HEIGHT,
            width: JUMP_PARAMETERS.SHIP_WIDTH,
            height: JUMP_PARAMETERS.SHIP_HEIGHT,
            vy: 0,
        };
        let obstaclePool: Obstacle[] = [];
        let backgroundOffset = 0;
        let cloudOffset = 0;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            drawBackground(ctx, canvas, cloudOffset);
            drawGround(ctx, canvas, backgroundOffset);
            if (!gameOver) {
                drawShip(ctx, ship);
            }
            drawObstacles(ctx, obstaclePool);
        };

        let frameCount = 0;
        let pendingStatsUpdate = { ...stats };
        let frameTimes: number[] = [];
        let maxObstacles = 0;
        const update = (deltaTime: number) => {
            const elapsedTime = (performance.now() - startTimeRef.current) / 1000;
            const difficultyFactor = Math.min(elapsedTime / JUMP_PARAMETERS.DIFFICULTY_FACTOR_TIME, 1);
            const clusterChance = difficultyFactor * JUMP_PARAMETERS.CLUSTER_CHANCE;
            const obstacleSpeed = JUMP_PARAMETERS.BASE_OBSTACLE_SPEED * (1 + difficultyFactor);
            const minGap = JUMP_PARAMETERS.MAX_SPAWN_INTERVAL * (1 - difficultyFactor) + JUMP_PARAMETERS.MIN_SPAWN_INTERVAL;
            
            const obstacleSize = JUMP_PARAMETERS.OBSTACLE_SIZE;

            cloudOffset += 0.3 * deltaTime * 60; //sky speed 0.3
            backgroundOffset += Math.abs(obstacleSpeed) * deltaTime * 60;

            if (!gameOver) {
                ship.vy += JUMP_PARAMETERS.GRAVITY;
                ship.y += ship.vy;
                if (ship.y > canvas.height * JUMP_PARAMETERS.GROUND_HEIGHT_RATIO - JUMP_PARAMETERS.SHIP_HEIGHT) {
                    ship.y = canvas.height * JUMP_PARAMETERS.GROUND_HEIGHT_RATIO - JUMP_PARAMETERS.SHIP_HEIGHT;
                    ship.vy = 0;
                    jumpCountRef.current = 0;
                }
                setScore((prev) => prev + deltaTime * JUMP_PARAMETERS.SCORE_MULTIPLIER);
                frameCount++;
                if (frameCount % 10 === 0) {
                    const newEvent: TelemetryEvent = {
                        event: 'frame',
                        time: performance.now(),
                        frameId: frameCount,
                        data: { deltaTime: deltaTime * 10, difficulty: difficultyFactor, score, speed: obstacleSpeed, x: ship.x, y: ship.y, vy: ship.vy, width: ship.width, height: ship.height},
                        obsData: { obstacles: obstaclePool.map(o => ({ x: o.x, y: o.y, dx: o.dx, dodged: o.dodged, width: o.width, height: o.height })) }
                    };
                    telemetryRef.current = telemetryRef.current.length >= TELEMETRY_LIMIT
                        ? [...telemetryRef.current.slice(1), newEvent]
                        : [...telemetryRef.current, newEvent];
                }
                frameTimes.push(deltaTime);
                if (frameCount % 100 === 0) {
                    const avgFps = 1 / (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length);
                    const newEvent: TelemetryEvent = {
                        event: 'fps',
                        time: performance.now(),
                        data: {
                            fps: avgFps,
                            width: canvas.width,
                            height: canvas.height
                        },
                        parameters: { ...JUMP_PARAMETERS }, // Snapshot of all constants
                    };
                    telemetryRef.current = telemetryRef.current.length >= TELEMETRY_LIMIT
                        ? [...telemetryRef.current.slice(1), newEvent]
                        : [...telemetryRef.current, newEvent];
                    frameTimes = [];
                }
                maxObstacles = Math.max(maxObstacles, obstaclePool.length);
                pendingStatsUpdate = {
                    ...pendingStatsUpdate,
                    score,
                    time: performance.now() - startTimeRef.current,
                    jumpsPerSec: pendingStatsUpdate.jumps / (pendingStatsUpdate.time / 1000 || 1),
                    maxObstacles: maxObstacles,
                    inputsPerSec: inputCount / (pendingStatsUpdate.time / 1000 || 1),
                    framesCount: frameCount
                };
            }

            obstaclePool.forEach((obstacle) => {
                //obstacle.dx = obstacleSpeed;
                obstacle.x += obstacle.dx;
                if (obstacle.x + obstacleSize < ship.x && !obstacle.dodged) {
                    pendingStatsUpdate = { ...pendingStatsUpdate, obstaclesCleared: pendingStatsUpdate.obstaclesCleared + 1 };
                    obstacle.dodged = true;
                }
            });
            obstaclePool = obstaclePool.filter((obstacle) => obstacle.x + obstacleSize > 0);

            //const rightmostObstacle = obstaclePool.reduce((max, obs) => Math.max(max, obs.x), -minGap);
            const currentTime = performance.now();
            if (currentTime - lastSpawnTimeRef.current >= minGap && !gameOver) {
            //if (canvas.width - rightmostObstacle >= minGap && !gameOver) {
                const randNumber = Math.random();
                const widthCount = randNumber < clusterChance ? 2 : 1;
                const heightCount = randNumber < clusterChance/8 ? 4 :
                                    randNumber < clusterChance/4 ? 3 :
                                    randNumber < clusterChance*2 ? 2 : 1;

                obstaclePool.push(...spawnObstacles(canvas, obstacleSpeed, frameCount, widthCount, heightCount));
                lastSpawnTimeRef.current = currentTime; // Update spawn time
            }

            if (!gameOver) {
                obstaclePool.forEach((obstacle) => {
                    const dx = ship.x + JUMP_PARAMETERS.SHIP_WIDTH / 2 - (obstacle.x + obstacleSize / 2);
                    const dy = ship.y + JUMP_PARAMETERS.SHIP_HEIGHT / 2 - (obstacle.y + obstacleSize / 2);
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < (JUMP_PARAMETERS.SHIP_WIDTH + obstacleSize) / 2) {
                        setGameOver(true);
                        const newEvent = { event: 'collision' as const, time: performance.now() };
                        telemetryRef.current = telemetryRef.current.length >= TELEMETRY_LIMIT
                            ? [...telemetryRef.current.slice(1), newEvent]
                            : [...telemetryRef.current, newEvent];
                    }
                });
            }
            setStats(pendingStatsUpdate);
        };

        const gameLoop = (time: number) => {
            const deltaTime = (time - lastFrameTimeRef.current) / 1000;
            lastFrameTimeRef.current = time;
            draw();
            update(deltaTime);
            animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        };

        const handleJump = () => {
            if (!gameOver && jumpCountRef.current < 2) {
                const now = Date.now();
                const timeSinceLastPress = now - lastKeyPressRef.current;
                const currentTime = performance.now();
                const deltaTime = (currentTime - lastFrameTimeRef.current) / 1000;
        
                if (jumpCountRef.current === 0) {
                    // First jump
                    ship.vy = JUMP_PARAMETERS.JUMP_VELOCITY;
                    jumpCountRef.current += 1;
                    lastKeyPressRef.current = now; // Update timestamp
                    const newEvent = { event: 'jump' as const, time: currentTime, frameId: frameCount, data: { x: ship.x, y: ship.y, vy: ship.vy, deltaTime } };
                    telemetryRef.current = telemetryRef.current.length >= TELEMETRY_LIMIT
                        ? [...telemetryRef.current.slice(1), newEvent]
                        : [...telemetryRef.current, newEvent];
                    pendingStatsUpdate = { ...pendingStatsUpdate, jumps: pendingStatsUpdate.jumps + 1 };
                } else if (jumpCountRef.current === 1 && 
                            timeSinceLastPress < JUMP_PARAMETERS.DOUBLE_PRESS_THRESHOLD &&
                            timeSinceLastPress > 50 &&
                            lastKeyPressRef.current !== 0) {
                    // Valid double jump
                    ship.vy = JUMP_PARAMETERS.JUMP_VELOCITY;
                    jumpCountRef.current += 1;
                    lastKeyPressRef.current = now; // Update timestamp
                    const newEvent = { event: 'jump' as const, time: currentTime, frameId: frameCount, data: { x: ship.x, y: ship.y, vy: ship.vy, deltaTime } };
                    telemetryRef.current = telemetryRef.current.length >= TELEMETRY_LIMIT
                        ? [...telemetryRef.current.slice(1), newEvent]
                        : [...telemetryRef.current, newEvent];
                    pendingStatsUpdate = { ...pendingStatsUpdate, jumps: pendingStatsUpdate.jumps + 1 };
                }
                // If neither condition is met, do not update lastKeyPressRef.current
            }
        };

        let inputCount = 0;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                handleJump();
                inputCount++;
            }
        };
        const handleMouseDown = () => {
            handleJump();
            inputCount++;
        };

        if (gameStarted && !gameOver) {
            telemetryRef.current = [];
            setTelemetry([]);
            setStats({
                game: 'jump',
                score: 0,
                shots: 0,
                kills: 0,
                time: 0,
                hitRate: 0,
                jumps: 0,
                obstaclesCleared: 0,
                jumpsPerSec: 0,
                flaps: 0,
                flapsPerSec: 0,
                maxObstacles: 0,
                inputsPerSec: 0,
                canvasWidth: canvasRef.current.width,
                canvasHeight: canvasRef.current.height,
                framesCount: 0,
                shipX: canvasRef.current.width * 0.15,
            });
            pendingStatsUpdate = {
                game: 'jump',
                score: 0,
                shots: 0,
                kills: 0,
                time: 0,
                hitRate: 0,
                jumps: 0,
                obstaclesCleared: 0,
                jumpsPerSec: 0,
                flaps: 0,
                flapsPerSec: 0,
                maxObstacles: 0,
                inputsPerSec: 0,
                canvasWidth: canvasRef.current.width,
                canvasHeight: canvasRef.current.height,
                framesCount: 0,
                shipX: canvasRef.current.width * 0.15,
            };
            ship.y = canvas.height * JUMP_PARAMETERS.GROUND_HEIGHT_RATIO - JUMP_PARAMETERS.SHIP_HEIGHT;
            ship.vy = 0;
            jumpCountRef.current = 0;
            obstaclePool = spawnObstacles(canvas, JUMP_PARAMETERS.BASE_OBSTACLE_SPEED, 0, 0, 0);
            lastSpawnTimeRef.current = performance.now()- 4000;
            startTimeRef.current = performance.now();
            backgroundOffset = 0;
            cloudOffset = 0;

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
    }, [gameStarted, gameOver, imagesLoaded, shipType, enemyType, spawnObstacles, backgroundImage, groundImage]);

    const startGame = useCallback(async () => {
        if (ticketCount > 0 && startGameRef.current) {
            setStartGameStatus('pending');
            await startGameRef.current.startGame();
        } else if (ticketCount < 1) {
            setStartGameStatus('error');
            setStartGameError('Stack 1 CHIP to join the degen GAME, fam!');
        }
    }, [ticketCount]);

    const endGame = useCallback(async () => {
        if (endGameRef.current && gameStarted) {
            // Sync telemetry and update stats.score before ending the game
            setTelemetry(telemetryRef.current); // Update telemetry state
            setIsTelemetrySyncing(true); // Indicate that syncing is in progress
            setEndGameStatus('pending');
        }
    }, [gameStarted]);

    // Add useEffect to detect telemetry update and call endGame
    useEffect(() => {
        if (isTelemetrySyncing && telemetry.length > 0 && endGameRef.current) {
            endGameRef.current.endGame();
            setIsTelemetrySyncing(false); // Reset syncing flag
        }
    }, [telemetry, isTelemetrySyncing]);

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
            setEndGameMessage('WAGMI! You smashed a new TOP SCORE, degen legend!');
            console.log('New leader score:', Math.floor(score));
        } else if (status === 'loser') {
            setEndGameMessage(`No moon yet! TOP SCORE still ${highScore}, keep grinding, degen!`);
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
                onStatusChange={handleStartGameStatusChange}
            />
            <EndGameWrapper
                ref={endGameRef}
                gameId={gameId.toString()}
                score={Math.floor(score).toString()}
                highScore={existingHighScore.toString()}
                onStatusChange={handleEndGameStatusChange}
                telemetry={score >= TELEMETRY_SCORE_THRESHOLD && score > existingHighScore ? telemetry : []}
                stats={score >= TELEMETRY_SCORE_THRESHOLD && score > existingHighScore ? stats : null}
            />
            {!gameStarted ? (
                <div className="text-center text-primary-text font-mono">
                    <h1 className="text-3xl text-accent-yellow mb-4">JUMP</h1>
                    <p className="text-xl mb-2">DEGEN BRIEFING:</p>
                    <p className="mb-2">Smash spacebar or click to make your runner leap over crypto FUD, fam!</p>
                    <p className="mb-2">Double-tap fast for a moon-high jump to clear big obstacles!</p>
                    <p className="mb-4">Crash into crates or clowns, and it’s game over, no WAGMI.</p>
                    <p className="mb-2">CONTROLS, YO:</p>
                    <p className="mb-2">Spacebar: Leap (Double-tap for higher)</p>
                    <p className="mb-4">Mouse Click: Leap (Double-click for higher)</p>
                    <div className="mb-4 flex items-center justify-center">
                        <p className="mr-2">PICK YOUR RUNNER:</p>
                        {imagesLoaded && shipImages[shipType] && (
                            <img src={shipImages[shipType].src} alt={shipType} className="w-10 h-15 mr-2" />
                        )}
                        <select
                            value={shipType}
                            onChange={(e) => setShipType(e.target.value as ShipType)}
                            className="bg-primary-bg text-primary-text border border-primary-border p-1"
                        >
                            <option value="runner">DEGEN DUDE</option>
                            <option value="lady">DEGEN LADY</option>
                            <option value="eth">ETH SPRINTER</option>
                            <option value="base">BASE BOUNCER</option>
                        </select>
                    </div>
                    <div className="mb-4 flex items-center justify-center">
                        <p className="mr-2">CHOOSE YOUR FUD:</p>
                        {imagesLoaded && enemyImages[enemyType] && (
                            <img src={enemyImages[enemyType].src} alt={enemyType} className="w-10 h-10 mr-2" />
                        )}
                        <select
                            value={enemyType}
                            onChange={(e) => setEnemyType(e.target.value as EnemyType)}
                            className="bg-primary-bg text-primary-text border border-primary-border p-1"
                        >
                            <option value="obstacle">FUD CRATES</option>
                            <option value="barrel">FUD BARRELS</option>
                            <option value="bitcoin">BITCOIN BLOCKERS</option>
                            <option value="xrp">XRP TRAPZ</option>
                            <option value="solana">SOLANA SPIKES</option>
                            <option value="gensler">GARY THE CLOWN</option>
                        </select>
                    </div>
                    {address ? (
                        <Button onClick={startGame} disabled={startGameStatus === 'pending' || !imagesLoaded}>
                            {startGameStatus === 'pending' ? '5,4,3,2,1...' : !imagesLoaded ? 'Loading...' : 'HOP IN'}
                        </Button>
                    ) : (
                        <div className="flex items-center justify-center">
                            <LoginButton />
                        </div>
                    )}
                    <p className="mt-2">COST: 1 CHIP</p>
                    {startGameStatus === 'error' && startGameError && (
                        <p className="text-error-red mt-2">{startGameError}</p>
                    )}
                </div>
            ) : (
                <div ref={containerRef} className="w-full max-w-[1008px] h-[80vh] min-h-[400px] min-w-[300px] relative">
                    <div className="text-primary-text mb-1 text-center font-mono">
                        <span className="text-2xl text-accent-yellow">SCORE: {Math.floor(score)}</span>
                        <span className="text-2xl text-accent-yellow ml-8">TOP SCORE: {existingHighScore}</span>
                    </div>
                    {gameOver && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-primary-text text-2xl font-mono">
                            <p>TRIPPED! YOUR SCORE: {Math.floor(score)}</p>
                            {gameOverMessages[endGameStatus]}
                            <Button
                                className="mt-6"
                                onClick={startGame}
                                disabled={startGameStatus === 'pending' || endGameStatus === 'pending' || endGameStatus === 'leader'}
                            >
                                {startGameStatus === 'pending' ? 'jumping in 3,2,1...' : 'TRY AGAIN'}
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
