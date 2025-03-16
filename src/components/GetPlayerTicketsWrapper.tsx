'use client';
import { createPublicClient, http } from 'viem';
import type { Address, Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import {
    contractABI,
    contractAddress,
  } from '../constants';
import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';


export default function GetPlayerTicketsWrapper({ tickets }: { tickets: number }) {

    const { address } = useAccount();

    const [playerTickets, setPlayerTickets] = useState<number>(0);


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
            args: [address as Hex],
          });

          setPlayerTickets(Number(playerTickets));
        }
    
        fetchPlayerTickets();
      }, []);


    return (
        <span >
            {playerTickets + tickets}
        </span>
    );
  }
