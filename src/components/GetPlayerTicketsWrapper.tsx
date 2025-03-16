'use client';
import { createPublicClient, http } from 'viem';
import type { Address } from 'viem';
import { baseSepolia } from 'viem/chains';
import {
    BASE_SEPOLIA_CHAIN_ID,
    contractABI,
    contractAddress,
  } from '../constants';
import React, { useEffect, useState } from 'react';


export default function GetPlayerTicketsWrapper({ address }: { address: Address }) {

    const [playerTickets, setPlayerTickets] = useState<number | null>(null);

    useEffect(() => {

        async function fetchPlayerTickets() {
          
          const client = createPublicClient({
            chain: baseSepolia,
            transport: http(),
          });

          const playerTickets = await client.readContract({
            address: contractAddress,
            abi: contractABI,
            functionName: 'getTickets',
            args: [address],
          });

          setPlayerTickets(Number(playerTickets));
        }
    
        fetchPlayerTickets();
      }, []);

    return (
      <div 
      className="flex h-[450px] w-[450px] max-w-full items-center justify-center rounded-xl bg-[url('../svg/TicketsBg.jpg')] bg-cover bg-center"
      >
        <div className="rounded-xl bg-[#F3F4F6] px-4 py-[11px]">
          <p className="font-normal text-indigo-600 text-xl not-italic tracking-[-1.2px]">
            Tickets: {playerTickets}
          </p>
        </div>
      </div>
    );
  }
