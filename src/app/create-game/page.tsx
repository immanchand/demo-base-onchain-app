'use client';
import { useAccount } from 'wagmi';
import Navbar from 'src/components/Navbar';
import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusAction,
  TransactionStatusLabel,
  TransactionToast,
  TransactionToastAction,
  TransactionToastIcon,
  TransactionToastLabel,
} from '@coinbase/onchainkit/transaction';
import type { TransactionError, TransactionResponse } from '@coinbase/onchainkit/transaction';
import { encodeFunctionData, Hex } from 'viem';
import {
  BASE_SEPOLIA_CHAIN_ID,
  contractABI,
  contractAddress,
} from '../../constants';
import { useState } from 'react';
import WalletWrapper from '../../components/WalletWrapper';

export default function CreateGame() {
  const { address } = useAccount();
  const [gameId, setGameId] = useState<string>(''); // Store gameId as string for input, convert to number later

  // Encode the function data for createGame
  const data = encodeFunctionData({
    abi: contractABI,
    functionName: 'createGame',
    args: [BigInt(gameId || 0), address || '0x0'], // Default to 0 and 0x0 if not set
  });

  const calls = [
    {
      to: contractAddress as Hex,
      data: data as Hex,
      value: BigInt(0), // Nonpayable function, no ETH required
    },
  ];

  const handleError = (err: TransactionError) => {
    console.error('Transaction error:', err);
  };

  const handleSuccess = (response: TransactionResponse) => {
    console.log('Game created successfully', response);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numeric input
    if (/^\d*$/.test(value)) {
      setGameId(value);
    }
  };

  return (
    <div className="flex h-full w-96 max-w-full flex-col px-1 md:w-[1008px] rounded-xl">
      <Navbar />
      <section className="templateSection flex w-full flex-col items-center justify-center gap-4 rounded-xl bg-gray-100 px-2 py-4 md:grow">
        <h1 className="text-2xl font-bold text-slate-700">Create a New Game</h1>
        {address ? (
          <div className="flex flex-col items-center gap-4 w-[450px] max-w-full">
            <div className="w-full">
              <label htmlFor="gameId" className="block text-sm font-medium text-gray-700">
                Game ID
              </label>
              <input
                type="text"
                id="gameId"
                value={gameId}
                onChange={handleInputChange}
                placeholder="Enter a numeric Game ID"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            <Transaction
              calls={calls}
              className="w-full"
              chainId={BASE_SEPOLIA_CHAIN_ID}
              onError={handleError}
              onSuccess={handleSuccess}
            >
              <TransactionButton
                className="mt-0 mr-auto ml-auto w-full max-w-full text-[white]"
                text="Create Game"
                disabled={!gameId || !address}
              />
              <TransactionStatus>
                <TransactionStatusLabel />
                <TransactionStatusAction />
              </TransactionStatus>
              <TransactionToastAction />
              <TransactionToast>
                <TransactionToastIcon />
                <TransactionToastLabel />
              </TransactionToast>
            </Transaction>
          </div>
        ) : (
          <WalletWrapper
            className="w-[450px] max-w-full"
            text="Log In to Create a Game"
            withWalletAggregator={true}
          />
        )}
      </section>
    </div>
  );
}
