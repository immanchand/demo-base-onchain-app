'use client';
import WalletWrapper from '../../components/WalletWrapper';
import { useAccount } from 'wagmi';
import BuyTicketsWrapper from '../../components/BuyTicketsWrapper';
import Navbar from 'src/components/Navbar';
import { useTicketContext } from 'src/context/TicketContext';
import { useState, useCallback } from 'react';

export default function Tickets() {
  const { address } = useAccount();
  const { ticketCount, refreshTickets } = useTicketContext();
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const handlePurchaseSuccess = useCallback(() => {
    if (refreshTrigger === 0) {
      setRefreshTrigger(1);
      refreshTickets();
    }
  }, [refreshTrigger, refreshTickets]);

  return (
    <div className="flex h-full w-96 max-w-full flex-col px-1 md:w-[1008px] rounded-xl">
      <Navbar />
      <section className="templateSection flex w-full flex-col items-center justify-center gap-4 rounded-xl bg-black px-2 py-4 md:grow">
        <style>
          {`
            .ticket-container {
              animation: fadeIn 0.5s ease-in forwards;
              transition: transform 0.3s ease, filter 0.3s ease;
              position: relative;
            }
            .ticket-container:hover {
              transform: scale(1.02);
              filter: brightness(1.1);
              box-shadow: 0 0 8px rgba(255, 255, 0, 0.5);
            }
            .ticket-count {
              transition: box-shadow 0.3s ease;
              position: relative;
              z-index: 2;
            }
            .ticket-count:hover {
              box-shadow: 0 0 8px rgba(255, 255, 0, 0.5);
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}
        </style>
        <div
          className="ticket-container flex h-[100px] w-[450px] max-w-full items-center justify-center rounded-xl bg-black"
          style={{ border: '2px solid #FFFF00' }} // Yellow border
        >
          <div 
            className="ticket-count rounded-xl bg-black px-4 py-[20px]"
            style={{ border: '1px solid #FFFF00' }}
          >
            <p 
              className="font-normal text-white text-xl"
              style={{ fontFamily: "'Courier New', Courier, monospace" }}
            >
              Tickets: {address ? ticketCount : 0}
            </p>
          </div>
        </div>
        {address ? (
          <BuyTicketsWrapper updateTickets={handlePurchaseSuccess} />
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
