export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const mintContractAddress = '0xA3e40bBe8E8579Cd2619Ef9C6fEA362b760dac9f';
export const shortABI = [
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_player",
                "type": "address"
            }
        ],
        "name": "getTickets",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
  ] as const;
export const mintABI = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'to',
        type: 'address',
      },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'public',
    type: 'function',
  },
] as const;
export const GAME_PRICE_WEI = 100000000000000; 
export const contractAddress = '0x8c8c53e537e1447099e13d9518acaf8004a8c4c9';
export const contractABI = [
  {
    "inputs": [
        {
            "internalType": "address",
            "name": "_gameMaster",
            "type": "address"
        }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
      "anonymous": false,
      "inputs": [
          {
              "indexed": true,
              "internalType": "uint256",
              "name": "gameId",
              "type": "uint256"
          },
          {
              "indexed": false,
              "internalType": "uint256",
              "name": "endTime",
              "type": "uint256"
          }
      ],
      "name": "GameCreate",
      "type": "event"
  },
  {
      "anonymous": false,
      "inputs": [
          {
              "indexed": true,
              "internalType": "address",
              "name": "player",
              "type": "address"
          },
          {
              "indexed": true,
              "internalType": "uint256",
              "name": "gameId",
              "type": "uint256"
          },
          {
              "indexed": false,
              "internalType": "uint256",
              "name": "score",
              "type": "uint256"
          }
      ],
      "name": "GameEnd",
      "type": "event"
  },
  {
      "anonymous": false,
      "inputs": [
          {
              "indexed": true,
              "internalType": "address",
              "name": "player",
              "type": "address"
          },
          {
              "indexed": true,
              "internalType": "uint256",
              "name": "gameId",
              "type": "uint256"
          },
          {
              "indexed": false,
              "internalType": "uint256",
              "name": "score",
              "type": "uint256"
          },
          {
              "indexed": false,
              "internalType": "uint256",
              "name": "endTime",
              "type": "uint256"
          }
      ],
      "name": "GameEndHighScore",
      "type": "event"
  },
  {
      "anonymous": false,
      "inputs": [
          {
              "indexed": true,
              "internalType": "address",
              "name": "player",
              "type": "address"
          },
          {
              "indexed": true,
              "internalType": "uint256",
              "name": "gameId",
              "type": "uint256"
          }
      ],
      "name": "GameStart",
      "type": "event"
  },
  {
      "anonymous": false,
      "inputs": [
          {
              "indexed": true,
              "internalType": "address",
              "name": "player",
              "type": "address"
          },
          {
              "indexed": false,
              "internalType": "uint256",
              "name": "tickets",
              "type": "uint256"
          }
      ],
      "name": "GameTicketsMinted",
      "type": "event"
  },
  {
      "anonymous": false,
      "inputs": [
          {
              "indexed": true,
              "internalType": "address",
              "name": "player",
              "type": "address"
          },
          {
              "indexed": false,
              "internalType": "uint256",
              "name": "winnings",
              "type": "uint256"
          }
      ],
      "name": "GameWinnerWithdraw",
      "type": "event"
  },
  {
      "stateMutability": "payable",
      "type": "fallback"
  },
  {
      "inputs": [],
      "name": "GAME_PRICE_WEI",
      "outputs": [
          {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
          }
      ],
      "stateMutability": "view",
      "type": "function"
  },
  {
      "inputs": [
          {
              "internalType": "uint256",
              "name": "_gameId",
              "type": "uint256"
          },
          {
              "internalType": "address",
              "name": "_player",
              "type": "address"
          }
      ],
      "name": "createGame",
      "outputs": [
          {
              "internalType": "bool",
              "name": "",
              "type": "bool"
          }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
  },
  {
      "inputs": [],
      "name": "devFund",
      "outputs": [
          {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
          }
      ],
      "stateMutability": "view",
      "type": "function"
  },
  {
      "inputs": [],
      "name": "devFundWithdraw",
      "outputs": [
          {
              "internalType": "bool",
              "name": "",
              "type": "bool"
          }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
  },
  {
      "inputs": [
          {
              "internalType": "uint256",
              "name": "_gameId",
              "type": "uint256"
          },
          {
              "internalType": "address",
              "name": "_player",
              "type": "address"
          },
          {
              "internalType": "uint256",
              "name": "_score",
              "type": "uint256"
          }
      ],
      "name": "endGame",
      "outputs": [
          {
              "internalType": "bool",
              "name": "",
              "type": "bool"
          }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
  },
  {
      "inputs": [],
      "name": "getDevFund",
      "outputs": [
          {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
          }
      ],
      "stateMutability": "view",
      "type": "function"
  },
  {
      "inputs": [
          {
              "internalType": "uint256",
              "name": "_gameId",
              "type": "uint256"
          }
      ],
      "name": "getGame",
      "outputs": [
          {
              "components": [
                  {
                      "internalType": "uint256",
                      "name": "endTime",
                      "type": "uint256"
                  },
                  {
                      "internalType": "uint256",
                      "name": "highScore",
                      "type": "uint256"
                  },
                  {
                      "internalType": "address",
                      "name": "leader",
                      "type": "address"
                  },
                  {
                      "internalType": "uint256",
                      "name": "pot",
                      "type": "uint256"
                  }
              ],
              "internalType": "struct ArcadeCasino.Game",
              "name": "",
              "type": "tuple"
          }
      ],
      "stateMutability": "view",
      "type": "function"
  },
  {
      "inputs": [
          {
              "internalType": "address",
              "name": "_player",
              "type": "address"
          }
      ],
      "name": "getTickets",
      "outputs": [
          {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
          }
      ],
      "stateMutability": "view",
      "type": "function"
  },
  {
      "inputs": [],
      "name": "getTickets",
      "outputs": [
          {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
          }
      ],
      "stateMutability": "view",
      "type": "function"
  },
  {
      "inputs": [],
      "name": "mintTickets",
      "outputs": [
          {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
          }
      ],
      "stateMutability": "payable",
      "type": "function"
  },
  {
      "inputs": [
          {
              "internalType": "uint256",
              "name": "_gameId",
              "type": "uint256"
          },
          {
              "internalType": "address",
              "name": "_player",
              "type": "address"
          }
      ],
      "name": "startGame",
      "outputs": [
          {
              "internalType": "bool",
              "name": "",
              "type": "bool"
          }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
  },
  {
      "inputs": [
          {
              "internalType": "uint256",
              "name": "_gameId",
              "type": "uint256"
          }
      ],
      "name": "winnerWithdraw",
      "outputs": [
          {
              "internalType": "bool",
              "name": "",
              "type": "bool"
          }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
  },
  {
      "stateMutability": "payable",
      "type": "receive"
  }
] as const;
