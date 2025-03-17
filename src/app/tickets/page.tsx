'use client';
import WalletWrapper from '../../components/WalletWrapper';
import { useAccount } from 'wagmi';
import GetPlayerTicketsWrapper from '../../components/GetPlayerTicketsWrapper';
import BuyTicketsWrapper from '../../components/BuyTicketsWrapper';
import React, { useState, useCallback } from 'react';
import Navbar from 'src/components/Navbar';


export default function Tickets() {

  const { address } = useAccount();
  const [tickets, setTickets] = useState<number>(0);

  // Function to refresh the first child
  const updateTickets = useCallback((newNumber: number) => {
    setTickets(newNumber);
  }, []);

  return (
    <div className="flex h-full w-96 max-w-full flex-col px-1 md:w-[1008px] rounded-xl">
      <Navbar />
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
            text="Log In to Buy"
            withWalletAggregator={true}
          />
        )}
      </section>
    </div>
  );
}
