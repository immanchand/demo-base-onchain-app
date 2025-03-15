'use client';

import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusAction,
  TransactionStatusLabel,
} from '@coinbase/onchainkit/transaction';
import type {
  TransactionError,
  TransactionResponse,
} from '@coinbase/onchainkit/transaction';
import type { Address, ContractFunctionParameters, GetValue, Hex } from 'viem';
import { encodeFunctionData } from 'viem'
import {
  BASE_SEPOLIA_CHAIN_ID,
  contractABI,
  contractAddress,
} from '../constants';
import { stat } from 'fs';

export default function TransactionWrapper({ address }: { address: Address }) {
  const contracts = [
    {
      address: contractAddress,
      abi: contractABI,
      functionName: 'mintTickets',
    },
  ] as unknown as ContractFunctionParameters[];

  const data = encodeFunctionData({
    abi: contractABI,
    functionName: 'mintTickets',
  });

  const calls = [{
    to: contractAddress as Hex,
    data: data as Hex,
    value: 100000000000000n,  // Amount to send (0.001 ETH in wei)
  }];

  const handleError = (err: TransactionError) => {
    console.error('Transaction error:', err);
  };

  const handleSuccess = (response: TransactionResponse) => {
    console.log('Transaction successful', response);
  };

  return (
    <div className="flex w-[450px]">
      <Transaction
        calls={calls}
        className="w-[450px]"
        chainId={BASE_SEPOLIA_CHAIN_ID}
        onError={handleError}
        onSuccess={handleSuccess}
      >
        <TransactionButton className="mt-0 mr-auto ml-auto w-[450px] max-w-full text-[white]" />
        <TransactionStatus>
          <TransactionStatusLabel />
          <TransactionStatusAction />
        </TransactionStatus>
      </Transaction>
    </div>
  );
}
