// pages/Tickets.tsx
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
      <section className="templateSection flex w-full flex-col items-center justify-center gap-4 rounded-xl bg-[#2F004F] px-2 py-4 md:grow">
        <style>
          {`
            .ticket-container {
              animation: fadeIn 0.5s ease-in forwards;
              transition: transform 0.3s ease, filter 0.3s ease;
              position: relative;
            }
            .ticket-container::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: linear-gradient(135deg, rgba(128, 0, 128, 0.3) 0%, rgba(47, 0, 79, 0.5) 100%);
              border-radius: 0.75rem;
              z-index: 1;
            }
            .ticket-container:hover {
              transform: scale(1.02);
              filter: brightness(1.1);
            }
            .ticket-count {
              transition: box-shadow 0.3s ease;
              position: relative;
              z-index: 2;
            }
            .ticket-count:hover {
              box-shadow: 0 0 8px rgba(255, 215, 0, 0.5);
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}
        </style>
        <div
          className="ticket-container flex h-[450px] w-[450px] max-w-full items-center justify-center rounded-xl bg-[url('../svg/TicketsBg.jpg')] bg-cover bg-center"
          style={{ border: '2px solid #FFD700' }} // Golden yellow border
        >
          <div 
            className="ticket-count rounded-xl bg-[#800080] px-4 py-[11px]"
            style={{ border: '1px solid #FFD700' }}
          >
            <p 
              className="font-normal text-[#FFD700] text-xl"
              style={{ fontFamily: "'Comic Sans MS', cursive" }}
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
