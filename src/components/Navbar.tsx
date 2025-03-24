'use client';
import ArcadeCasinoSvg from '../svg/ArcadeCasinoSvg';
import { useAccount } from 'wagmi';
import LoginButton from '../components/LoginButton';
import Link from 'next/link';
import { useTicketContext } from '../context/TicketContext';
import React from 'react';

const Navbar = React.memo(() => {
  const { address } = useAccount();
  const { ticketCount } = useTicketContext();

  return (
    <nav className="bg-slate-100 border-b-2 border-b-slate-300 rounded-xl">
      <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8">
        <div className="relative flex h-16 items-center justify-between">
          <div className="flex flex-1 items-center justify-center sm:items-stretch sm:justify-start">
            <div className="flex flex-shrink-0 items-center">
              <a title="Arcade Casino" target="_blank" rel="noreferrer">
                <ArcadeCasinoSvg />
              </a>
            </div>
            <div className="hidden sm:ml-6 sm:block">
              <div className="flex space-x-4">
                <Link href={'/active-game'}>
                  <p className="rounded-md px-3 py-2 text-l font-large font-bold text-slate-700">Play & Win</p>
                </Link>
                {address && (
                  <Link href="/tickets">
                    <p className="rounded-md px-3 py-2 text-l font-large font-bold text-slate-700">Tickets</p>
                  </Link>
                  
                )}
                <Link href="/games">
                   <p className="rounded-md px-3 py-2 text-l font-large font-bold text-slate-700">Game History</p>
                 </Link>
              </div>
            </div>
          </div>
          <div className="absolute inset-y-0 right-0 flex items-center pr-2 sm:static sm:inset-auto sm:ml-6 sm:pr-0">
            <div className="flex items-center gap-3">
              {address && (
                <Link href="/tickets">
                  <div className="w-10 h-10 bg-gray-500 rounded-full flex items-center justify-center text-xl font-bold text-white hover:bg-gray-600 transition-colors">
                    {ticketCount}
                  </div>
              </Link>
              )}
              <LoginButton />
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
});

export default Navbar;
