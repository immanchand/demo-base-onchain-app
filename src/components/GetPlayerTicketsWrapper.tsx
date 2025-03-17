'use client';
import { createPublicClient, http } from 'viem';
import type { Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { contractABI, contractAddress } from '../constants';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';

interface GetPlayerTicketsWrapperProps {
  onTicketsUpdate: (totalTickets: number) => void;
  refreshKey: number; // Add refreshKey to trigger re-fetch
}

export default function GetPlayerTicketsWrapper({
  onTicketsUpdate,
  refreshKey,
}: GetPlayerTicketsWrapperProps) {
  const { address } = useAccount();
  //const [playerTickets, setPlayerTickets] = useState<number>(0);

  useEffect(() => {
    async function fetchPlayerTickets() {
      if (!address) {
        onTicketsUpdate(0); // If no address, set tickets to 0
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
          args: [address as Hex],
        });


        onTicketsUpdate(Number(playerTicketsResult)); // Pass the absolute ticket count
      } catch (error) {
        console.error('Error fetching player tickets:', error);
        onTicketsUpdate(0); // Fallback to 0 on error
      }
    }

    fetchPlayerTickets();
  }, [address, onTicketsUpdate, refreshKey]); // Re-run if address or refreshKey changes

  return null; // No UI needed
}
