'use client';
import StupidGamesSvg from 'src/svg/StupidGamesSvg';
import { useAccount } from 'wagmi';
import LoginButton from 'src/components/LoginButton';
import Link from 'next/link';
import { useTicketContext } from 'src/context/TicketContext';
import React from 'react';

const Navbar = React.memo(() => {
  const { address } = useAccount();
  const { ticketCount } = useTicketContext();

  return (
    <nav className="bg-primary-bg border-4 border-primary-border relative z-[500] animate-fade-in">
      <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8">
        <div className="relative flex h-16 items-center justify-between">
          <div className="flex flex-1 items-center justify-center sm:items-stretch sm:justify-start">
            <div className="flex-shrink-0 flex items-center transition-all duration-300 hover:brightness-125">
              <Link href="/" title="Stupid Games">
                <StupidGamesSvg />
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex space-x-4">
              <Link href="/active-game" className="px-3 py-2 text-lg font-bold text-primary-text hover:text-accent-yellow transition-all duration-300 hover:-translate-y-0.5">
                PLAY
              </Link>
              {address && (
                <Link href="/tickets" className="px-3 py-2 text-lg font-bold text-primary-text hover:text-accent-yellow transition-all duration-300 hover:-translate-y-0.5">
                  TICKETS
                </Link>
              )}
              <Link href="/games" className="px-3 py-2 text-lg font-bold text-primary-text hover:text-accent-yellow transition-all duration-300 hover:-translate-y-0.5">
                HISTORY
              </Link>
            </div>
          </div>
          <div className="absolute inset-y-0 right-0 flex items-center pr-2 sm:static sm:inset-auto sm:ml-6 sm:pr-0">
            <div className="flex items-center gap-3">
              {address && (
                <Link href="/tickets">
                  <div className="w-10 h-10 bg-primary-bg flex items-center justify-center text-lg font-bold text-primary-text border-2 border-primary-border transition-all duration-300 hover:scale-105 hover:shadow-[0_0_8px_rgba(255,255,0,0.5)]">
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
