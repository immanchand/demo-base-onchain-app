'use client';
import Navbar from 'src/components/Navbar';
import Link from 'next/link';
import React from 'react';

export default function PrivateGames() {
    return (
        <div className="flex flex-col min-h-screen w-96 max-w-full px-1 md:w-[1008px] mx-auto">
            <Navbar />
            <div className="h-[10px]" />
            <section className="flex w-full flex-grow flex-col items-center gap-4 bg-primary-bg px-2 py-4 border-4 border-primary-border animate-fade-in">
                {/* Header */}
                <h1 className="text-4xl md:text-5xl font-bold text-primary-text text-center">
                    CREW MODE COMING SOON
                </h1>
                <h2 className="text-xl md:text-2xl font-bold text-accent-yellow text-center">
                    Private Games for Your Degen Squad
                </h2>
                <p className="text-lg text-primary-text text-center max-w-2xl">
                    Yo, degens! Get ready to squad up with CREW mode, where you and your frens can battle for high scores and ETH prizes in private games. No randos, just your trusted homies. LFG!
                </p>

                {/* Feature Description */}
                <div className="w-full mt-8 max-w-3xl">
                    <h3 className="text-2xl font-bold text-primary-text text-center mb-4">
                        WHY CREW MODE?
                    </h3>
                    <div className="card-container p-4">
                        <p className="text-primary-text">
                            It’s all about trust, fam. Game with your squad to keep things fair and flex those wins without hackers crashing the party. Our servers will still validate scores to catch any sneaky moves, but your homies got your back!
                        </p>
                        <p className="text-primary-text mt-4">
                            You choose the chip price. You choose the duration. You're the game master! We’re grinding to make CREW mode the ultimate degen hangout. Wanna help shape it? Slide into our DMs on X at <Link href="https://x.com/kantaloeth" className="text-accent-yellow hover:underline">@kantaloeth</Link> with ideas or just to hype it up!
                        </p>
                    </div>
                </div>

                {/* Call to Action */}
                <div className="w-full mt-8 text-center">
                    <h3 className="text-2xl font-bold text-accent-yellow mb-4">
                        STAY TUNED, SQUAD!
                    </h3>
                    <p className="text-lg text-primary-text">
                        CREW mode is dropping soon, and it’s gonna be lit. Follow <Link href="https://x.com/kantaloeth" className="text-accent-yellow hover:underline">@kantaloeth</Link> on X for updates, sneak peeks, and chances to flex your degen skills. Let’s moon this together—WAGMI!
                    </p>
                </div>
            </section>
        </div>
    );
}
