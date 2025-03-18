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
    updateTickets(); // Notify Tickets component of success
  };

  return (
    <div className="flex w-[450px]" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <QuantitySelector
          className="mt-0 mr-auto ml-auto w-[450px] max-w-full text-[white]"
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
          className="mt-0 mr-auto ml-auto w-[450px] max-w-full text-[white]"
          text="Buy Tickets"
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
