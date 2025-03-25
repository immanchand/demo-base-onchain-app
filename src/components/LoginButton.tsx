'use client';
import WalletWrapper from './WalletWrapper';

export default function LoginButton() {
  return (
    <WalletWrapper
      className="min-w-[90px] button bg-yellow-500 text-white rounded-xl hover:bg-black hover:text-yellow-500 border-2 border-yellow-500 disabled:bg-yellow-500 disabled:text-white"
      text="log in"
      withWalletAggregator={true}
    />
  );
}
