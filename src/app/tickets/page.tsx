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
    <div className="flex flex-col min-h-screen w-96 max-w-full px-1 md:w-[1008px]">
      <Navbar />
      <div className="h-[10px]"/>
      <div className="flex flex-col flex-grow border-4 border-[#FFFF00] bg-black pt-[10px] items-center justify-center">
        <section className="templateSection flex w-full h-full flex-col items-center justify-center gap-4 bg-black px-2 py-4">
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
          <div className="flex flex-col items-center justify-center gap-4">
            <div
              className="ticket-container flex h-[200px] w-[450px] max-w-full items-center justify-center bg-black"
              style={{ border: '2px solid #FFFF00' }}
            >
              <div 
                className="ticket-count bg-black px-4 py-[20px]"
                style={{ border: '1px solid #FFFF00'}}
              >
                <p 
                  className="font-bold text-white text-xl"
                  style={{ fontFamily: "'Courier New', Courier, monospace" }}
                >
                  <span className="text-2xl">YOU HAVE </span>
                  <span className="text-4xl text-yellow-500">{address ? ticketCount : 0}</span>
                  <span className="text-2xl"> TICKETS</span>
                </p>
              </div>
            </div>
            {address ? (
              <BuyTicketsWrapper updateTickets={handlePurchaseSuccess} />
            ) : (
              <WalletWrapper
                className="w-[450px] max-w-full button bg-yellow-500 text-white hover:bg-black hover:text-yellow-500 border-2 border-yellow-500 disabled:bg-yellow-500 disabled:text-white"
                // style={{ fontFamily: "'Courier New', Courier, monospace",  borderRadius: 0 }}
                text="LOG IN TO BUY"
                withWalletAggregator={true}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
