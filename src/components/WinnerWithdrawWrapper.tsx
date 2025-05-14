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
import { encodeFunctionData, Hex } from 'viem';
import { BASE_SEPOLIA_CHAIN_ID, contractABI, CONTRACT_ADDRESS } from 'src/constants';
import WalletWrapper from './WalletWrapper';

interface WinnerWithdrawWrapperProps {
  gameId: string | number;
  onSuccess?: () => void;
  userAddress?: string;
}

export default function WinnerWithdrawWrapper({ gameId, onSuccess, userAddress }: WinnerWithdrawWrapperProps) {
  const data = encodeFunctionData({
    abi: contractABI,
    functionName: 'winnerWithdraw',
    args: [BigInt(gameId)],
  });

  const calls = [{
    to: CONTRACT_ADDRESS as Hex,
    data: data as Hex,
    value: 0n,
  }];

  return (
    <div className="flex justify-center">
      {userAddress ? (
        <Transaction
          calls={calls}
          chainId={BASE_SEPOLIA_CHAIN_ID}
          onError={(err) => console.error('Withdrawal error:', err)}
          onSuccess={(response) => { console.log('Withdrawal successful', response); if (onSuccess) onSuccess(); }}
        >
          <TransactionButton className="btn-primary" text="WITHDRAW LOOT" />
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
          className="btn-login"
          text="LOG IN TO WITHDRAW"
          withWalletAggregator={true}
        />
      )}
    </div>
  );
}
