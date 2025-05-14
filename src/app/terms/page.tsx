'use client';
import Navbar from 'src/components/Navbar';
import Link from 'next/link';
import React from 'react';

export default function Terms() {
    return (
        <div className="flex flex-col min-h-screen w-96 max-w-full px-1 md:w-[1008px] mx-auto">
            <Navbar />
            <div className="h-[10px]" />
            <section className="flex w-full flex-grow flex-col items-center gap-4 bg-primary-bg px-2 py-4 border-4 border-primary-border animate-fade-in">
                {/* Header */}
                <h1 className="text-4xl md:text-5xl font-bold text-primary-text text-center">
                    TERMS OF SERVICE
                </h1>
                <h2 className="text-xl md:text-2xl font-bold text-accent-yellow text-center">
                    Stupid Games, Awesome Rules
                </h2>
                <p className="text-lg text-primary-text text-center max-w-2xl">
                    Yo, degens! Welcome to Stupid Games, where you play silly arcade games for a shot at ETH prizes. These terms keep things fair and fun while covering our butts. Read up, then get back to smashing high scores!
                </p>

                {/* Terms Content */}
                <div className="w-full mt-8 max-w-3xl">
                    <h3 className="text-2xl font-bold text-primary-text text-center mb-4">
                        THE FINE PRINT
                    </h3>
                    <div className="card-container p-4">
                        <h4 className="text-xl font-bold text-accent-yellow mb-2">1. What’s Stupid Games?</h4>
                        <p className="text-primary-text">
                            Stupid Games is a fun side project where you play arcade games (Jump, Shoot, Fly) on Base, set high scores, and HODL the leaderboard for 24 hours to win 90% of the prize pool (10% rolls over). It’s a work in progress, so expect some bugs—we’re tweaking as we go. Got issues? DM us at <Link href="https://x.com/kantaloeth" className="text-accent-yellow hover:underline">@kantaloeth</Link>. Don’t take it too seriously—WAGMI!
                        </p>

                        <h4 className="text-xl font-bold text-accent-yellow mt-6 mb-2">2. Original Vibes</h4>
                        <p className="text-primary-text">
                            Our games are inspired by classic arcade bangers like dodging obstacles or blasting stuff in space. We use original assets (rocket ships, crypto aliens, Base-logo birds) and meme-y enemies (like FUD boxes). No copyrighted art or code is used, and we respect the OGs who paved the way. If you think we slipped up, hit us up on X!
                        </p>

                        <h4 className="text-xl font-bold text-accent-yellow mt-6 mb-2">3. Satire’s the Name of the Game</h4>
                        <p className="text-primary-text">
                            Characters and obstacles (like a certain regulator clown) are fictional and satirical, meant for laughs, not shade. We’re not trying to harm or misrepresent anyone—just poking fun at crypto life. If you’re not vibing, let us know, but it’s all in good degen spirit.
                        </p>

                        <h4 className="text-xl font-bold text-accent-yellow mt-6 mb-2">4. Age & Local Laws</h4>
                        <p className="text-primary-text">
                            You gotta be 18+ to play, no exceptions. Stupid Games involves real ETH (chips at 0.0001 ETH, ~$0.20), so it might count as gambling in some places. It’s on you to check your local laws before playing. We’re not lawyers, so don’t ask us for legal advice—just play smart!
                        </p>

                        <h4 className="text-xl font-bold text-accent-yellow mt-6 mb-2">5. Crypto is Final, Fam</h4>
                        <p className="text-primary-text">
                            Chip purchases and prize payouts are done on Base’s blockchain, so all transactions are final—no refunds, no takebacks. Prize pools start with a bonus fund and grow with chips, with 90% to the winner and 10% rolling over. Make sure your wallet’s ready, and double-check those transactions!
                        </p>

                        <h4 className="text-xl font-bold text-accent-yellow mt-6 mb-2">6. No Cheating, Plz</h4>
                        <p className="text-primary-text">
                            We validate high scores on our servers to catch hackers and keep things fair. Tweaking game settings, slowing FPS (like battery-saving mode), or other sketchy moves might flag you as a cheater. We reserve the right to disqualify suspect scores, but we know legit degens can get lucky too. If you think we flagged you unfairly, DM <Link href="https://x.com/kantaloeth" className="text-accent-yellow hover:underline">@kantaloeth</Link> to appeal. We’re working to make validation better!
                        </p>

                        <h4 className="text-xl font-bold text-accent-yellow mt-6 mb-2">7. It’s a Beta, Yo</h4>
                        <p className="text-primary-text">
                            Stupid Games is desktop-only for now (mobile’s coming soon) and might have glitches or downtime. We’re not liable for technical issues, lost scores, or missed prizes. Play at your own risk, and keep your laptop juiced to avoid FPS flags. Feedback helps us improve, so hit us up on X!
                        </p>

                        <h4 className="text-xl font-bold text-accent-yellow mt-6 mb-2">8. Liability Cap</h4>
                        <p className="text-primary-text">
                            We’re a small project, so we’re not responsible for big losses, regulatory fines, or crypto market crashes. If something goes wrong (hacks, bugs, or legal drama), our liability is capped at the chip price you paid (0.0001 ETH). Play for fun, not for your rent money.
                        </p>

                        <h4 className="text-xl font-bold text-accent-yellow mt-6 mb-2">9. Governing Law</h4>
                        <p className="text-primary-text">
                        These terms are governed by the laws of Singapore, a crypto-friendly hub. Any disputes go through Singapore courts, but let’s keep it chill and sort things out on X first, yeah?
                        </p>

                        <h4 className="text-xl font-bold text-accent-yellow mt-6 mb-2">10. Changes to Terms</h4>
                        <p className="text-primary-text">
                            We might update these terms as Stupid Games grows (new features like private games for your frens are coming!). Check back here for the latest. By playing, you agree to the current terms.
                        </p>
                    </div>
                </div>

                {/* Feedback Callout */}
                <div className="w-full mt-8 text-center">
                    <p className="text-sm text-primary-text">
                        Got questions or beef? DM us on X at <Link href="https://x.com/kantaloeth" className="text-accent-yellow hover:underline">@kantaloeth</Link>. This is a degen project for degen fun—let’s keep the vibes high and WAGMI!
                    </p>
                </div>
            </section>
        </div>
    );
}
