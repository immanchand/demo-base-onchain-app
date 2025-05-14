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
import { encodeFunctionData, formatEther, Hex } from 'viem';
import {
  BASE_SEPOLIA_CHAIN_ID,
  contractABI,
  CONTRACT_ADDRESS,
  GAME_PRICE_WEI,
} from '../constants';
import { QuantitySelector } from '../../node_modules/@coinbase/onchainkit/esm/internal/components/QuantitySelector';
import { useState } from 'react';

interface BuyTicketsWrapperProps {
  updateTickets: () => void;
}

const ethPrice = Number(process.env.ETH_PRICE) || 2000;

export default function BuyTicketsWrapper({ updateTickets }: BuyTicketsWrapperProps) {
  const [quantity, setQuantity] = useState(1);

  const data = encodeFunctionData({
    abi: contractABI,
    functionName: 'mintTickets',
  });

  const calls = [
    {
      to: CONTRACT_ADDRESS as Hex,
      data: data as Hex,
      value: BigInt(GAME_PRICE_WEI * quantity),
    },
  ];

  return (
    <div className="flex flex-col gap-4 w-[450px] max-w-full">
      <QuantitySelector
        className="quantity-selector-custom mt-0 w-full bg-[var(--primary-bg)] text-[var(--accent-yellow)] border-2 border-[var(--primary-border)]"
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
        <TransactionButton className="btn-login" text="BUY CHIPS" />
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
      <p className="text-center">
        TOTAL COST: ${(Number(formatEther(BigInt(GAME_PRICE_WEI * quantity))) * ethPrice).toFixed(2)} / {formatEther(BigInt(GAME_PRICE_WEI * quantity))} ETH
      </p>
    </div>
  );
}
