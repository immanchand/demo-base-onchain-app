'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTicketContext } from 'src/context/TicketContext';
import StartGameWrapper from 'src/components/StartGameWrapper';
import EndGameWrapper from 'src/components/EndGameWrapper';
import Button from './Button';
import { GameStats, Entity, scaleBaseW, scaleBaseH, minScale, FLY_PARAMETERS, TELEMETRY_LIMIT, TELEMETRY_SCORE_THRESHOLD } from 'src/constants';
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

interface FlyProps {
    gameId: number;
    existingHighScore: number;
    updateTickets: () => void;
}

interface Obstacle extends Entity {
    dx: number;
    dodged: boolean;
}

interface TelemetryEvent {
    event: 'flap' | 'spawn' | 'collision' | 'frame' | 'fps';
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
        w?: number;
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

type EnemyType = 'alien' | 'bitcoin' | 'xrp' | 'solana' | 'gensler';
type ShipType = 'ship' | 'eth' | 'base';

const FlyGame: React.FC<FlyProps> = ({ gameId, existingHighScore, updateTickets }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [gameStarted, setGameStarted] = useState<boolean>(false);
    const [gameOver, setGameOver] = useState<boolean>(false);
    const [score, setScore] = useState<number>(0);
    const [enemyType, setEnemyType] = useState<EnemyType>('alien');
    const [shipType, setShipType] = useState<ShipType>('ship');
    const [imagesLoaded, setImagesLoaded] = useState<boolean>(false);
    const [isRecaptchaReady, setIsRecaptchaReady] = useState<boolean>(false);
    const [enemyImages, setEnemyImages] = useState<Record<EnemyType, HTMLImageElement>>({} as Record<EnemyType, HTMLImageElement>);
    const [shipImages, setShipImages] = useState<Record<ShipType, HTMLImageElement>>({} as Record<ShipType, HTMLImageElement>);
    const lastFrameTimeRef = useRef<number>(performance.now());
    const animationFrameIdRef = useRef<number>(0);
    const lastSpawnTimeRef = useRef<number>(0);
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
        game: 'fly',
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
        scale: 1,
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
            alien: new Image(),
            bitcoin: new Image(),
            xrp: new Image(),
            solana: new Image(),
            gensler: new Image(),
            ship: new Image(),
            eth: new Image(),
            base: new Image(),
        };
        images.alien.src = '/images/ALIEN.png';
        images.bitcoin.src = '/images/BTC.png';
        images.xrp.src = '/images/XRP.png';
        images.solana.src = '/images/SOLANA.png';
        images.gensler.src = '/images/CLOWN_CIRCLE.png';
        images.ship.src = '/images/SPACEROCKET.png';
        images.eth.src = '/images/ETH_SHOOT.png';
        images.base.src = '/images/BASE_SHOOT.png';

        let loadedCount = 0;
        const totalImages = Object.keys(images).length;

