// StartGameWrapper.tsx
'use client';
import { useCallback, useImperativeHandle, forwardRef, useState } from 'react';
import { useCsrf } from 'src/context/CsrfContext';
import { useAccount } from 'wagmi';
import { createWalletClient, custom } from 'viem';
import Cookies from 'js-cookie';
import { baseSepolia } from 'viem/chains';


// Extend the Window interface to include grecaptcha
declare global {
    interface Window {
        grecaptcha: {
            ready: (callback: () => void) => void;
            execute: (siteKey: string, options: { action: string }) => Promise<string>;
        };
    }
}

interface StartGameWrapperProps {
    gameId: string;
    onStatusChange: (status: 'idle' | 'pending' | 'success' | 'error', errorMessage?: string) => void;
}

const StartGameWrapper = forwardRef<{ startGame: () => Promise<void> }, StartGameWrapperProps>(
    ({ gameId, onStatusChange }, ref) => {
        const { isConnected, address } = useAccount();
        const [hasSigned, setHasSigned] = useState(!!Cookies.get('gameSig'));
        let gameSigRaw = '';
        const { csrfToken, refreshCsrfToken } = useCsrf();
        const xapporigin = process.env.NEXT_PUBLIC_APP_ORIGIN;

        const startGame = useCallback(
            async (isRetry = false): Promise<void> => {
                if (!csrfToken) {
                    onStatusChange('error', 'Security token not loaded');
                    return;
                }
                if (!xapporigin) {
                    onStatusChange('error', 'Application origin not defined');
                    return;
                }
                if (!gameId) {
                    onStatusChange('error', 'Missing gameId');
                    return;
                }
                if (!isConnected) {
                    onStatusChange('error', 'Wallet not connected. Please connect wallet.');
                    return;
                }

                // Get reCAPTCHA token
                let recaptchaTokenStart = '';
                try {
                    recaptchaTokenStart = await new Promise((resolve, reject) => {
                        if (!window.grecaptcha) {
                            reject(new Error('reCAPTCHA not loaded. Please wait and try again.'));
                        }
                        window.grecaptcha.ready(() => {
                            console.log('reCAPTCHA ready, generating token for startGame');
                            window.grecaptcha
                                .execute(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || (() => { throw new Error('RECAPTCHA_SITE_KEY is not defined'); })(), { action: 'startGame' })
                                .then(resolve)
                                .catch((error) => {
                                    console.error('reCAPTCHA execute error:', error);
                                    reject(error);
                                });
                        });
                    });
                } catch (error) {
                    console.error('reCAPTCHA initialization error:', error);
                    onStatusChange('error', 'reCAPTCHA failed. Please move your mouse around and try again.');
                    return;
                }

                // if (hasSigned) {
                //     gameSigRaw = decodeURIComponent(Cookies.get('gameSig') || '');
                // }
                if (!hasSigned) {
                    await getSignature();
                }

                // Validate the cookie signature with logged in player account address
                //try {
                //     const { message: signedMessage, signature, timestamp } = JSON.parse(gameSigRaw);
                //     const expectedMessage = `Yo, no gas, no cash, just legit vibes! Sign to lock in your chips for Stupid Games. Timestamp ${timestamp}. Let's game on!`;
                    
                //     if (signedMessage !== expectedMessage) {
                //         console.log('Signature mismatch. Clearing cookies.');
                //         Cookies.remove('gameSig');
                //         setHasSigned(false);
                //         await getSignature();
                //     }
                //     const playerAddress = ethers.verifyMessage(expectedMessage, signature);
                //     if (!address || playerAddress.toLowerCase() !== address.toLowerCase()) {
                //         console.log('Signature and player mismatch. Clearing cookies.');
                //         Cookies.remove('gameSig');
                //         setHasSigned(false);
                //         await getSignature();
                //     }
                // } catch (error) {
                //     console.log('Signature error. Clearing cookies.');
                //     Cookies.remove('gameSig');
                //     setHasSigned(false);
                //     onStatusChange('error', 'Your signature has gone stale!. Please refresh and try again.');
                // }    
                if (!address) {
                    onStatusChange('error', 'Player address not detected');
                    return;
                }
                // if (!gameSigRaw || gameSigRaw === '') {
                //     Cookies.remove('gameSig');
                //     setHasSigned(false);
                //     onStatusChange('error', 'Game signature not found. Please refresh and sign again to keep the vibes legit!');
                //     return;
                // }
                // if (!gameSigRaw.includes('signature')) {
                //     Cookies.remove('gameSig');
                //     setHasSigned(false);
                //     onStatusChange('error', 'Ah oh! Signature vide check failed. Please refresh and sign again to keep it legit!');
                //     return;
                // }
                try {
                    onStatusChange('pending');
                    const response = await fetch('/api/server', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': csrfToken,
                            'X-App-Origin': xapporigin,
                        },
                        credentials: 'include',
                        body: JSON.stringify({ action: 'start-game', gameId, address, recaptchaTokenStart }),
                    });
                    const data = await response.json();
                    if (data.status === 'success') {
                        console.log('Game started successfully, hash:', data.txHash);
                        onStatusChange('success', `Transaction hash: ${data.txHash}`);
                    } else {
                        throw new Error(data.message || 'Failed to start game');
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    if (errorMsg.includes('CAPTCHA failed')) {
                        onStatusChange('error', 'Yo! Act more human with your mouse and try again.');
                    } else if (errorMsg.includes('Invalid or missing CSRF token') && !isRetry) {
                        console.log('Refreshing CSRF token due to invalid token');
                        await refreshCsrfToken();
                        console.log('Retrying startGame with new CSRF token');
                        return startGame(true);
                    } else if (errorMsg.includes('Your signature')) {
                        //***********Cookies.remove('gameSig');
                        //**********setHasSigned(false);
                        onStatusChange('error', errorMsg);
                    } else {
                        onStatusChange('error', errorMsg);
                    }
                }

                async function getSignature() {
                    const walletClient = createWalletClient({
                        chain: baseSepolia,
                        transport: custom(window.ethereum!),
                    });
                    const [account] = await walletClient.getAddresses();
                    // Generate UTC timestamp (milliseconds since epoch, UTC)
                    const timestamp = Date.now();
                    // Construct message with address and timestamp
                    const messageToSign = `Yo, no gas, no cash, just legit vibes! Sign to lock in your chips for Stupid Games. Timestamp ${timestamp}. Let's game on!`;
                    try {
                        const signature = await walletClient.signMessage({
                            account,
                            message: messageToSign,
                        });
                        // Stringify the cookie value
                        const cookieValue = JSON.stringify({ message: messageToSign, signature, timestamp });
                        Cookies.set('gameSig', cookieValue, {
                            expires: 1,
                            secure: true,
                            sameSite: 'Lax',
                            path: '/',
                            httpOnly: true,
                        });
                        console.log('Signature set in cookies');
                        setHasSigned(true);
                        //gameSigRaw = decodeURIComponent(Cookies.get('gameSig') || '');

                    } catch (error) {
                        onStatusChange('error', 'Sign the vibe check to stack your chips and play Stupid Games!');
                        return;
                    }
                }
            },
            [csrfToken, refreshCsrfToken, gameId, isConnected, address, hasSigned, onStatusChange]
        );

        useImperativeHandle(ref, () => ({
            startGame,
        }));

        return null;
    }
);

StartGameWrapper.displayName = 'StartGameWrapper';

export default StartGameWrapper;
