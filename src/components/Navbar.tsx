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
    <nav className="bg-black border-4 border-[#FFFF00]" style={{ position: 'relative', zIndex: 500 }}>
      <style>
        {`
          .nav-container {
            animation: fadeIn 0.5s ease-in forwards;
          }
          .link {
            transition: color 0.3s ease, transform 0.3s ease;
          }
          .link:hover {
            color: #FFFF00;
            transform: translateY(-2px);
          }
          .ticket {
            transition: transform 0.3s ease, box-shadow 0.3s ease;
          }
          .ticket:hover {
            transform: scale(1.05);
            box-shadow: 0 0 8px rgba(255, 255, 0, 0.5);
          }
          .logo {
            transition: filter 0.3s ease;
          }
          .logo:hover {
            filter: brightness(1.2);
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}
      </style>
      <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8 nav-container">
        <div className="relative flex h-16 items-center justify-between">
          <div className="flex flex-1 items-center justify-center sm:items-stretch sm:justify-start">
          <div className="flex flex-shrink-0 items-center logo">
            <Link href="/" title="Arcade Casino">
              <ArcadeCasinoSvg />
            </Link>
          </div>
          <div className="hidden sm:ml-6 sm:block">
            <div className="flex space-x-4">
              <div className="link">
                <Link href="/active-game">
                  <p className="px-3 py-2 text-lg font-bold text-white hover:text-[#FFFF00]" 
                      style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                    PLAY
                  </p>
                </Link>
              </div>
              {address && (
                <div className="link">
                  <Link href="/tickets">
                    <p className="px-3 py-2 text-lg font-bold text-white hover:text-[#FFFF00]"
                        style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                      TICKETS
                    </p>
                  </Link>
                </div>
              )}
              <div className="link">
                <Link href="/games">
                  <p className="px-3 py-2 text-lg font-bold text-white hover:text-[#FFFF00]"
                      style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                    HISTORY
                  </p>
                </Link>
              </div>
            </div>
          </div>
          </div>
          <div className="absolute inset-y-0 right-0 flex items-center pr-2 sm:static sm:inset-auto sm:ml-6 sm:pr-0">
            <div className="flex items-center gap-3">
              {address && (
                <Link href="/tickets">
                  <div
                    className="w-10 h-10 bg-black flex items-center justify-center text-lg font-bold text-white border-2 border-[#FFFF00] ticket"
                    style={{ fontFamily: "'Courier New', Courier, monospace" }}
                  >
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
