'use client';
import { useAccount } from 'wagmi';
import Navbar from 'src/components/Navbar';
import { Address } from 'viem';
import { useState, useRef } from 'react';
import WalletWrapper from '../../components/WalletWrapper';
import StartGameWrapper from '../../components/StartGameWrapper';
import EndGameWrapper from '../../components/EndGameWrapper';

export default function TestGameFunctions() {
  const { address } = useAccount();
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [startGameId, setStartGameId] = useState<string>('');
  const [startPlayer, setStartPlayer] = useState<string>('');
  const [endGameId, setEndGameId] = useState<string>('');
  const [endPlayer, setEndPlayer] = useState<string>('');
  const [endScore, setEndScore] = useState<string>('');

  const startGameRef = useRef<{ startGame: () => Promise<void> }>(null);
  const endGameRef = useRef<{ endGame: () => Promise<void> }>(null);

  const handleStatusChange = (status: 'idle' | 'pending' | 'success' | 'error', errorMessage?: string) => {
    setTxStatus(status);
    setErrorMessage(errorMessage || null);
  };

  const handleStartGame = async () => {
    if (startGameRef.current) {
      await startGameRef.current.startGame();
    }
  };

  const handleEndGame = async () => {
    if (endGameRef.current) {
      await endGameRef.current.endGame();
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
                    startGameId && startPlayer ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'
                  }`}
                  onClick={handleStartGame}
                  disabled={!startGameId || !startPlayer || txStatus === 'pending'}
                >
                  {txStatus === 'pending' ? 'Starting...' : 'Start Game'}
                </button>
                <StartGameWrapper
                  ref={startGameRef}
                  gameId={startGameId}
                  playerAddress={startPlayer}
                  onStatusChange={handleStatusChange}
                />
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
                    endGameId && endPlayer && endScore
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gray-400 cursor-not-allowed'
                  }`}
                  onClick={handleEndGame}
                  disabled={!endGameId || !endPlayer || !endScore || txStatus === 'pending'}
                >
                  {txStatus === 'pending' ? 'Ending...' : 'End Game'}
                </button>
                <EndGameWrapper
                  ref={endGameRef}
                  gameId={endGameId}
                  playerAddress={endPlayer}
                  score={endScore}
                  onStatusChange={handleStatusChange}
                />
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
