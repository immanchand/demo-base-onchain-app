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
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0); // Local trigger to ensure single refresh

  // Callback for BuyTicketsWrapper to trigger a refresh
  const handlePurchaseSuccess = useCallback(() => {
    if (refreshTrigger === 0) { // Only trigger refresh once
      setRefreshTrigger(1);
      refreshTickets(); // Call context refresh
    }
  }, [refreshTrigger, refreshTickets]);

  return (
    <div className="flex h-full w-96 max-w-full flex-col px-1 md:w-[1008px] rounded-xl">
      <Navbar />
      <section className="templateSection flex w-full flex-col items-center justify-center gap-4 rounded-xl bg-gray-100 px-2 py-4 md:grow">
        <div
          className="flex h-[450px] w-[450px] max-w-full items-center justify-center rounded-xl bg-[url('../svg/TicketsBg.jpg')] bg-cover bg-center"
        >
          <div className="rounded-xl bg-[#F3F4F6] px-4 py-[11px]">
            <p className="font-normal text-indigo-600 text-xl not-italic tracking-[-1.2px]">
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
