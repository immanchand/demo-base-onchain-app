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

interface BuyTicketsWrapperProps {
  updateTickets: () => void;
}

export default function BuyTicketsWrapper({ updateTickets }: BuyTicketsWrapperProps) {
  const [quantity, setQuantity] = useState(1);

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

  return (
    <div className="flex flex-col gap-4 w-[450px] max-w-full">
      <QuantitySelector
        className="quantity-selector mt-0 mx-auto"
        onChange={(value) => setQuantity(Number(value))}
        minQuantity={1}
        maxQuantity={100}
        placeholder=""
      />
      <Transaction
        calls={calls}
        chainId={BASE_SEPOLIA_CHAIN_ID}
        onError={(err) => console.error('Transaction error:', err)}
        onSuccess={(response) => { console.log('Transaction successful', response); updateTickets(); }}
      >
        <TransactionButton className="btn-login" text="BUY TICKETS" />
        <TransactionStatus>
          <TransactionStatusLabel />
          <TransactionStatusAction />
        </TransactionStatus>
        <TransactionToast>
          <TransactionToastIcon />
          <TransactionToastLabel />
        </TransactionToast>
        <TransactionToastAction />
      </Transaction>
    </div>
  );
}