        const onImageLoad = () => {
            loadedCount += 1;
            if (loadedCount === totalImages) {
                setEnemyImages({
                    alien: images.alien,
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
    const spawnObstacle = useCallback((canvas: HTMLCanvasElement, speed: number, frameCount: number, scaledParameters: typeof FLY_PARAMETERS): Obstacle => {
        const obstacleSize = scaledParameters.OBSTACLE_SIZE;
        const y = Math.random() * (canvas.height - obstacleSize);
        const newEvent = { event: 'spawn' as const, time: performance.now(), frameId: frameCount, data: { y, speed, width: obstacleSize, height: obstacleSize } };
        telemetryRef.current = telemetryRef.current.length >= TELEMETRY_LIMIT
            ? [...telemetryRef.current.slice(1), newEvent]
            : [...telemetryRef.current, newEvent];
        return {
            x: canvas.width,
            y,
            width: obstacleSize,
            height: obstacleSize,
            dx: speed,
            dodged: false,
        };
    }, []);

    const drawBackground = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, stars: { x: number; y: number }[]) => {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#FFFFFF';
        stars.forEach(star => {
            ctx.fillRect(star.x, star.y, 2, 2);
        });
    };

    const drawShip = (ctx: CanvasRenderingContext2D, ship: { x: number; y: number }, scaledParameters: typeof FLY_PARAMETERS) => {
        const image = shipImages[shipType] || shipImages.ship;
        ctx.drawImage(image, ship.x, ship.y, scaledParameters.SHIP_WIDTH, scaledParameters.SHIP_HEIGHT);
    };

    const drawObstacles = (ctx: CanvasRenderingContext2D, obstaclePool: Obstacle[], scaledParameters: typeof FLY_PARAMETERS) => {
        obstaclePool.forEach((obstacle) => {
            const image = enemyImages[enemyType] || enemyImages.alien;
            ctx.drawImage(image, obstacle.x, obstacle.y, scaledParameters.OBSTACLE_SIZE, scaledParameters.OBSTACLE_SIZE);
        });
    };

    // Game loop setup and canvas resizing
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !imagesLoaded) return;

        const resizeCanvas = () => {
            const isPortrait = window.innerHeight > window.innerWidth && window.innerWidth <= 640;
            const { width, height } = container.getBoundingClientRect();
            
            if (gameStarted && isPortrait) {
                canvas.width = Math.max(300, Math.min(1008, window.innerHeight));
                canvas.height = Math.max(400, Math.min(900, window.innerWidth));
            } else {
                canvas.width = Math.max(300, Math.min(1008, width));
                canvas.height = Math.max(400, Math.min(900, height));
            }
            setStats((prev) => ({ ...prev, canvasWidth: canvas.width, canvasHeight: canvas.height }));
        };

        resizeCanvas();
        const resizeObserver = new ResizeObserver(resizeCanvas);
        resizeObserver.observe(container);

        // scaling factor for different screen sizes
        const scale = Math.max(canvas.width/scaleBaseW, canvas.height/scaleBaseH, minScale);
        const scaledParameters = {
            ...FLY_PARAMETERS,
            SHIP_WIDTH: FLY_PARAMETERS.SHIP_WIDTH * scale,
            SHIP_HEIGHT: FLY_PARAMETERS.SHIP_HEIGHT * scale,
            OBSTACLE_SIZE: FLY_PARAMETERS.OBSTACLE_SIZE * scale,
            BASE_OBSTACLE_SPEED: FLY_PARAMETERS.BASE_OBSTACLE_SPEED * scale,
            GRAVITY: FLY_PARAMETERS.GRAVITY * scale,
            FLAP_VELOCITY: FLY_PARAMETERS.FLAP_VELOCITY * scale,
            SCORE_MULTIPLIER: FLY_PARAMETERS.SCORE_MULTIPLIER,
            DIFFICULTY_FACTOR_TIME: FLY_PARAMETERS.DIFFICULTY_FACTOR_TIME,
            MAX_SPAWN_INTERVAL: FLY_PARAMETERS.MAX_SPAWN_INTERVAL,
            MIN_SPAWN_INTERVAL: FLY_PARAMETERS.MIN_SPAWN_INTERVAL,
            CLUSTER_CHANCE: FLY_PARAMETERS.CLUSTER_CHANCE,
        };
        
        let ship = {
            x: canvas.width * 0.15,
            y: 0,
            width: scaledParameters.SHIP_WIDTH,
            height: scaledParameters.SHIP_HEIGHT,
            vy: 0,
        };
        
        let obstaclePool: Obstacle[] = [];
        const stars: { x: number; y: number; dx: number }[] = [];
        const starCount = 150 * scale; // Adjust the number of stars based on the scale
        for (let i = 0; i < starCount; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                dx: -0.5 * scale,
            });
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            drawBackground(ctx, canvas, stars);
            if (!gameOver) {
                drawShip(ctx, ship, scaledParameters);
            }
            drawObstacles(ctx, obstaclePool, scaledParameters);
        };

