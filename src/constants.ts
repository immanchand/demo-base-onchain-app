import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const message = 'Please sign this message to approve paying tickets to start the game session. This is not a transaction and there is no fee. It is only used to verify your identity and protect your own tickts.';
export const TELEMETRY_LIMIT = 20000; // Max telemetry data points
export const TELEMETRY_SCORE_THRESHOLD = 2000; // Min score for telemetry data to be 20000 in prod
// Scoring multipliers
export const SCORE_DIVISOR_TIME = 10; // should be SCORE_MULTIPLIER/10
export const SCORE_MULTIPLIER_SHOOT = 5; // Points per kill for Shoot
// Difficulty parameters
export const FLY_PARAMETERS = {
  SHIP_WIDTH: 40,
  SHIP_HEIGHT: 40 * (3/4),
  OBSTACLE_SIZE: 50,
  BASE_OBSTACLE_SPEED: -4, // Higher (e.g., -4) = faster obstacles, harder; Lower (e.g., -2) = easier
  MIN_SPAWN_INTERVAL: 200, // ms Lower (e.g., 200) = more frequent obstacles, harder; Higher (e.g., 500) = easier
  MAX_SPAWN_INTERVAL: 1000, // ms starting frequency of obstacles
  GRAVITY: 0.2, // Higher (e.g., 0.3) = faster fall, harder; Lower (e.g., 0.1) = easier
  FLAP_VELOCITY: -5, // Higher (e.g., -6) = stronger flaps, easier; Lower (e.g., -4) = harder
  SCORE_MULTIPLIER: 100,
  DIFFICULTY_FACTOR_TIME: 90, // 90 seconds till max difficulty
  CLUSTER_CHANCE: 0.5,
};
export const JUMP_PARAMETERS = {
  SHIP_WIDTH: 40 * (3/4),
  SHIP_HEIGHT: 50,
  OBSTACLE_SIZE: 50,
  BASE_OBSTACLE_SPEED: -3, // Higher (e.g., -5) = faster obstacles, harder; Lower (e.g., -2) = easier
  MIN_SPAWN_INTERVAL: 300, // px Lower (e.g., 200) = tighter gaps, harder; Higher (e.g., 400) = easier
  MAX_SPAWN_INTERVAL: 1000, // px starting frequency of obstacles in ms
  GRAVITY: 0.4, // Higher (e.g., 0.5) = faster fall, harder; Lower (e.g., 0.3) = easier
  JUMP_VELOCITY: -12, // Higher (e.g., -14) = higher jumps, easier; Lower (e.g., -10) = harder
  SCORE_MULTIPLIER: 100,
  DIFFICULTY_FACTOR_TIME: 90, //seonds till max difficulty
  DOUBLE_PRESS_THRESHOLD: 300, // ms for double jump
  GROUND_HEIGHT_RATIO: 0.8,
  CLUSTER_CHANCE: 0.8,
};
export const SHOOT_PARAMETERS = {
  SHIP_WIDTH: 30,
  SHIP_HEIGHT: 30 * (3/4),
  BASE_OBSTACLE_SPEED: 2, // Higher (e.g., 3) = faster enemies, harder; Lower (e.g., 1) = easier
  MAX_ENEMY_COUNT: 10, // Higher (e.g., 15) = more enemies, harder; Lower (e.g., 5) = easier
  MIN_SPAWN_INTERVAL: 1000, // Lower (e.g., 500) = faster spawns, harder; Higher (e.g., 1500) = easier
  BULLET_SPEED: 5, // Higher (e.g., 6) = faster bullets, easier; Lower (e.g., 4) = harder
  SCORE_MULTIPLIER: 100, 
  DIFFICULTY_FACTOR_TIME: 90, //seonds till max difficulty
};
export const GAME_COUNT = 3;
export const GAME_PRICE_WEI = 100000000000000; 
export const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(),
      });
export const gameMasterAddress = '0xcfd97f78e1c225b4569edbafb950026247f67faf';
export const CONTRACT_ADDRESS = '0x40200F717BfDEceF133C3E9C49ae007Fd15C9586';
export const contractABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_gameMaster",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "fallback",
    "stateMutability": "payable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "GAME_PRICE_WEI",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "createGame",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "devFund",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "devFundWithdraw",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "endGame",
    "inputs": [
      {
        "name": "_gameId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_player",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_score",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getDevFund",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getGame",
    "inputs": [
      {
        "name": "_gameId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct ArcadeCasino.Game",
        "components": [
          {
            "name": "endTime",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "highScore",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "leader",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "pot",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "potHistory",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getLatestGameId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTickets",
    "inputs": [
      {
        "name": "_player",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTickets",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "latestGameId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "mintTickets",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "startGame",
    "inputs": [
      {
        "name": "_gameId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_player",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "winnerWithdraw",
    "inputs": [
      {
        "name": "_gameId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "GameCreate",
    "inputs": [
      {
        "name": "gameId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "endTime",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "GameEnd",
    "inputs": [
      {
        "name": "player",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "gameId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "score",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "GameEndHighScore",
    "inputs": [
      {
        "name": "player",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "gameId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "score",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "endTime",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "GameStart",
    "inputs": [
      {
        "name": "player",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "gameId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "GameTicketsMinted",
    "inputs": [
      {
        "name": "player",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tickets",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "GameWinnerWithdraw",
    "inputs": [
      {
        "name": "player",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "winnings",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  }
] as const;
export interface GameStats {
  game: string;
  score: number;
  shots: number;
  kills: number;
  time: number;
  hitRate: number;
  jumps: number;
  obstaclesCleared: number;
  jumpsPerSec: number;
  flaps: number;
  flapsPerSec: number;
  maxObstacles: number;
  inputsPerSec: number;
  canvasWidth: number;
  canvasHeight: number;
  framesCount: number;
  shipX: number,
};
export interface Entity {
  x: number;
  y: number;
  width: number;
  height: number;
};
