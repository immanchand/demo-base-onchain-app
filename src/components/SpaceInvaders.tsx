'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import { publicClient, contractABI, contractAddress } from 'src/constants';
import type { Address } from 'viem';

interface GameData {
  gameId: number;
  endTime: bigint;
  highScore: bigint;
  leader: Address;
  pot: bigint;
  potHistory: bigint;
}

const SpaceInvaders: React.FC<{ gameId: number }> = ({ gameId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const { address } = useAccount();
  const router = useRouter();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animationFrameId: number;

    // Game state
    const player = {
      x: canvas.width / 2 - 25,
      y: canvas.height - 60,
      width: 50,
      height: 30,
      speed: 5,
    };

    const bullets: { x: number; y: number }[] = [];
    const invaders: { x: number; y: number; width: number; height: number }[] = [];
    const invaderSpeed = 1;
    let invaderDirection = 1;
    const invaderDropDistance = 40; // Distance invaders drop when hitting edge

    // Initialize invaders
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 8; j++) {
        invaders.push({
          x: 50 + j * 60,
          y: 50 + i * 40,
          width: 40,
          height: 30,
        });
      }
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw player
      ctx.fillStyle = '#FFFF00';
      ctx.fillRect(player.x, player.y, player.width, player.height);

      // Draw bullets
      ctx.fillStyle = '#FFFFFF';
      bullets.forEach((bullet) => {
        ctx.fillRect(bullet.x, bullet.y, 4, 10);
      });

      // Draw invaders
      ctx.fillStyle = '#FF0000';
      invaders.forEach((invader) => {
        ctx.fillRect(invader.x, invader.y, invader.width, invader.height);
      });
    };

    const updateInvaders = () => {
      let edgeReached = false;
      const leftMost = Math.min(...invaders.map((inv) => inv.x));
      const rightMost = Math.max(...invaders.map((inv) => inv.x + inv.width));

      // Check if invaders hit the edge
      if (rightMost >= canvas.width - 10 && invaderDirection === 1) {
        edgeReached = true;
        invaderDirection = -1;
      } else if (leftMost <= 10 && invaderDirection === -1) {
        edgeReached = true;
        invaderDirection = 1;
      }

      // Move invaders
      invaders.forEach((invader) => {
        if (edgeReached) {
          invader.y += invaderDropDistance; // Drop down when edge is reached
        } else {
          invader.x += invaderSpeed * invaderDirection; // Move horizontally
        }
      });
    };

    const update = () => {
      // Move bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].y -= 7;
        if (bullets[i].y < 0) bullets.splice(i, 1);
      }

      // Update invader positions
      updateInvaders();

      // Check collisions
      for (let i = bullets.length - 1; i >= 0; i--) {
        for (let j = invaders.length - 1; j >= 0; j--) {
          if (
            bullets[i].x >= invaders[j].x &&
            bullets[i].x <= invaders[j].x + invaders[j].width &&
            bullets[i].y <= invaders[j].y + invaders[j].height &&
            bullets[i].y >= invaders[j].y
          ) {
            invaders.splice(j, 1);
            bullets.splice(i, 1);
            setScore((prev) => prev + 100);
            break;
          }
        }
      }

      // Check game over
      if (invaders.length === 0 || invaders.some((inv) => inv.y + inv.height >= player.y)) {
        setGameOver(true);
        endGame();
      }
    };

    const gameLoop = () => {
      draw();
      update();
      animationFrameId = requestAnimationFrame(gameLoop);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && player.x > 0) player.x -= player.speed;
      if (e.key === 'ArrowRight' && player.x < canvas.width - player.width) player.x += player.speed;
      if (e.key === ' ') {
        bullets.push({ x: player.x + player.width / 2 - 2, y: player.y });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    gameLoop();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const endGame = async () => {
    try {
      const currentHighScore = (await publicClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'getGame',
        args: [BigInt(gameId)],
      })) as GameData;

      if (score > Number(currentHighScore.highScore)) {
        console.log(`New high score: ${score} for game ${gameId}`);
        // Add gamemaster private key logic here
      }
    } catch (error) {
      console.error('Error ending game:', error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black p-4">
      <h1 className="text-3xl text-yellow-500 mb-4" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
        SPACE INVADERS - SCORE: {score}
      </h1>
      <canvas ref={canvasRef} width={800} height={600} className="border-2 border-[#FFFF00]" />
      {gameOver && (
        <div className="absolute text-white text-2xl" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
          GAME OVER - Press F5 to restart
        </div>
      )}
    </div>
  );
};

export default SpaceInvaders;
