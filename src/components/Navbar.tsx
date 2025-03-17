'use client';
import ArcadeCasinoSvg from '../svg/ArcadeCasinoSvg';
import { useAccount } from 'wagmi';
import LoginButton from '../components/LoginButton';
import Link from 'next/link';
import { useState } from 'react';
import GetPlayerTicketsWrapper from './GetPlayerTicketsWrapper';



const Navbar = () => {

  const { address } = useAccount();
  const [ticketCount, setTicketCount] = useState<number>(0);
  const [refreshKey, setRefreshKey] = useState(0); // State to trigger refresh

  // Handle ticket count update from GetPlayerTicketsWrapper
  const handleTicketsUpdate = (totalTickets: number) => {
    setTicketCount(totalTickets);
  };
  // Refresh GetPlayerTicketsWrapper by updating the key
  const refreshTickets = () => {
    setRefreshKey(prev => prev + 1); // Increment to force re-mount
  };

  
  return (
        <nav className="bg-slate-100 border-b-2 border-b-slate-300 rounded-xl">
            <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8">
                <div className="relative flex h-16 items-center justify-between">
                    {/* <div className="absolute inset-y-0 left-0 flex items-center sm:hidden">
                        <button type="button" className="relative inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white" aria-controls="mobile-menu" aria-expanded="false">
                        <span className="absolute -inset-0.5"></span>
                        <span className="sr-only">Open main menu</span>
                        <svg className="block h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                        <svg className="hidden h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        </button>
                    </div> */}
                    <div className="flex flex-1 items-center justify-center sm:items-stretch sm:justify-start">
                        <div className="flex flex-shrink-0 items-center">
                        <a
                        title="Arcade Casino"
                        target="_blank"
                        rel="noreferrer"
                        >
                        <ArcadeCasinoSvg />
                    </a>
                        </div>
                        <div className="hidden sm:ml-6 sm:block">
                            <div className="flex space-x-4">
                                <Link href={'/games'} >
                                    <p className="rounded-md px-3 py-2 text-l font-large font-bold text-slate-700">Play & Win</p>
                                </Link>
                                {address && ( 
                                    <Link href="/tickets">
                                        <p className="rounded-md px-3 py-2 text-l font-large font-bold text-slate-700">Tickets</p>
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 sm:static sm:inset-auto sm:ml-6 sm:pr-0">
                    <div className="flex items-center gap-3">
                        
                        <button
                            onClick={refreshTickets}
                            className="w-10 h-10 bg-gray-500 rounded-full flex items-center justify-center text-xl font-bold text-white focus:outline-none hover:bg-gray-600"
                            aria-label="Refresh ticket count"
                            >
                            {address ? (
                                        <GetPlayerTicketsWrapper tickets={ticketCount} />
                                      ) : (0)}
                        </button>
                        <LoginButton />
                    </div>
                    </div>
                </div>
            </div>
        </nav>
  );
};

export default Navbar;
