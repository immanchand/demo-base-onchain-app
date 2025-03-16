'use client';
import Footer from 'src/components/Footer';
import WalletWrapper from '../components/WalletWrapper';
import ArcadeCasinoSvg from '../svg/ArcadeCasinoSvg';
import { useAccount } from 'wagmi';
import LoginButton from '../components/LoginButton';
import SignupButton from '../components/SignupButton';
import GetPlayerTicketsWrapper from '../components/GetPlayerTicketsWrapper';
import BuyTicketsWrapper from '../components/BuyTicketsWrapper';
import React, { useState, useCallback } from 'react';



export default function Page() {

  const { address } = useAccount();
  const [tickets, setTickets] = useState<number>(0);

  // Function to refresh the first child
  const updateTickets = useCallback((newNumber: number) => {
    setTickets(newNumber);
  }, []);

  return (
    <div className="flex h-full w-96 max-w-full flex-col px-1 md:w-[1008px]">
      <section className="mt-6 mb-6 flex w-full flex-col md:flex-row">
        <div className="flex w-full flex-row items-center justify-between gap-2 md:gap-0">
          <a
            title="Arcade Casino"
            target="_blank"
            rel="noreferrer"
          >
            <ArcadeCasinoSvg />
           
          </a>
          <div className="flex items-center gap-3">
            <SignupButton />
            {!address && <LoginButton />}
          </div>
        </div>
      </section>
      <section className="templateSection flex w-full flex-col items-center justify-center gap-4 rounded-xl bg-gray-100 px-2 py-4 md:grow">
        
                  
                    <div 
                    className="flex h-[450px] w-[450px] max-w-full items-center justify-center rounded-xl bg-[url('../svg/TicketsBg.jpg')] bg-cover bg-center"
                    >
                      <div className="rounded-xl bg-[#F3F4F6] px-4 py-[11px]">
                      <p className="font-normal text-indigo-600 text-xl not-italic tracking-[-1.2px]">
                          Tickets: {address ? (
                        <GetPlayerTicketsWrapper tickets={tickets} />
                      ) : (0)}
                      </p>
                      </div>
                    </div>
               
        {address ? (
          <BuyTicketsWrapper updateTickets={updateTickets}/>
        ) : (
          <WalletWrapper
            className="w-[450px] max-w-full"
            text="Connect Wallet to Buy"
            withWalletAggregator={true}
          />
        )}
      </section>
      <Footer />
    </div>
  );
}
