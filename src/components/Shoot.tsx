'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
//import { useTicketContext } from 'src/context/TicketContext';
//import StartGameWrapper from 'src/components/StartGameWrapper';
//import EndGameWrapper from 'src/components/EndGameWrapper';
import Button from './Button';
import { GameStats, Entity, SHOOT_PARAMETERS } from 'src/constants';
import { useAccount } from 'wagmi';
import LoginButton from './LoginButton';

interface ShootProps {
    gameId: number;
    existingHighScore: number;
    updateTickets: () => void;
}

interface Enemy extends Entity {
    dx: number;
    dy: number;
    rotation: number;
    rotationSpeed: number;
    active: boolean;
}

interface Bullet extends Entity {
    dx: number;
    dy: number;
    active: boolean;
}

interface TelemetryEvent {
    event: 'shoot' | 'spawn' | 'kill' | 'collision' | 'frame' | 'fps';
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


type EnemyType = 'alien' | 'bitcoin' | 'xrp' | 'solana' | 'gensler';
type ShipType = 'ship' | 'eth' | 'base';


const Shoot: React.FC<ShootProps> = ({ gameId, existingHighScore, updateTickets }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [gameStarted, setGameStarted] = useState<boolean>(false);
    const [gameOver, setGameOver] = useState<boolean>(false);
    const [score, setScore] = useState<number>(0);
    const [enemyType, setEnemyType] = useState<EnemyType>('alien');
    const [shipType, setShipType] = useState<ShipType>('ship');
    const [imagesLoaded, setImagesLoaded] = useState<boolean>(false);
    const [enemyImages, setEnemyImages] = useState<Record<EnemyType, HTMLImageElement>>({} as Record<EnemyType, HTMLImageElement>);
    const [shipImages, setShipImages] = useState<Record<ShipType, HTMLImageElement>>({} as Record<ShipType, HTMLImageElement>);
    const lastFrameTimeRef = useRef<number>(performance.now());
    const startTimeRef = useRef<number>(0);
    const animationFrameIdRef = useRef<number>(0);
    const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    //const { ticketCount } = useTicketContext();
    const startGameRef = useRef<{ startGame: () => Promise<void> }>(null);
    const endGameRef = useRef<{ endGame: () => Promise<void> }>(null);
    const lastShotTimeRef = useRef<number>(0);
    const [startGameStatus, setStartGameStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
    const [endGameStatus, setEndGameStatus] = useState<'idle' | 'pending' | 'leader' | 'loser' | 'error'>('idle');
    const [startGameError, setStartGameError] = useState<string>('');
    const [endGameError, setEndGameError] = useState<string>('');
    const [endGameMessage, setEndGameMessage] = useState<string>('');
    const { address } = useAccount();
    const [telemetry, setTelemetry] = useState<TelemetryEvent[]>([]);
    const [stats, setStats] = useState<GameStats>({
        game: 'shoot',
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

    // Game logic functions
    const spawnEnemy = useCallback((canvas: HTMLCanvasElement, speedMultiplier: number): Enemy => {
        const edge = Math.floor(Math.random() * 4);
        let x: number, y: number, dx: number, dy: number;

        switch (edge) {
            case 0:
                x = Math.random() * canvas.width;
                y = -SHOOT_PARAMETERS.OBSTACLE_SIZE;
                dx = (Math.random() - 0.5) * SHOOT_PARAMETERS.BASE_OBSTACLE_SPEED * speedMultiplier;
                dy = Math.random() * SHOOT_PARAMETERS.BASE_OBSTACLE_SPEED * speedMultiplier;
                break;
            case 1:
                x = canvas.width + SHOOT_PARAMETERS.OBSTACLE_SIZE;
                y = Math.random() * canvas.height;
                dx = -Math.random() * SHOOT_PARAMETERS.BASE_OBSTACLE_SPEED * speedMultiplier;
                dy = (Math.random() - 0.5) * SHOOT_PARAMETERS.BASE_OBSTACLE_SPEED * speedMultiplier;
                break;
            case 2:
                x = Math.random() * canvas.width;
                y = canvas.height + SHOOT_PARAMETERS.OBSTACLE_SIZE;
                dx = (Math.random() - 0.5) * SHOOT_PARAMETERS.BASE_OBSTACLE_SPEED * speedMultiplier;
                dy = -Math.random() * SHOOT_PARAMETERS.BASE_OBSTACLE_SPEED * speedMultiplier;
                break;
            case 3:
                x = -SHOOT_PARAMETERS.OBSTACLE_SIZE;
                y = Math.random() * canvas.height;
                dx = Math.random() * SHOOT_PARAMETERS.BASE_OBSTACLE_SPEED * speedMultiplier;
                dy = (Math.random() - 0.5) * SHOOT_PARAMETERS.BASE_OBSTACLE_SPEED * speedMultiplier;
                break;
            default:
                x = 0;
                y = 0;
                dx = 0;
                dy = 0;
        }

        setTelemetry((prev) => {
            if (prev.length >= 1000) return [...prev.slice(1), { event: 'spawn', time: performance.now(), data: { x, y, speedMultiplier } }];
            return [...prev, { event: 'spawn', time: performance.now(), data: { x, y, speedMultiplier } }];
        });

        return {
            x,
            y,
            width: SHOOT_PARAMETERS.OBSTACLE_SIZE,
            height: SHOOT_PARAMETERS.OBSTACLE_SIZE,
            dx,
            dy,
            rotation: 0,
            rotationSpeed: (Math.random() - 0.5) * 0.05,
            active: true,
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

    const drawShip = (ctx: CanvasRenderingContext2D, ship: { x: number; y: number; angle: number }) => {
        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(ship.angle);
        const image = shipImages[shipType] || shipImages.ship;
        ctx.drawImage(image, -SHOOT_PARAMETERS.SHIP_WIDTH / 2, -SHOOT_PARAMETERS.SHIP_HEIGHT / 2, SHOOT_PARAMETERS.SHIP_WIDTH, SHOOT_PARAMETERS.SHIP_HEIGHT);
        ctx.restore();
    };

    const drawBullets = (ctx: CanvasRenderingContext2D, bulletPool: Bullet[]) => {
        ctx.fillStyle = '#FFFF00';
        bulletPool.forEach((bullet) => {
            if (bullet.active) {
                ctx.fillRect(bullet.x - SHOOT_PARAMETERS.BULLET_SIZE / 2, bullet.y - SHOOT_PARAMETERS.BULLET_SIZE / 2, SHOOT_PARAMETERS.BULLET_SIZE, SHOOT_PARAMETERS.BULLET_SIZE);
            }
        });
    };

    const drawEnemy = (ctx: CanvasRenderingContext2D, enemyPool: Enemy[]) => {
        enemyPool.forEach((enemy) => {
            if (enemy.active) {
                ctx.save();
                ctx.translate(enemy.x, enemy.y);
                ctx.rotate(enemy.rotation);
                const image = enemyImages[enemyType] || enemyImages.alien;
                ctx.drawImage(image, -SHOOT_PARAMETERS.OBSTACLE_SIZE / 2, -SHOOT_PARAMETERS.OBSTACLE_SIZE / 2, SHOOT_PARAMETERS.OBSTACLE_SIZE, SHOOT_PARAMETERS.OBSTACLE_SIZE);
                ctx.restore();
            }
        });
    };

    const updateShip = useCallback((ship: { x: number; y: number; angle: number; dx: number; dy: number }, deltaTime: number, canvas: HTMLCanvasElement) => {
        const dx = mousePosRef.current.x - ship.x;
        const dy = mousePosRef.current.y - ship.y;
        ship.angle = Math.atan2(dy, dx);

        ship.dx += Math.cos(ship.angle) * 0.1;
        ship.dy += Math.sin(ship.angle) * 0.1;
        ship.dx *= 0.98;
        ship.dy *= 0.98;
        ship.x += ship.dx * deltaTime * 60;
        ship.y += ship.dy * deltaTime * 60;

        if (ship.x < 0) ship.x = canvas.width;
        if (ship.x > canvas.width) ship.x = 0;
        if (ship.y < 0) ship.y = canvas.height;
        if (ship.y > canvas.height) ship.y = 0;
    }, []);

    const updateBullets = (bulletPool: Bullet[], deltaTime: number, canvas: HTMLCanvasElement) => {
        bulletPool.forEach((bullet) => {
            if (bullet.active) {
                bullet.x += bullet.dx * deltaTime * 60;
                bullet.y += bullet.dy * deltaTime * 60;
                if (bullet.x < 0 || bullet.x > canvas.width || bullet.y < 0 || bullet.y > canvas.height) {
                    bullet.active = false;
                }
            }
        });
    };

    const updateEnemy = (enemyPool: Enemy[], deltaTime: number, canvas: HTMLCanvasElement) => {
        enemyPool.forEach((enemy) => {
            if (enemy.active) {
                enemy.x += enemy.dx * deltaTime * 60;
                enemy.y += enemy.dy * deltaTime * 60;
                enemy.rotation += enemy.rotationSpeed * deltaTime * 60;

                if (enemy.x < 0) enemy.x = canvas.width;
                if (enemy.x > canvas.width) enemy.x = 0;
                if (enemy.y < 0) enemy.y = canvas.height;
                if (enemy.y > canvas.height) enemy.y = 0;
            }
        });
    };

    const checkCollisions = useCallback((bulletPool: Bullet[], enemyPool: Enemy[], ship: { x: number; y: number }, speedMultiplier: number, canvas: HTMLCanvasElement) => {
        bulletPool.forEach((bullet) => {
            if (!bullet.active) return;
            enemyPool.forEach((enemy) => {
                if (!enemy.active) return;
                const dx = bullet.x - enemy.x;
                const dy = bullet.y - enemy.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < SHOOT_PARAMETERS.OBSTACLE_SIZE / 2) {
                    bullet.active = false;
                    enemy.active = false;
                    setScore((prev) => prev + SHOOT_PARAMETERS.SCORE_MULTIPLIER);
                    setTelemetry((prev) => {
                        if (prev.length >= 1000) return [...prev.slice(1), { event: 'kill', time: performance.now() }];
                        return [...prev, { event: 'kill', time: performance.now() }];
                    });
                    setStats((prev) => ({
                        ...prev,
                        kills: prev.kills + 1,
                        hitRate: prev.kills / (prev.shots || 1),
                    }));
                    enemyPool.forEach((a) => {
                        if (a.active) {
                            a.dx *= 1.1;
                            a.dy *= 1.1;
                        }
                    });
                    enemyPool.push(spawnEnemy(canvas, speedMultiplier + 0.1));
                }
            });
        });

        enemyPool.forEach((enemy) => {
            if (!enemy.active) return;
            const dx = ship.x - enemy.x;
            const dy = ship.y - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < (SHOOT_PARAMETERS.OBSTACLE_SIZE / 2 + SHOOT_PARAMETERS.SHIP_WIDTH / 2)) {
                setGameOver(true);
                setTelemetry((prev) => {
                    if (prev.length >= 1000) return [...prev.slice(1), { event: 'collision', time: performance.now() }];
                    return [...prev, { event: 'collision', time: performance.now() }];
                });
                cancelAnimationFrame(animationFrameIdRef.current);
            }
        });
    }, [spawnEnemy]);

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
            x: canvas.width / 2,
            y: canvas.height / 2,
            width: SHOOT_PARAMETERS.SHIP_WIDTH,
            height: SHOOT_PARAMETERS.SHIP_HEIGHT,
            angle: 0,
            dx: 0,
            dy: 0,
        };
        let bulletPool: Bullet[] = Array(SHOOT_PARAMETERS.INITIAL_BULLET_COUNT).fill(null).map(() => ({
            x: 0,
            y: 0,
            width: SHOOT_PARAMETERS.BULLET_SIZE,
            height: SHOOT_PARAMETERS.BULLET_SIZE,
            dx: 0,
            dy: 0,
            active: false,
        }));
        let enemyPool: Enemy[] = Array(SHOOT_PARAMETERS.INITIAL_ENEMY_COUNT).fill(null).map(() => spawnEnemy(canvas, 1));
        let enemySpeedMultiplier = 1;
        const stars: { x: number; y: number }[] = [];
        for (let i = 0; i < 100; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
            });
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            drawBackground(ctx, canvas, stars);
            if (!gameOver) {
                drawShip(ctx, ship);
            }
            drawBullets(ctx, bulletPool);
            drawEnemy(ctx, enemyPool);
        };

        const update = (deltaTime: number) => {
            if (gameOver) return;

            updateShip(ship, deltaTime, canvas);
            updateBullets(bulletPool, deltaTime, canvas);
            updateEnemy(enemyPool, deltaTime, canvas);
            checkCollisions(bulletPool, enemyPool, ship, enemySpeedMultiplier, canvas);
            // setStats((prev) => ({
            //     ...prev,
            //     time: performance.now() - startTimeRef.current,
            //     hitRate: prev.kills / (prev.shots || 1),
            // }));
            const elapsedTime = (performance.now() - startTimeRef.current) / 1000;
            const targetEnemyCount = Math.min(
                SHOOT_PARAMETERS.INITIAL_ENEMY_COUNT + Math.floor(elapsedTime / 15),
                SHOOT_PARAMETERS.MAX_ENEMY_COUNT
            );
            const activeEnemies = enemyPool.filter(e => e.active).length;
            if (activeEnemies < targetEnemyCount) {
                enemyPool.push(spawnEnemy(canvas, enemySpeedMultiplier));
            }
        };

        const gameLoop = (time: number) => {
            const deltaTime = (time - lastFrameTimeRef.current) / 1000;
            lastFrameTimeRef.current = time;
            draw();
            update(deltaTime);
            animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        };

        const handleMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            mousePosRef.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            };
        };

