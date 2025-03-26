'use client';
import { useAccount } from 'wagmi';
import { encodeFunctionData, Hex } from 'viem';
import { BASE_SEPOLIA_CHAIN_ID, contractABI, contractAddress } from '../constants';
import { useState } from 'react';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

interface CreateGameWrapperProps {
  onSuccess?: (hash: string) => void;
  onError?: (message: string) => void;
}

// Load private key from .env
const gameMasterPrivateKey = process.env.NEXT_PUBLIC_GAME_MASTER_PRIVATE_KEY;
if (!gameMasterPrivateKey) console.error('NEXT_PUBLIC_GAME_MASTER_PRIVATE_KEY is not defined in .env');

const walletClient = gameMasterPrivateKey
  ? createWalletClient({
      chain: baseSepolia,
      transport: http('https://base-sepolia.g.alchemy.com/v2/F7h0CQMEGWf9Ek2PVP77Uhovr7z_nRaP'),
      account: privateKeyToAccount(gameMasterPrivateKey as Hex),
    })
  : null;

export default function CreateGameWrapper({ onSuccess, onError }: CreateGameWrapperProps) {
  const { address } = useAccount();
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const handleCreateGame = async () => {
    if (!address || !walletClient) {
      console.error('Missing required data');
      const message = 'Please connect your wallet to create a game';
      setErrorMessage(message);
      if (onError) onError(message);
      return;
    }

    try {
      setTxStatus('pending');
      setErrorMessage(null);

      const callData = encodeFunctionData({
        abi: contractABI,
        functionName: 'createGame',
        args: [address],
      });

      const hash = await walletClient.sendTransaction({
        to: contractAddress as Hex,
        data: callData,
        value: BigInt(0),
        chainId: BASE_SEPOLIA_CHAIN_ID,
      });

      setTxStatus('success');
      console.log('Game created successfully, tx hash:', hash);
      if (onSuccess) onSuccess(hash);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Transaction error components:', {
          message: error.message,
          stack: error.stack,
          fullError: error,
        });
      } else {
        console.error('Transaction error components:', {
          message: 'Unknown error',
          fullError: error,
        });
      }
      setTxStatus('error');
      const message = parseErrorMessage(error);
      setErrorMessage(message);
      if (onError) onError(message);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-[450px] max-w-full">
      <button
        className={`mt-0 mr-auto ml-auto w-full max-w-full font-bold text-white px-4 py-2 border-2 border-[#FFFF00] ${
          walletClient ? 'bg-yellow-500 hover:bg-black hover:text-yellow-500' : 'bg-gray-400 cursor-not-allowed'
        } transition-all duration-300 ease-in-out`}
        onClick={handleCreateGame}
        disabled={!walletClient || txStatus === 'pending'}
        style={{ fontFamily: "'Courier New', Courier, monospace" }}
      >
        {txStatus === 'pending' ? 'CREATING...' : 'CREATE GAME'}
      </button>
      {txStatus === 'success' && (
        <div className="text-green-500 text-sm" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
          GAME CREATED SUCCESSFULLY!
        </div>
      )}
      {txStatus === 'error' && errorMessage && (
        <div className="text-red-500 text-sm" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
          ERROR: {errorMessage}
        </div>
      )}
    </div>
  );
}
