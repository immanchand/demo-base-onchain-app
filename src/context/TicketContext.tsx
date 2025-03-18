'use client';
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { contractABI, contractAddress } from '../constants';

interface TicketContextType {
  ticketCount: number;
  setTicketCount: (count: number) => void;
  refreshTickets: () => void;
}

const TicketContext = createContext<TicketContextType | undefined>(undefined);

export function TicketProvider({ children }: { children: React.ReactNode }) {
  const { address } = useAccount();
  const [ticketCount, setTicketCount] = useState<number>(0);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Fetch ticket count from the contract
  const fetchTickets = useCallback(async () => {
    if (!address) {
      setTicketCount(0);
      return;
    }

    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    try {
      const playerTicketsResult = await client.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'getTickets',
        args: [address],
      });
      setTicketCount(Number(playerTicketsResult));
    } catch (error) {
      console.error('Error fetching tickets:', error);
      setTicketCount(0);
    }
  }, [address]);

  // Fetch tickets on address change or refreshKey change
  useEffect(() => {
    fetchTickets();
  }, [address, refreshKey, fetchTickets]);

  // Function to manually trigger a refresh (e.g., after purchase)
  const refreshTickets = useCallback(() => {
    setRefreshKey((prev) => prev + 1); // Increment to trigger fetchTickets
  }, []);

  const value = {
    ticketCount,
    setTicketCount,
    refreshTickets,
  };

  return (
    <TicketContext.Provider value={value}>
      {children}
    </TicketContext.Provider>
  );
}

export function useTicketContext() {
  const context = useContext(TicketContext);
  if (!context) {
    throw new Error('useTicketContext must be used within a TicketProvider');
  }
  return context;
}
