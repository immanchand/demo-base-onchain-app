'use client';
import React, { useEffect, useState } from 'react';
import Navbar from 'src/components/Navbar';
import Button from 'src/components/Button';
import { createWalletClient, custom } from 'viem';
import { baseSepolia } from 'viem/chains';
import { useAccount } from 'wagmi';
import Cookies from 'js-cookie';


export default function Page() {

  const { isConnected } = useAccount();
  const [hasSigned, setHasSigned] = useState(!!Cookies.get('gameSig')); // Check existing signature

  const handleSignMessage = async () => {

    console.log('isConnected ', isConnected, ' ', 'hasSigned ', hasSigned);
    // if (isConnected && !hasSigned) {

    //   const walletClient = createWalletClient({
    //     chain: baseSepolia,
    //     transport: custom(window.ethereum!),
    //   });
    //   const [account] = await walletClient.getAddresses();

    //   const message = `StartGameSession`;
    //   try {
    //     const signature = await walletClient.signMessage({ 
    //       account,
    //       message: message,
    //     });
    //     Cookies.set('gameSig', JSON.stringify({ message, signature }), {
    //       expires: 0.01, // 1 day
    //       secure: true,
    //       sameSite: 'strict',
    //       httpOnly: false, // Accessible to JS
    //     });
    //     console.log('Signature set in cookies');
    //     setHasSigned(true);
    //   } catch (error) {
    //     console.error('Failed to sign message on login:', error);
    //   }

    // }
  };

  // useEffect(() => {
  //   if (isConnected && !hasSigned) {
  //     handleSignMessage();
  //   }
  // }, [isConnected, hasSigned]);

  return (
    <div className="flex h-full w-96 max-w-full flex-col px-1 md:w-[1008px] rounded-xl">
      <Navbar />
      <section className="templateSection flex w-full flex-col items-center justify-center gap-4 rounded-xl bg-gray-100 px-2 py-4 md:grow">
	  <p className="font-bold text-primary-text">WELCOME TO THE HOME PAGE OF ARCADE CASINO</p>
      <Button onClick={handleSignMessage} >
              SIGN
            </Button>
      </section>
    </div>
  );
}
