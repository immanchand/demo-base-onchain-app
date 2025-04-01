'use client';
import Navbar from 'src/components/Navbar';
import BuyTicketsWrapper from 'src/components/BuyTicketsWrapper';
import WalletWrapper from 'src/components/WalletWrapper';
import { useAccount } from 'wagmi';
import { useTicketContext } from 'src/context/TicketContext';
import { useState, useCallback } from 'react';

export default function Tickets() {
  const { address } = useAccount();
  const { ticketCount, refreshTickets } = useTicketContext();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handlePurchaseSuccess = useCallback(() => {
    if (refreshTrigger === 0) {
      setRefreshTrigger(1);
      refreshTickets();
    }
  }, [refreshTrigger, refreshTickets]);

  return (
    <div className="flex flex-col min-h-screen w-96 max-w-full px-1 md:w-[1008px] mx-auto">
      <Navbar />
      <div className="h-[10px]" />
      <div className="flex flex-col flex-grow bg-primary-bg border-4 border-primary-border pt-[10px] items-center justify-center">
        <section className="flex w-full flex-col flex-grow items-center justify-center gap-4 px-2 py-4 animate-fade-in">
          <div className="card-container flex h-[200px] w-[450px] max-w-full items-center justify-center">
              <p className="font-bold text-xl text-center">
                <span className="text-2xl">YOU HAVE </span>
                <span className="text-4xl text-accent-yellow">{address ? ticketCount : 0}</span>
                <span className="text-2xl"> TICKETS</span>
              </p>
          </div>
          {address ? (
            <BuyTicketsWrapper updateTickets={handlePurchaseSuccess} />
          ) : (
            <WalletWrapper
              className="btn-login"
              text="LOG IN TO BUY"
              withWalletAggregator={true}
            />
          )}
        </section>
      </div>
    </div>
  );
}
