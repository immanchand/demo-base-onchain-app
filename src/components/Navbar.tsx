'use client';
import StupidGamesSvg from 'src/svg/StupidGamesSvg';
import { useAccount } from 'wagmi';
import LoginButton from 'src/components/LoginButton';
import Link from 'next/link';
import { useTicketContext } from 'src/context/TicketContext';
import React, { useState } from 'react';

const Navbar = React.memo(() => {
  const { address } = useAccount();
  const { ticketCount } = useTicketContext();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  return (
    <nav className="bg-primary-bg border-4 border-primary-border relative z-[500] animate-fade-in">
      <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8">
        <div className="relative flex h-16 items-center justify-between">
          {/* Hamburger and Logo */}
          <div className="flex items-center w-full">
            {/* Hamburger Button (Mobile Only) */}
            <div className="absolute left-0 sm:hidden">
              <button
                className="p-2 text-primary-text hover:text-accent-yellow focus:outline-none"
                onClick={toggleMenu}
                aria-label="Toggle menu"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {isMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
            {/* Logo (Centered on Mobile) */}
            <div className="flex flex-1 justify-center sm:justify-start">
              <div className="flex-shrink-0 flex items-center transition-all duration-300 hover:brightness-125">
                <Link href="/" title="Stupid Games">
                  <StupidGamesSvg />
                </Link>
              </div>
            </div>
          </div>

          {/* Desktop Navigation Links and Login */}
          <div className="hidden sm:flex sm:ml-6 sm:items-center sm:space-x-4">
            <Link
              href="/active-game"
              className="px-3 py-2 text-lg font-bold text-primary-text hover:text-accent-yellow transition-all duration-300 hover:-translate-y-0.5"
            >
              GAME
            </Link>
            {address && (
              <Link
                href="/tickets"
                className="px-3 py-2 text-lg font-bold text-primary-text hover:text-accent-yellow transition-all duration-300 hover:-translate-y-0.5"
              >
                CHIPS
              </Link>
            )}
            <Link
              href="/games"
              className="px-3 py-2 text-lg font-bold text-primary-text hover:text-accent-yellow transition-all duration-300 hover:-translate-y-0.5"
            >
              WINS
            </Link>
            <Link
              href="/private"
              className="px-3 py-2 text-lg font-bold text-primary-text hover:text-accent-yellow transition-all duration-300 hover:-translate-y-0.5"
            >
              CREW
            </Link>
            {address && (
              <Link href="/tickets">
                <div className="w-10 h-10 bg-primary-bg flex items-center justify-center text-lg font-bold text-primary-text border-2 border-primary-border transition-all duration-300 hover:scale-105 hover:shadow-[0_0_8px_rgba(255,255,0,0.5)]">
                  {ticketCount}
                </div>
              </Link>
            )}
            <LoginButton />
          </div>

          {/* Mobile Dropdown Menu */}
          <div
            className={`nav-dropdown absolute top-16 left-0 w-full bg-primary-bg border-4 border-primary-border sm:hidden transition-all duration-300 ease-in-out ${
              isMenuOpen ? 'opacity-100 max-h-96' : 'opacity-0 max-h-0 overflow-hidden'
            }`}
          >
            <div className="flex flex-row flex-wrap space-x-2 px-4 py-4 landscape:flex-row landscape:space-x-4 landscape:space-y-0">
              <Link
                href="/active-game"
                className="px-3 py-1 text-base font-bold text-primary-text hover:text-accent-yellow transition-all duration-300 hover:-translate-y-0.5"
                onClick={() => setIsMenuOpen(false)}
              >
                GAME
              </Link>
              {address && (
                <Link
                  href="/tickets"
                  className="px-3 py-1 text-base font-bold text-primary-text hover:text-accent-yellow transition-all duration-300 hover:-translate-y-0.5"
                  onClick={() => setIsMenuOpen(false)}
                >
                  CHIPS
                </Link>
              )}
              <Link
                href="/games"
                className="px-3 py-1 text-base font-bold text-primary-text hover:text-accent-yellow transition-all duration-300 hover:-translate-y-0.5"
                onClick={() => setIsMenuOpen(false)}
              >
                WINS
              </Link>
              <Link
                href="/private"
                className="px-3 py-1 text-base font-bold text-primary-text hover:text-accent-yellow transition-all duration-300 hover:-translate-y-0.5"
                onClick={() => setIsMenuOpen(false)}
              >
                CREW
              </Link>
              <div className="px-3 py-1">
                <LoginButton />
              </div>
            </div>
          </div>

          {/* Ticket Count (Mobile Only, Right Side) */}
          <div className="flex items-center gap-2 sm:hidden">
            {address && (
              <Link href="/tickets">
                <div className="w-10 h-10 bg-primary-bg flex items-center justify-center text-lg font-bold text-primary-text border-2 border-primary-border transition-all duration-300 hover:scale-105 hover:shadow-[0_0_8px_rgba(255,255,0,0.5)]">
                  {ticketCount}
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
});

export default Navbar;
