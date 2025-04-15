'use client';
import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusAction,
  TransactionStatusLabel,
  TransactionToast,
  TransactionToastIcon,
  TransactionToastLabel,
} from '@coinbase/onchainkit/transaction';
import { encodeFunctionData, Hex } from 'viem';
import { BASE_SEPOLIA_CHAIN_ID, contractABI, CONTRACT_ADDRESS, GAME_PRICE_WEI } from '../constants';
import { QuantitySelector } from '../../node_modules/@coinbase/onchainkit/esm/internal/components/QuantitySelector';
import { useState } from 'react';

export default function TransactionWrapper() {
  const [quantity, setQuantity] = useState(1);

  const data = encodeFunctionData({
    abi: contractABI,
    functionName: 'mintTickets',
  });

  const calls = [{
    to: CONTRACT_ADDRESS as Hex,
    data,
    value: BigInt(GAME_PRICE_WEI * quantity),
  }];

  return (
    <div className="flex flex-col gap-4 w-[450px] max-w-full">
      <QuantitySelector
        className="quantity-selector mt-0 mx-auto"
        onChange={(value) => setQuantity(Number(value))}
        minQuantity={1}
        maxQuantity={100}
        placeholder={''}
      />
      <Transaction
        calls={calls}
        chainId={BASE_SEPOLIA_CHAIN_ID}
        onError={(err) => console.error('Transaction error:', err)}
        onSuccess={(response) => console.log('Transaction successful', response)}
      >
        <TransactionButton className="btn-login" text="Buy Tickets" />
        <TransactionStatus>
          <TransactionStatusLabel />
          <TransactionStatusAction />
        </TransactionStatus>
        <TransactionToast>
          <TransactionToastIcon />
          <TransactionToastLabel />
        </TransactionToast>
      </Transaction>
    </div>
  );
}