        const handleShoot = () => {
            const timeSinceLastShot = performance.now() - lastShotTimeRef.current;
            // Only allow shooting if max frequency has passed
            if (timeSinceLastShot >= SHOOT_PARAMETERS.MAX_SHOOT_FREQUENCY) {
                const inactiveBullet = bulletPool.find((b) => !b.active);
                if (inactiveBullet) {
                    inactiveBullet.x = ship.x + Math.cos(ship.angle) * (SHOOT_PARAMETERS.SHIP_WIDTH / 2);
                    inactiveBullet.y = ship.y + Math.sin(ship.angle) * (SHOOT_PARAMETERS.SHIP_HEIGHT / 2);
                    inactiveBullet.dx = Math.cos(ship.angle) * SHOOT_PARAMETERS.BULLET_SPEED;
                    inactiveBullet.dy = Math.sin(ship.angle) * SHOOT_PARAMETERS.BULLET_SPEED;
                    inactiveBullet.active = true;
                    lastShotTimeRef.current = performance.now(); // Update last shot time
                    // setTelemetry((prev) => {
                    //     if (prev.length >= 1000) return [...prev.slice(1), { event: 'shot', time: performance.now() }];
                    //     return [...prev, { event: 'shot', time: performance.now() }];
                    // });
                    // setStats((prev) => ({ ...prev, shots: prev.shots + 1 }));
                }
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (gameOver) return;
            if (e.code === 'Space') {
                handleShoot();
            }
        };

        const handleMouseDown = () => {
            if (gameOver) return;
            handleShoot();
        };

        if (gameStarted && !gameOver) {
            ship.x = canvas.width / 2;
            ship.y = canvas.height / 2;
            ship.dx = 0;
            ship.dy = 0;
            enemySpeedMultiplier = 1;
            bulletPool.forEach(b => b.active = false);
            enemyPool = Array(SHOOT_PARAMETERS.INITIAL_ENEMY_COUNT).fill(null).map(() => spawnEnemy(canvas, enemySpeedMultiplier));
            startTimeRef.current = performance.now();
            setTelemetry([]);
            setStats({
                game: 'shoot',
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
                scale: 1,
                framesCount: 0,
                shipX: 0,
            });

            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mousedown', handleMouseDown);
            window.addEventListener('keydown', handleKeyDown);
            lastFrameTimeRef.current = performance.now();
            animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        }

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('keydown', handleKeyDown);
            cancelAnimationFrame(animationFrameIdRef.current);
        };
    }, [gameStarted, gameOver, imagesLoaded, shipType, enemyType, spawnEnemy, updateShip, checkCollisions]);

    // const startGame = useCallback(async () => {
    //     if (ticketCount > 0 && startGameRef.current) {
    //         setStartGameStatus('pending');
    //         await startGameRef.current.startGame();
    //     } else if (ticketCount < 1) {
    //         setStartGameStatus('error');
    //         setStartGameError('Stack 1 CHIP to join the degen GAME, fam!');
    //     }
    // }, [ticketCount]);
    const startGame = useCallback(() => {
        setGameStarted(true);
        setGameOver(false);
        setScore(0);
        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        canvasRef.current?.focus();
    }, []);

    // const endGame = useCallback(async () => {
    //     if (endGameRef.current && gameStarted) {
    //         setEndGameStatus('pending');
    //         await endGameRef.current.endGame();
    //     }
    // }, [gameStarted]);

    // const handleStartGameStatusChange = useCallback((status: 'idle' | 'pending' | 'success' | 'error', errorMessage?: string) => {
    //     setStartGameStatus(status);
    //     if (status === 'pending') {
    //         setStartGameError('');
    //     } else if (status === 'success') {
    //         updateTickets();
    //         setGameStarted(true);
    //         setGameOver(false);
    //         setScore(0);
    //         setEndGameStatus('idle');
    //         setEndGameError('');
    //         setEndGameMessage('');
    //         containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    //         canvasRef.current?.focus();
    //     } else if (status === 'error') {
    //         setStartGameError(errorMessage || 'Failed to start game');
    //         setGameStarted(false);
    //     }
    // }, [updateTickets]);

    // const handleEndGameStatusChange = useCallback((status: 'idle' | 'pending' | 'leader' | 'loser' | 'error', errorMessage?: string, highScore?: string) => {
    //     setEndGameStatus(status);
    //     if (status === 'pending') {
    //         setEndGameError('');
    //     } else if (status === 'leader') {
    //         setEndGameMessage('WAGMI! You smashed a new TOP SCORE, degen legend!');
    //         console.log('New leader score:', score);
    //     } else if (status === 'loser') {
    //         setEndGameMessage(`No moon yet! TOP SCORE still ${highScore}, keep grinding, degen!`);
    //         console.log('Game ended, not the leader. Player Score:', score, 'High Score:', highScore);
    //     } else if (status === 'error') {
    //         setEndGameError(errorMessage || 'Failed to end game');
    //     }
    // }, [score]);

    // useEffect(() => {
    //     if (gameOver && gameStarted && endGameStatus === 'idle') {
    //         endGame();
    //     }
    // }, [gameOver, gameStarted, endGameStatus, endGame]);

    const gameOverMessages: Record<string, JSX.Element> = {
        pending: <p>SUBMITTING SCORE...</p>,
        leader: <p>{endGameMessage}</p>,
        loser: <p>{endGameMessage}</p>,
        error: <p className="text-error-red">Error: {endGameError || 'Failed to submit score'}</p>,
        idle: <p></p>,
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-primary-bg p-4">
            {/*<StartGameWrapper
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
                telemetry={score >= 2 ? telemetry : []}
                stats={score >= 2 ? stats : null}
            /> */}
            {!gameStarted ? (
                <div className="text-center text-primary-text font-mono">
                    <h1 className="text-3xl text-accent-yellow mb-4">SHOOT</h1>
                    <p className="text-xl mb-2">DEGEN BRIEFING:</p>
                    <p className="mb-2">Wiggle your mouse to pilot your rocket to the cursor, fam!</p>
                    <p className="mb-2">Smash spacebar or click to blast crypto aliens and stack points!</p>
                    <p className="mb-4">Dodge those aliens or it’s game over, no moon for you.</p>
                    <p className="mb-2">CONTROLS, YO:</p>
                    <p className="mb-2">Mouse Move: Steer Rocket</p>
                    <p className="mb-4">Spacebar or Click: Fire Away</p>
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
                            <option value="eth">ETHEREUM BLASTER</option>
                            <option value="base">BASESHIP-SPACESHIP</option>
                        </select>
                    </div>
                    <div className="mb-4 flex items-center justify-center">
                        <p className="mr-2">CHOOSE YOUR TARGET:</p>
                        {imagesLoaded && enemyImages[enemyType] && (
                            <img src={enemyImages[enemyType].src} alt={enemyType} className="w-10 h-10 mr-2" />
                        )}
                        <select
                            value={enemyType}
                            onChange={(e) => setEnemyType(e.target.value as EnemyType)}
                            className="bg-primary-bg text-primary-text border border-primary-border p-1"
                        >
                            <option value="alien">ALIEN FUD</option>
                            <option value="bitcoin">BTC INVADER</option>
                            <option value="xrp">XRP ZAPPER</option>
                            <option value="solana">SOLANA SWARM</option>
                            <option value="gensler">GARY THE CLOWN</option>
                        </select>
                    </div>
                    {address ? (
                        <Button onClick={startGame} disabled={/*startGameStatus === 'pending' ||*/ !imagesLoaded}>
                            {/*startGameStatus === 'pending' ? 'firing up...' :*/ !imagesLoaded ? 'Loading...' : 'BLAST OFF'}
                        </Button>
                    ) : (
                        <div className="flex items-center justify-center">
                            <LoginButton />
                        </div>
                    )}
                    {/*<p className="mt-2">COST: 1 TICKET</p>
                    {startGameStatus === 'error' && startGameError && (
                        <p className="text-error-red mt-2">{startGameError}</p>
                    )} */}
                    <p className="mt-2">
                        COST: <span className="line-through">1 CHIP</span> - Degen Beta, Free for Now!
                    </p>
                    <p className="mt-2 text-sm text-accent-yellow">
                    Heads-up: Scores don’t count for WINS or ETH yet. Just flex for fun!
                    </p>
                </div>
            ) : (
                <div ref={containerRef} className="w-full max-w-[1008px] h-[80vh] min-h-[400px] min-w-[300px] relative">
                    <div className="text-primary-text mb-1 text-center font-mono">
                        <span className="text-2xl text-accent-yellow">SCORE: {score}</span>
                        <span className="text-2xl text-accent-yellow ml-8">TOP SCORE: {existingHighScore}</span>
                    </div>
                    {gameOver && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-primary-text text-2xl font-mono">
                            <p>CRASHED! YOUR SCORE: {score}</p>
                            <p className="text-sm text-accent-yellow mt-2">
                                    Heads-up: Scores don’t count for WINS or ETH yet. Just flex for fun!
                            </p>
                            {/*gameOverMessages[endGameStatus]*/}
                            <Button
                                className="mt-6"
                                onClick={startGame}
                                disabled={false /*startGameStatus === 'pending' || endGameStatus === 'pending' || endGameStatus === 'leader'*/}
                            >
                                {/*startGameStatus === 'pending' ? 'firing up...' :*/ 'TRY AGAIN'}
                            </Button>
                            {/*startGameStatus === 'error' && startGameError && (
                                <p className="text-error-red mt-2">{startGameError}</p>
                            )*/}
                        </div>
                    )}
                    <canvas ref={canvasRef} className="w-full h-full border-2 border-primary-border" tabIndex={0} />
                </div>
            )}
        </div>
    );
};

export default Shoot;
