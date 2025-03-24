// components/WithdrawPrizeWrapper.tsx
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
import { BASE_SEPOLIA_CHAIN_ID, contractABI, contractAddress } from 'src/constants';
import WalletWrapper from './WalletWrapper';

interface WithdrawPrizeWrapperProps {
  gameId: number;
  onSuccess?: () => void;
  userAddress?: string;
}

export default function WinnerWithdrawWrapper({ gameId, onSuccess, userAddress }: WithdrawPrizeWrapperProps) {
  const data = encodeFunctionData({
    abi: contractABI,
    functionName: 'winnerWithdraw',
    args: [BigInt(gameId)],
  });

  const calls = [
    {
      to: contractAddress as Hex,
      data: data as Hex,
      value: 0n, // No ETH needed for withdrawal
    },
  ];

  const handleError = (err: TransactionError) => {
    console.error('Withdrawal error:', err);
  };

  const handleSuccess = (response: TransactionResponse) => {
    console.log('Withdrawal successful', response);
    if (onSuccess) onSuccess();
  };

  return (
    <div className="w-full">
      {userAddress ? (
        <Transaction
          calls={calls}
          chainId={BASE_SEPOLIA_CHAIN_ID}
          onError={handleError}
          onSuccess={handleSuccess}
        >
          <TransactionButton
            className="w-full text-white bg-green-500 hover:bg-green-600"
            text="Claim Prize"
          />
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
      ) : (
        <WalletWrapper
          className="w-full"
          text="Log In to Withdraw"
          withWalletAggregator={true}
        />
      )}
    </div>
  );
}
