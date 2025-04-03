'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTicketContext } from 'src/context/TicketContext';
import StartGameWrapper from 'src/components/StartGameWrapper';
import EndGameWrapper from 'src/components/EndGameWrapper';
import { useAccount } from 'wagmi';
import Button from './Button';

interface AsteroidsProps {
    gameId: number;
    existingHighScore: number;
    updateTickets: () => void;
}

interface Entity {
    x: number;
    y: number;
    width: number;
    height: number;
    active: boolean;
}

interface Asteroid extends Entity {
    dx: number;
    dy: number;
    rotation: number;
    rotationSpeed: number;
}

interface Bullet extends Entity {
    dx: number;
    dy: number;
}

const Asteroids: React.FC<AsteroidsProps> = ({ gameId, existingHighScore, updateTickets }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [gameStarted, setGameStarted] = useState<boolean>(false);
    const [gameOver, setGameOver] = useState<boolean>(false);
    const [score, setScore] = useState<number>(0);
    const [enemyType, setEnemyType] = useState<'asteroid' | 'bitcoin' | 'xrp' | 'solana' | 'gensler'>('asteroid');
    const [shipType, setShipType] = useState<'ship' | 'eth' | 'base'>('ship');
    const [imagesLoaded, setImagesLoaded] = useState<boolean>(false);
    const [enemyImages, setEnemyImages] = useState<Record<string, HTMLImageElement>>({});
    const [shipImages, setShipImages] = useState<Record<string, HTMLImageElement>>({});
    const lastFrameTimeRef = useRef<number>(performance.now());
    const animationFrameIdRef = useRef<number>(0);
    const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const { ticketCount, refreshTickets } = useTicketContext();
    const startGameRef = useRef<{ startGame: () => Promise<void> }>(null);
    const endGameRef = useRef<{ endGame: () => Promise<void> }>(null);
    const [startGameStatus, setStartGameStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
    const [endGameStatus, setEndGameStatus] = useState<'idle' | 'pending' | 'leader' | 'loser' | 'error'>('idle');
    const [startGameError, setStartGameError] = useState<string>('');
    const [endGameError, setEndGameError] = useState<string>('');
    const [endGameMessage, setEndGameMessage] = useState<string>('');
    const { address } = useAccount();

    // Preload images and store references
    useEffect(() => {
        const asteroidImage = new Image();
        const bitcoinImage = new Image();
        const xrpImage = new Image();
        const solanaImage = new Image();
        const genslerImage = new Image();
        const shipImage = new Image();
        const ethImage = new Image();
        const baseImage = new Image();

        asteroidImage.src = '/images/asteroid.webp';
        bitcoinImage.src = '/images/bitcoin.png';
        xrpImage.src = '/images/xrp.png'; // Placeholder until actual image
        solanaImage.src = '/images/solana.png'; // Placeholder until actual image
        genslerImage.src = '/images/gensler.png'; // Placeholder until actual image
        shipImage.src = '/images/spaceship.png';
        ethImage.src = '/images/ethereum.png';
        baseImage.src = '/images/base.png';

        let loadedCount = 0;
        const totalImages = 5; // Corrected to match number of images

        const onImageLoad = () => {
            loadedCount += 1;
            if (loadedCount === totalImages) {
                setEnemyImages({
                    asteroid: asteroidImage,
                    bitcoin: bitcoinImage,
                    xrp: xrpImage,
                    solana: solanaImage,
                    gensler: genslerImage,
                });
                setImagesLoaded(true);
            }
        };

        asteroidImage.onload = onImageLoad;
        bitcoinImage.onload = onImageLoad;
        xrpImage.onload = onImageLoad;
        solanaImage.onload = onImageLoad;
        genslerImage.onload = onImageLoad;
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !imagesLoaded) return;

        const resizeCanvas = () => {
            const { width, height } = container.getBoundingClientRect();
            canvas.width = width;
            canvas.height = height;
            if (!gameStarted && ship) {
                ship.x = width / 2;
                ship.y = height / 2;
            }
        };

        resizeCanvas();
        const resizeObserver = new ResizeObserver(resizeCanvas);
        resizeObserver.observe(container);

        let ship = {
            x: canvas.width / 2,
            y: canvas.height / 2,
            width: 20,
            height: 20,
            angle: 0,
            speed: 0,
            dx: 0,
            dy: 0,
            acceleration: 0.1,
            friction: 0.98,
        };
        let bulletPool: Bullet[] = [];
        let asteroidPool: Asteroid[] = [];
        let asteroidSpeedMultiplier = 1;

        if (gameStarted && !gameOver) {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ship = {
                x: canvas.width / 2,
                y: canvas.height / 2,
                width: 20,
                height: 20,
                angle: 0,
                speed: 0,
                dx: 0,
                dy: 0,
                acceleration: 0.1,
                friction: 0.98,
            };

            bulletPool = Array(10).fill(null).map(() => ({
                x: 0,
                y: 0,
                width: 4,
                height: 4,
                dx: 0,
                dy: 0,
                active: false,
            }));

            asteroidPool = Array(5).fill(null).map(() => ({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                width: 40,
                height: 40,
                dx: (Math.random() - 0.5) * 2 * asteroidSpeedMultiplier,
                dy: (Math.random() - 0.5) * 2 * asteroidSpeedMultiplier,
                rotation: 0,
                rotationSpeed: (Math.random() - 0.5) * 0.05,
                active: true,
            }));

            const spawnAsteroid = () => {
                const edge = Math.floor(Math.random() * 4);
                let x: number, y: number, dx: number, dy: number;

                switch (edge) {
                    case 0: // Top
                        x = Math.random() * canvas.width;
                        y = -40;
                        dx = (Math.random() - 0.5) * 2 * asteroidSpeedMultiplier;
                        dy = Math.random() * 2 * asteroidSpeedMultiplier;
                        break;
                    case 1: // Right
                        x = canvas.width + 40;
                        y = Math.random() * canvas.height;
                        dx = -Math.random() * 2 * asteroidSpeedMultiplier;
                        dy = (Math.random() - 0.5) * 2 * asteroidSpeedMultiplier;
                        break;
                    case 2: // Bottom
                        x = Math.random() * canvas.width;
                        y = canvas.height + 40;
                        dx = (Math.random() - 0.5) * 2 * asteroidSpeedMultiplier;
                        dy = -Math.random() * 2 * asteroidSpeedMultiplier;
                        break;
                    case 3: // Left
                        x = -40;
                        y = Math.random() * canvas.height;
                        dx = Math.random() * 2 * asteroidSpeedMultiplier;
                        dy = (Math.random() - 0.5) * 2 * asteroidSpeedMultiplier;
                        break;
                    default:
                        x = 0;
                        y = 0;
                        dx = 0;
                        dy = 0;
                }

                const newAsteroid: Asteroid = {
                    x,
                    y,
                    width: 40,
                    height: 40,
                    dx,
                    dy,
                    rotation: 0,
                    rotationSpeed: (Math.random() - 0.5) * 0.05,
                    active: true,
                };
                asteroidPool.push(newAsteroid);
            };

            const drawShip = () => {
                ctx.save();
                ctx.translate(ship.x, ship.y);
                ctx.rotate(ship.angle);
                ctx.beginPath();
                ctx.moveTo(10, 0);
                ctx.lineTo(-5, 7);
                ctx.lineTo(-5, -7);
                ctx.closePath();
                ctx.fillStyle = '#FFFFFF';
                ctx.fill();
                ctx.restore();
            };

            const drawBullets = () => {
                ctx.fillStyle = '#FFFF00';
                bulletPool.forEach((bullet) => {
                    if (bullet.active) {
                        ctx.fillRect(bullet.x - bullet.width / 2, bullet.y - bullet.height / 2, bullet.width, bullet.height);
                    }
                });
            };

            const drawAsteroids = () => {
                asteroidPool.forEach((asteroid) => {
                    if (asteroid.active) {
                        ctx.save();
                        ctx.translate(asteroid.x, asteroid.y);
                        ctx.rotate(asteroid.rotation);
                        const image = enemyImages[enemyType] || enemyImages.asteroid; // Fallback to asteroid
                        ctx.drawImage(image, -asteroid.width / 2, -asteroid.height / 2, asteroid.width, asteroid.height);
                        ctx.restore();
                    }
                });
            };

            const updateShip = (deltaTime: number) => {
                const dx = mousePosRef.current.x - ship.x;
                const dy = mousePosRef.current.y - ship.y;
                ship.angle = Math.atan2(dy, dx);

                ship.dx += Math.cos(ship.angle) * ship.acceleration;
                ship.dy += Math.sin(ship.angle) * ship.acceleration;
                ship.dx *= ship.friction;
                ship.dy *= ship.friction;
                ship.x += ship.dx * deltaTime * 60;
                ship.y += ship.dy * deltaTime * 60;

                if (ship.x < 0) ship.x = canvas.width;
                if (ship.x > canvas.width) ship.x = 0;
                if (ship.y < 0) ship.y = canvas.height;
                if (ship.y > canvas.height) ship.y = 0;
            };

            const updateBullets = (deltaTime: number) => {
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

            const updateAsteroids = (deltaTime: number) => {
                asteroidPool.forEach((asteroid) => {
                    if (asteroid.active) {
                        asteroid.x += asteroid.dx * deltaTime * 60;
                        asteroid.y += asteroid.dy * deltaTime * 60;
                        asteroid.rotation += asteroid.rotationSpeed * deltaTime * 60;

                        if (asteroid.x < 0) asteroid.x = canvas.width;
                        if (asteroid.x > canvas.width) asteroid.x = 0;
                        if (asteroid.y < 0) asteroid.y = canvas.height;
                        if (asteroid.y > canvas.height) asteroid.y = 0;
                    }
                });
            };

            const checkCollisions = () => {
                bulletPool.forEach((bullet) => {
                    if (!bullet.active) return;
                    asteroidPool.forEach((asteroid) => {
                        if (!asteroid.active) return;
                        const dx = bullet.x - asteroid.x;
                        const dy = bullet.y - asteroid.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        if (distance < asteroid.width / 2) {
                            bullet.active = false;
                            asteroid.active = false;
                            setScore((prev) => prev + 1000);
                            asteroidSpeedMultiplier += 0.1;
                            asteroidPool.forEach((a) => {
                                if (a.active) {
                                    a.dx *= 1.1;
                                    a.dy *= 1.1;
                                }
                            });
                            spawnAsteroid();
                        }
                    });
                });

                asteroidPool.forEach((asteroid) => {
                    if (!asteroid.active) return;
                    const dx = ship.x - asteroid.x;
                    const dy = ship.y - asteroid.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < (asteroid.width / 2 + ship.width / 2)) {
                        setGameOver(true);
                    }
                });
            };

            const draw = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                drawShip();
                drawBullets();
                drawAsteroids();
            };

            const update = (deltaTime: number) => {
                if (gameOver) return;
                updateShip(deltaTime);
                updateBullets(deltaTime);
                updateAsteroids(deltaTime);
                checkCollisions();
            };

            const gameLoop = (time: number) => {
                if (gameOver) return;
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

            const handleMouseDown = () => {
                if (gameOver) return;
                const inactiveBullet = bulletPool.find((b) => !b.active);
                if (inactiveBullet) {
                    inactiveBullet.x = ship.x + Math.cos(ship.angle) * 10;
                    inactiveBullet.y = ship.y + Math.sin(ship.angle) * 10;
                    inactiveBullet.dx = Math.cos(ship.angle) * 5;
                    inactiveBullet.dy = Math.sin(ship.angle) * 5;
                    inactiveBullet.active = true;
                }
            };

            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mousedown', handleMouseDown);
            lastFrameTimeRef.current = performance.now();
            animationFrameIdRef.current = requestAnimationFrame(gameLoop);

            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mousedown', handleMouseDown);
                cancelAnimationFrame(animationFrameIdRef.current);
            };
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, [gameStarted, gameOver, imagesLoaded]);

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
        setEndGameStatus('idle');
        setEndGameError('');
        if (status === 'pending') {
            setStartGameError('');
        } else if (status === 'success') {
            updateTickets();
            setGameStarted(true);
            setGameOver(false);
            setScore(0);
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
            setEndGameMessage('YOU SET A NEW HIGH SCORE OF '+score+'! YOU ARE NOW THE LEADER!');
            console.log('New leader score:', score);
        } else if (status === 'loser') {
            setEndGameMessage('SORRY, YOU DID NOT BEAT THE HIGH SCORE OF '+highScore+'!');
            console.log('Game ended, not the leader. Player Score:', score, 'High Score:', highScore);
        } else if (status === 'error') {
            setEndGameError(errorMessage || 'Failed to end game');
        }
    }, [score]);

    useEffect(() => {
        if (gameOver && gameStarted && endGameStatus === 'idle') {
            endGame();
        }
    }, [gameOver, gameStarted, endGameStatus, endGame]);

    return (
        <div className="flex flex-col items-center min-h-screen bg-black p-4">
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
                score={score.toString()}
                highScore={existingHighScore.toString()}
                onStatusChange={handleEndGameStatusChange}
            />
            {!gameStarted ? (
                <div className="text-center text-white" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                    <h1 className="text-3xl text-yellow-500 mb-4">ASTEROIDS</h1>
                    <p className="text-xl mb-2">INSTRUCTIONS:</p>
                    <p className="mb-2">Move your mouse to steer the ship towards the pointer.</p>
                    <p className="mb-2">Click to shoot asteroids and score points!</p>
                    <p className="mb-4">Avoid collisions with asteroids or the game ends.</p>
                    <p className="mb-2">CONTROLS:</p>
                    <p className="mb-2">Mouse Move: Steer Ship</p>
                    <p className="mb-4">Mouse Click: Shoot</p>
                    <div className="mb-4 flex items-center justify-center">
                        <p className="mr-2">CHOOSE SPACE SHIP:</p>
                        {imagesLoaded && shipImages[shipType] && (
                            <img
                                src={shipImages[shipType].src}
                                alt={shipType}
                                className="w-10 h-10 mr-2"
                            />
                        )}
                        <select
                            value={shipType}
                            onChange={(e) => setShipType(e.target.value as typeof shipType)}
                            className="bg-black text-white border border-yellow-500 p-1"
                        >
                            <option value="ship">DEFAULT</option>
                            <option value="eth">ETHEREUM</option>
                            <option value="base">BASE</option>
                        </select>
                    </div>
                    <div className="mb-4 flex items-center justify-center">
                        <p className="mr-2">CHOOSE ENEMY:</p>
                        {imagesLoaded && enemyImages[enemyType] && (
                            <img
                                src={enemyImages[enemyType].src}
                                alt={enemyType}
                                className="w-10 h-10 mr-2"
                            />
                        )}
                        <select
                            value={enemyType}
                            onChange={(e) => setEnemyType(e.target.value as typeof enemyType)}
                            className="bg-black text-white border border-yellow-500 p-1"
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
                        <p className="text-red-500 mt-2">{startGameError}</p>
                    )}
                </div>
            ) : (
                <div ref={containerRef} className="w-full max-w-4xl h-[80vh] relative">
                    <div className="text-white mb-1 text-center" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                        <span className="text-2xl text-yellow-500">SCORE: {score}</span>
                        <span className="text-2xl text-yellow-500 ml-8">HIGH SCORE: {existingHighScore}</span>
                    </div>
                    {gameOver && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-2xl" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                            <p>GAME OVER - YOUR SCORE: {score}</p>
                            {endGameStatus === 'pending' && <p>SUBMITTING SCORE...</p>}
                            {endGameStatus === 'leader' && <p>{endGameMessage}</p>}
                            {endGameStatus === 'loser' && <p>{endGameMessage}</p>}
                            {endGameStatus === 'error' && (
                                <p className="text-red-500">Error: {endGameError || 'Failed to submit score'}</p>
                            )}
                            <Button className='mt-6' onClick={startGame} disabled={startGameStatus === 'pending' || endGameStatus === 'pending' || endGameStatus === 'leader'}>
                                {startGameStatus === 'pending' ? 'starting...' : 'PLAY AGAIN'}
                            </Button>
                            {startGameStatus === 'error' && startGameError && (
                                <p className="text-red-500 mt-2">{startGameError}</p>
                            )}
                        </div>
                    )}
                    <canvas ref={canvasRef} className="w-full h-full border-2 border-[#FFFF00]" />
                </div>
            )}
        </div>
    );
};

export default Asteroids;
