'use client';
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
  GAME_PRICE_WEI,
} from '../constants';
import { QuantitySelector } from '../../node_modules/@coinbase/onchainkit/esm/internal/components/QuantitySelector';
import { useState } from 'react';

export default function BuyTicketsWrapper({ updateTickets }: { updateTickets: () => void }) {
  const [quantity, setQuantity] = useState<number>(1);

  const data = encodeFunctionData({
    abi: contractABI,
    functionName: 'mintTickets',
  });

  const calls = [
    {
      to: contractAddress as Hex,
      data: data as Hex,
      value: BigInt(GAME_PRICE_WEI * quantity),
    },
  ];

  const handleError = (err: TransactionError) => {
    console.error('Transaction error:', err);
  };

  const handleSuccess = (response: TransactionResponse) => {
    console.log('Transaction successful', response);
    updateTickets();
  };

  return (
    <div className="flex w-[450px]" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <style>
        {`
          .quantity-selector {
            transition: all 0.3s ease;
            background: black !important;
            border: 2px solid #FFFF00 !important;
            color: white !important;
            font-family: 'Courier New', Courier, monospace !important;
          }
          .quantity-selector:hover {
            transform: scale(1.02);
            box-shadow: 0 0 8px rgba(255, 196, 0, 0.94) !important;
          }
          .quantity-selector input {
            background: black !important;
            color: #FFFF00 !important;
            font-weight: bold !important;
            font-family: 'Courier New', Courier, monospace !important;
          }
          .quantity-selector input:focus {
            background: black !important;
            color: #FFFF00 !important;
            outline: none !important;
          }
          .quantity-selector input::placeholder {
            color: white !important;
          }
          .quantity-selector button {
            color: white !important;
            background: black !important;
            border: 1px solid #FFFF00 !important;
            font-family: 'Courier New', Courier, monospace !important;
          }
          .quantity-selector button:hover {
            color: #FFFF00 !important;
            box-shadow: 0 0 8px rgba(255, 255, 0, 0.5) !important;
          }
          .transaction-button {
            transition: all 0.2s ease;
            background: rgba(255, 200, 0, 0.92) !important; /* Darker, duller yellow to match Games page */
            color: white !important;
            border: 2px solid #FFFF00 !important;
            font-family: 'Courier New', Courier, monospace !important;
          }
          .transaction-button:hover {
            background: black !important;
            color: #FFFF00 !important;
            box-shadow: 0 0 8px rgba(255, 255, 0, 0.5) !important;
          }
          .transaction-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            background: rgba(255, 255, 0, 0.5) !important; /* Darker, duller yellow to match Games page */
            color: white !important;
          }
        `}
      </style>
      <div>
        <QuantitySelector
          className="quantity-selector mt-0 mr-auto ml-auto w-[450px] max-w-full"
          onChange={(value: string) => setQuantity(Number(value))}
          minQuantity={1}
          maxQuantity={100}
          placeholder=""
        />
      </div>
      <Transaction
        calls={calls}
        className="w-[450px]"
        chainId={BASE_SEPOLIA_CHAIN_ID}
        onError={handleError}
        onSuccess={handleSuccess}
      >
        <TransactionButton
          className="transaction-button mt-0 mr-auto ml-auto w-[450px] max-w-full"
          text="BUY TICKETS"
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
  );
}
