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
      <style>
        {`
          .transaction-button {
            transition: all 0.3s ease;
            background: #22C55E !important; /* Green-500 */
            color: white !important;
            border: 2px solid #FFFF00 !important;
            font-family: 'Courier New', Courier, monospace !important;
            border-radius: 0 !important;
          }
          .transaction-button:hover {
            background: #16A34A !important; /* Green-600 */
            box-shadow: 0 0 8px rgba(255, 255, 0, 0.5) !important;
          }
        `}
      </style>
      {userAddress ? (
        <Transaction
          calls={calls}
          chainId={BASE_SEPOLIA_CHAIN_ID}
          onError={handleError}
          onSuccess={handleSuccess}
        >
          <TransactionButton
            className="transaction-button w-full"
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
          className="w-full text-white bg-yellow-500 hover:bg-black hover:text-yellow-500 border-2 border-yellow-500 disabled:bg-yellow-500 disabled:text-white"
          // style={{ fontFamily: "'Courier New', Courier, monospace", borderRadius: 0 }}
          text="LOG IN TO WITHDRAW"
          withWalletAggregator={true}
        />
      )}
    </div>
  );
}