        let frameCount = 0;
        let pendingStatsUpdate = { ...stats };
        let frameTimes: number[] = [];
        let maxObstacles = 0;                                      
        const update = (deltaTime: number) => {
            const elapsedTime = (performance.now() - startTimeRef.current) / 1000;
            const difficultyFactor = Math.min(elapsedTime / scaledParameters.DIFFICULTY_FACTOR_TIME, 1);
            const spawnInterval = scaledParameters.MAX_SPAWN_INTERVAL * (1 - difficultyFactor) + scaledParameters.MIN_SPAWN_INTERVAL;
            const obstacleSpeed = scaledParameters.BASE_OBSTACLE_SPEED * (1 + difficultyFactor);
            const clusterChance = difficultyFactor * scaledParameters.CLUSTER_CHANCE;
            const obstacleSize = scaledParameters.OBSTACLE_SIZE;

            if (!gameOver) {
                ship.vy += scaledParameters.GRAVITY;
                ship.y += ship.vy;
                if (ship.y > canvas.height - scaledParameters.SHIP_HEIGHT || ship.y <= 0) {
                    setGameOver(true);
                    const newEvent = { event: 'collision' as const, time: performance.now() };
                    telemetryRef.current = telemetryRef.current.length >= TELEMETRY_LIMIT
                        ? [...telemetryRef.current.slice(1), newEvent]
                        : [...telemetryRef.current, newEvent];
                }
                setScore((prev) => prev + deltaTime * scaledParameters.SCORE_MULTIPLIER);
                frameCount++;
                if (frameCount % 10 === 0) {
                    const newEvent: TelemetryEvent = {
                        event: 'frame',
                        time: performance.now(),
                        frameId: frameCount,
                        data: { deltaTime: deltaTime * 10, difficulty: difficultyFactor, score, x: ship.x, y: ship.y, vy: ship.vy, width: ship.width, height: ship.height},
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
                        parameters: { ...scaledParameters }, // Snapshot of all constants
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
                    flapsPerSec: pendingStatsUpdate.flaps / (pendingStatsUpdate.time / 1000 || 1),
                    maxObstacles: maxObstacles,
                    inputsPerSec: inputCount / (pendingStatsUpdate.time / 1000 || 1),
                    framesCount: frameCount
                };
            }

            stars.forEach(star => {
                star.x += star.dx * deltaTime * 60;
                if (star.x < 0) {
                    star.x = canvas.width;
                    star.y = Math.random() * canvas.height;
                }
            });

            obstaclePool.forEach((obstacle) => {
                obstacle.x += obstacle.dx;
                if (obstacle.x + obstacleSize < ship.x && !obstacle.dodged) {
                    pendingStatsUpdate = { ...pendingStatsUpdate, obstaclesCleared: pendingStatsUpdate.obstaclesCleared + 1 };
                    obstacle.dodged = true;
                }                                                             
            });
            obstaclePool = obstaclePool.filter((obstacle) => obstacle.x + obstacleSize > 0);

            const currentTime = performance.now();
            if (currentTime - lastSpawnTimeRef.current >= spawnInterval && !gameOver) {
                const numObstacles = Math.random() < clusterChance ? 2 : 1;
                for (let i = 0; i < numObstacles; i++) {
                    const obstacle = spawnObstacle(canvas, obstacleSpeed, frameCount, scaledParameters);
                    obstaclePool.push(obstacle);
                }
                lastSpawnTimeRef.current = currentTime;
            }

            if (!gameOver) {
                obstaclePool.forEach((obstacle) => {
                    const dx = ship.x + scaledParameters.SHIP_WIDTH / 2 - (obstacle.x + obstacleSize / 2);
                    const dy = ship.y + scaledParameters.SHIP_HEIGHT / 2 - (obstacle.y + obstacleSize / 2);
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < (scaledParameters.SHIP_WIDTH + obstacleSize) / 2) {
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

        const handleFlap = () => {
            if (!gameOver) {
                ship.vy = scaledParameters.FLAP_VELOCITY;
                const currentTime = performance.now();
                const deltaTime = (currentTime - lastFrameTimeRef.current) / 1000;
                const newEvent = { event: 'flap' as const, time: currentTime, frameId: frameCount, data: { x: ship.x, y: ship.y, vy: ship.vy, deltaTime } };
                telemetryRef.current = telemetryRef.current.length >= TELEMETRY_LIMIT
                    ? [...telemetryRef.current.slice(1), newEvent]
                    : [...telemetryRef.current, newEvent];
                pendingStatsUpdate = { ...pendingStatsUpdate, flaps: pendingStatsUpdate.flaps + 1 };
            }
        };
        let inputCount = 0;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                handleFlap();
                inputCount++;
            }
        };

        const handleMouseDown = (e: MouseEvent | TouchEvent) => {
            handleFlap();
            inputCount++;
        };

        if (gameStarted && !gameOver) {
            telemetryRef.current = [];
            setTelemetry([]);
            setStats({
                game: 'fly',
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
                scale: scale,
                framesCount: 0,
                shipX: canvasRef.current.width * 0.15,
            });
            pendingStatsUpdate = {
                game: 'fly',
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
                scale: scale,
                framesCount: 0,
                shipX: canvasRef.current.width * 0.15,
            };
            obstaclePool = [spawnObstacle(canvas, scaledParameters.BASE_OBSTACLE_SPEED, 0, scaledParameters)];
            lastSpawnTimeRef.current = performance.now();
            startTimeRef.current = performance.now();

            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('mousedown', handleMouseDown);
            window.addEventListener('touchstart', handleMouseDown, { passive: true });
            lastFrameTimeRef.current = performance.now();
            animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        }

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('touchstart', handleMouseDown);
            cancelAnimationFrame(animationFrameIdRef.current);
        };
    }, [gameStarted, gameOver, imagesLoaded, shipType, enemyType, spawnObstacle]);

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
            setTelemetry(telemetryRef.current);
            setIsTelemetrySyncing(true);
            setEndGameStatus('pending');
        }
    }, [gameStarted]);

    useEffect(() => {
        if (isTelemetrySyncing && telemetry.length > 0 && endGameRef.current) {
            endGameRef.current.endGame();
            setIsTelemetrySyncing(false);
        }
    }, [telemetry, isTelemetrySyncing]);

    const handleStartGameStatusChange = useCallback(
        (status: 'idle' | 'pending' | 'success' | 'error', errorMessage?: string) => {
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
        },
        [updateTickets]
    );

    const handleEndGameStatusChange = useCallback(
        (status: 'idle' | 'pending' | 'leader' | 'loser' | 'error', errorMessage?: string, highScore?: string) => {
            setEndGameStatus(status);
            if (status === 'pending') {
                setEndGameError('');
            } else if (status === 'leader') {
                setEndGameMessage('WAGMI! You smashed a new TOP SCORE, degen legend!');
                console.log('New leader score:', Math.floor(score));
            } else if (status == 'loser') {
                setEndGameMessage(`No moon yet! TOP SCORE still ${highScore}, keep grinding, degen!`);
                console.log('Game ended, not the leader. Player Score:', Math.floor(score), 'High Score:', highScore);
            } else if (status === 'error') {
                setEndGameError(errorMessage || 'Failed to end game');
            }
        },
        [score]
    );

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
                <div className="game-instructions text-center text-primary-text font-mono">
                    <h1 className="text-3xl text-accent-yellow mb-4">FLY</h1>
                    <p className="text-xl mb-2">DEGEN BRIEFING:</p>
                    <p className="mb-2">Tap spacebar or click to flap your rocket through crypto FUD, fam!</p>
                    <p className="mb-4">Dodge aliens and don’t crash into the ground or sky, or no moon for you!</p>
                    <p className="mb-2">CONTROLS, YO:</p>
                    <p className="mb-4">Spacebar or Click: Flap Up</p>
                    <div className="mb-4 flex items-center justify-center">
                        <p className="mr-2">PICK YOUR ROCKET:</p>
                        {imagesLoaded && shipImages[shipType] && (
                            <img src={shipImages[shipType].src} alt={shipType} className="w-15 h-10 mr-2" />
                        )}
                        <select
                            value={shipType}
                            onChange={(e) => setShipType(e.target.value as ShipType)}
                            className="bg-primary-bg text-primary-text border border-primary-border p-1"
                        >
                            <option value="ship">DEGEN ROCKET</option>
                            <option value="eth">ETH BLASTER</option>
                            <option value="base">BASESHIP-SPACESHIP</option>
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
                            <option value="alien">ALIEN FUD</option>
                            <option value="bitcoin">BITBLOCKER</option>
                            <option value="xrp">XRP ZAPPER</option>
                            <option value="solana">SOLANA SWARM</option>
                            <option value="gensler">GARY THE CLOWN</option>
                        </select>
                    </div>
                    {address ? (
                        <Button
                            onClick={startGame}
                            disabled={startGameStatus === 'pending' || !imagesLoaded || !isRecaptchaReady}
                        >
                            {startGameStatus === 'pending'
                                ? 'launching...'
                                : !imagesLoaded || !isRecaptchaReady
                                ? 'Loading...'
                                : 'SOAR NOW'}
                        </Button>
                    ) : (
                        <div className="flex items-center justify-center">
                            <LoginButton />
                        </div>
                    )}
                    <p className="mt-2">COST: 1 CHIPS</p>
                    {startGameStatus === 'error' && startGameError && (
                        <p className="text-error-red mt-2">
                            {startGameError}</p>
                    )}
                </div>
            ) : (
                <div ref={containerRef} className={`game-active w-full max-w-[1008px] min-w-[300px] h-[80vh] max-h-[900px] min-h-[400px] relative`}>
                    <div className="md:relative absolute top-2 left-0 w-full text-primary-text text-center font-mono z-10 md:mb-1">
                        <span className="text-2xl text-accent-yellow">SCORE: {Math.floor(score)}</span>
                        <span className="text-2xl text-accent-yellow ml-8">TOP SCORE: {existingHighScore}</span>
                    </div>
                    {gameOver && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-primary-text text-2xl font-mono z-20">
                            <p>SMASHED! YOUR SCORE: {Math.floor(score)}</p>
                            {gameOverMessages[endGameStatus]}
                            <Button
                                className="mt-6"
                                onClick={startGame}
                                disabled={startGameStatus === 'pending' || endGameStatus === 'pending' || endGameStatus === 'leader' || !isRecaptchaReady}
                            >
                                {startGameStatus === 'pending' ? 'launching...' : 'TRY AGAIN'}
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

export default FlyGame;
