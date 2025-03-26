'use client';
import WalletWrapper from './WalletWrapper';

export default function LoginButton() {
  return (
    <WalletWrapper
      className="min-w-[90px] button bg-yellow-500 text-white hover:bg-green-400 hover:text-yellow-500 border-2 border-yellow-500 disabled:bg-yellow-500 disabled:text-white"
      text="LOG IN"
      withWalletAggregator={true}
    />
  );
}
