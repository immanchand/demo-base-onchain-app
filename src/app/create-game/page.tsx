'use client';
import { useAccount } from 'wagmi';
import Navbar from 'src/components/Navbar';
import { Address, encodeFunctionData, Hex } from 'viem';
import { BASE_SEPOLIA_CHAIN_ID, contractABI, contractAddress } from '../../constants';
import { useState } from 'react';
import WalletWrapper from '../../components/WalletWrapper';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

// Load private key from .env
const gameMasterPrivateKey = process.env.NEXT_PUBLIC_GAME_MASTER_PRIVATE_KEY;
if (!gameMasterPrivateKey) console.error('NEXT_PUBLIC_GAME_MASTER_PRIVATE_KEY is not defined in .env');

const walletClient = gameMasterPrivateKey
  ? createWalletClient({
      chain: baseSepolia,
      transport: http(),
      account: privateKeyToAccount(gameMasterPrivateKey as Hex),
    })
  : null;

export default function TestGameFunctions() {
  const { address } = useAccount();
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [startGameId, setStartGameId] = useState<string>('');
  const [startPlayer, setStartPlayer] = useState<string>('');
  const [endGameId, setEndGameId] = useState<string>('');
  const [endPlayer, setEndPlayer] = useState<string>('');
  const [endScore, setEndScore] = useState<string>('');

  const parseErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
      const fullMessage = error.message;
      console.log('Full error message:', fullMessage);
      const detailsIndex = fullMessage.indexOf('Details:');
      if (detailsIndex !== -1) {
        const detailsStart = detailsIndex + 'Details:'.length;
        const nextNewline = fullMessage.indexOf('\n', detailsStart);
        const detailsEnd = nextNewline !== -1 ? nextNewline : fullMessage.length;
        return fullMessage.slice(detailsStart, detailsEnd).trim();
      }
      return fullMessage.split('\n')[0] || 'An unknown error occurred';
    }
    return 'An unknown error occurred';
  };

  const handleStartGame = async () => {
    if (!address || !walletClient || !startGameId || !startPlayer) {
      console.error('Missing required data');
      setErrorMessage('Please fill in Game ID and Player Address');
      return;
    }

    try {
      setTxStatus('pending');
      setErrorMessage(null);

      const callData = encodeFunctionData({
        abi: contractABI,
        functionName: 'startGame',
        args: [BigInt(startGameId), startPlayer as Address],
      });

      const hash = await walletClient.sendTransaction({
        to: contractAddress as Hex,
        data: callData,
        value: BigInt(0),
        chainId: BASE_SEPOLIA_CHAIN_ID,
      });

      setTxStatus('success');
      console.log('Game started successfully, tx hash:', hash);
    } catch (error) {
      console.error('Start game error:', error);
      setTxStatus('error');
      setErrorMessage(parseErrorMessage(error));
    }
  };

  const handleEndGame = async () => {
    if (!address || !walletClient || !endGameId || !endPlayer || !endScore) {
      console.error('Missing required data');
      setErrorMessage('Please fill in Game ID, Player Address, and Score');
      return;
    }

    try {
      setTxStatus('pending');
      setErrorMessage(null);

      const callData = encodeFunctionData({
        abi: contractABI,
        functionName: 'endGame',
        args: [BigInt(endGameId), endPlayer as Address, BigInt(endScore)],
      });

      const hash = await walletClient.sendTransaction({
        to: contractAddress as Hex,
        data: callData,
        value: BigInt(0),
        chainId: BASE_SEPOLIA_CHAIN_ID,
      });

      setTxStatus('success');
      console.log('Game ended successfully, tx hash:', hash);
    } catch (error) {
      console.error('End game error:', error);
      setTxStatus('error');
      setErrorMessage(parseErrorMessage(error));
    }
  };

  return (
    <div className="flex h-full w-96 max-w-full flex-col px-1 md:w-[1008px] rounded-xl">
      <Navbar />
      <section className="templateSection flex w-full flex-col items-center justify-center gap-4 rounded-xl bg-gray-100 px-2 py-4 md:grow">
        <h1 className="text-2xl font-bold text-slate-700">Test Game Functions</h1>
        {address ? (
          <div className="flex flex-col items-center gap-6 w-[450px] max-w-full">
            {/* Start Game Form */}
            <div className="w-full">
              <h2 className="text-lg font-semibold text-slate-600 mb-2">Start Game</h2>
              <div className="flex flex-col gap-2">
                <input
                  type="number"
                  placeholder="Game ID"
                  value={startGameId}
                  onChange={(e) => setStartGameId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-black"
                />
                <input
                  type="text"
                  placeholder="Player Address"
                  value={startPlayer}
                  onChange={(e) => setStartPlayer(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-black"
                />
                <button
                  className={`w-full text-white rounded-md px-4 py-2 ${
                    walletClient && startGameId && startPlayer
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gray-400 cursor-not-allowed'
                  }`}
                  onClick={handleStartGame}
                  disabled={!walletClient || !startGameId || !startPlayer || txStatus === 'pending'}
                >
                  {txStatus === 'pending' ? 'Starting...' : 'Start Game'}
                </button>
              </div>
            </div>

            {/* End Game Form */}
            <div className="w-full">
              <h2 className="text-lg font-semibold text-slate-600 mb-2">End Game</h2>
              <div className="flex flex-col gap-2">
                <input
                  type="number"
                  placeholder="Game ID"
                  value={endGameId}
                  onChange={(e) => setEndGameId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-black"
                />
                <input
                  type="text"
                  placeholder="Player Address"
                  value={endPlayer}
                  onChange={(e) => setEndPlayer(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-black"
                />
                <input
                  type="number"
                  placeholder="Score"
                  value={endScore}
                  onChange={(e) => setEndScore(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-black"
                />
                <button
                  className={`w-full text-white rounded-md px-4 py-2 ${
                    walletClient && endGameId && endPlayer && endScore
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gray-400 cursor-not-allowed'
                  }`}
                  onClick={handleEndGame}
                  disabled={!walletClient || !endGameId || !endPlayer || !endScore || txStatus === 'pending'}
                >
                  {txStatus === 'pending' ? 'Ending...' : 'End Game'}
                </button>
              </div>
            </div>

            {/* Transaction Feedback */}
            {txStatus === 'success' && (
              <div className="text-green-600 text-sm">Action completed successfully!</div>
            )}
            {txStatus === 'error' && errorMessage && (
              <div className="text-red-600 text-sm">Error: {errorMessage}</div>
            )}
          </div>
        ) : (
          <WalletWrapper
            className="w-[450px] max-w-full"
            text="Log In to Test Game Functions"
            withWalletAggregator={true}
          />
        )}
      </section>
    </div>
  );
}
