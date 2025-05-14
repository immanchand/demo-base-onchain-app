'use client';
import Navbar from 'src/components/Navbar';
import Button from 'src/components/Button';
import Link from 'next/link';
import React, { useState, useCallback, useEffect, useRef } from 'react';

export default function Home() {
    return (
        <div className="flex flex-col min-h-screen w-96 max-w-full px-1 md:w-[1008px] mx-auto">
            <Navbar />
            <div className="h-[10px]" />
            <section className="flex w-full flex-grow flex-col items-center gap-4 bg-primary-bg px-2 py-4 border-4 border-primary-border animate-fade-in">
                {/* Hero Section */}
                <h1 className="text-4xl md:text-5xl font-bold text-primary-text text-center">
                    STUPID GAMES
                </h1>
                <h2 className="text-xl md:text-2xl font-bold text-accent-yellow text-center">
                    Play Stupid Games, Win Awesome Prizes!
                </h2>
                <p className="text-lg text-primary-text text-center max-w-2xl">
                    Yo, degens! Smash arcade games, set high scores, and HODL the leaderboard for 24 hours to win big crypto prizes. It’s a silly side project, so don’t take it too seriously—just have fun!
                </p>
                <Button className="btn-primary text-lg">
                    <Link href="/active-game">PLAY NOW</Link>
                </Button>

                {/* How It Works */}
                <div className="w-full mt-8">
                    <h3 className="text-2xl font-bold text-primary-text text-center mb-4">
                        HOW IT WORKS
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="card-container p-4">
                            <h4 className="text-xl font-bold text-accent-yellow">1. Grab Tickets</h4>
                            <p className="text-primary-text">
                                Buy tickets for 0.0001 ETH (~$0.20) on the <Link href="/tickets" className="text-accent-yellow hover:underline">Tickets page</Link>. Cheap enough for any degen!
                            </p>
                        </div>
                        <div className="card-container p-4">
                            <h4 className="text-xl font-bold text-accent-yellow">2. Play & Score</h4>
                            <p className="text-primary-text">
                                Pick a game—Jump, Shoot, or Fly—and rack up a high score. All games compete for the same prize pool, with slightly different vibes but equal shots at glory.
                            </p>
                        </div>
                        <div className="card-container p-4">
                            <h4 className="text-xl font-bold text-accent-yellow">3. HODL the Lead</h4>
                            <p className="text-primary-text">
                                Set a high score and hold the leaderboard for 24 hours. If no one beats you, you win 90% of the prize pool—10% rolls over to keep the next game juicy!
                            </p>
                        </div>
                        <div className="card-container p-4">
                            <h4 className="text-xl font-bold text-accent-yellow">4. Win Big Crypto</h4>
                            <p className="text-primary-text">
                                Prize pools start with a bonus fund and grow with every degen’s ticket. Check the current pool on the <Link href="/active-game" className="text-accent-yellow hover:underline">Active Game</Link> page and moon that score!
                            </p>
                        </div>
                    </div>
                </div>

                {/* Games Section */}
                <div className="w-full mt-8">
                    <h3 className="text-2xl font-bold text-primary-text text-center mb-4">
                        THE GAMES
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="card-container p-4">
                            <h4 className="text-xl font-bold text-accent-yellow">JUMP</h4>
                            <p className="text-primary-text">
                                Dodge FUD boxes and Bitcoin traps in this jumping sprint. Keep your avatar hopping to the top score!
                            </p>
                        </div>
                        <div className="card-container p-4">
                            <h4 className="text-xl font-bold text-accent-yellow">SHOOT</h4>
                            <p className="text-primary-text">
                                Blast Bitcoin and Solana aliens with your Ethereum Space Ship. Pew, pew, pew your way to a high score!
                            </p>
                        </div>
                        <div className="card-container p-4">
                            <h4 className="text-xl font-bold text-accent-yellow">FLY</h4>
                            <p className="text-primary-text">
                                Flap your Base Ship - Space Ship through a gauntlet of Gary Gensler clown faces. One wrong move, and you’re rekt!
                            </p>
                        </div>
                    </div>
                    <p className="text-center text-primary-text mt-4">
                        All games feed one prize pool—pick your vibe and go for the W!
                    </p>
                </div>

                {/* Tech Stuff */}
                <div className="w-full mt-8 max-w-2xl">
                    <h3 className="text-2xl font-bold text-primary-text text-center mb-4">
                        TECH STUFF FOR NERDS
                    </h3>
                    <div className="card-container p-4">
                        <p className="text-primary-text">
                            Built on Base for max degen vibes. High scores are recorded on a smart contract for transparency, and prizes can be withdrawn trustlessly. Scores are validated on our servers to catch hackers—keep it fair, fam! Don’t let your laptop snooze—battery-saving mode might flag you as a cheater. Desktop-only for now—mobile’s coming soon.
                        </p>
                        <p className="text-primary-text mt-2">
                            Soon: Private games to flex with your frens only!
                        </p>
                    </div>
                </div>

                {/* Disclaimer and Feedback */}
                <div className="w-full mt-8 text-center">
                    <p className="text-sm text-primary-text">
                        This is a fun side project and a work in progress. Got issues? DM me on X at <Link href="https://x.com/kantaloeth" className="text-accent-yellow hover:underline">@kantaloeth</Link>. Don’t take it too seriously—WAGMI!
                    </p>
                    <p className="text-sm text-primary-text mt-2">
                        18+ only. Crypto transactions are final. We validate scores to try and keep it fair. Check your local laws before playing.
                    </p>
                </div>
            </section>
        </div>
    );
}
