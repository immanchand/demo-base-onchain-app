'use client';
import WalletWrapper from './WalletWrapper';

export default function LoginButton() {
  return (
    <WalletWrapper
      className="btn-primary min-w-[90px]"
      text="LOG IN"
      withWalletAggregator={true}
    />
  );
}
