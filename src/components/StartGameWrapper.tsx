// StartGameWrapper.tsx
'use client';
import { useCallback, useImperativeHandle, forwardRef, useState } from 'react';
import { useCsrf } from 'src/context/CsrfContext';
import { useAccount } from 'wagmi';
import { createWalletClient, custom } from 'viem';
import Cookies from 'js-cookie';
import { ethers } from 'ethers';
import { baseSepolia } from 'viem/chains';

interface StartGameWrapperProps {
  gameId: string;
  onStatusChange: (status: 'idle' | 'pending' | 'success' | 'error', errorMessage?: string) => void;
}

const StartGameWrapper = forwardRef<{ startGame: () => Promise<void> }, StartGameWrapperProps>(
  ({ gameId, onStatusChange }, ref) => {

    const { isConnected, address } = useAccount();
    const [hasSigned, setHasSigned] = useState(!!Cookies.get('gameSig')); // Check existing signature
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
        if (!window.ethereum) {
          onStatusChange('error', 'Wallet not detected. Please connect wallet.');
          return;
        }
        if (!isConnected) {
          onStatusChange('error', 'Wallet not connected. Please connect wallet.');
          return;
        }
        if (hasSigned){
          gameSigRaw = decodeURIComponent(Cookies.get('gameSig') || '');
        }
        if (!hasSigned) {
          getSignature();
        }

        // Validate the cookie signature with logged in player account address
        try {
          const { message, signature } = JSON.parse(gameSigRaw);
          const playerAddress = ethers.verifyMessage(message, signature);
          if (!address || playerAddress.toLowerCase() !== address.toLowerCase()) {
            console.log('Signature mismatch. Clearing cookies.');
            Cookies.remove('gameSig'); // Clear invalid signature
            setHasSigned(false); // Reset signed state
            getSignature(); // Request new signature
          }
        }
        catch (error) {
          console.log('Signature error. Clearing cookies.');
          Cookies.remove('gameSig'); // Clear invalid signature
          setHasSigned(false); // Reset signed state
          getSignature(); // Request new signature
        }
        
        if (!address) {
          onStatusChange('error', 'Player address not detected');
          return;
        }
        if (!gameSigRaw || gameSigRaw === '') {
          onStatusChange('error', 'Game signature not found');
          return;
        }
        if (!gameSigRaw.includes('signature')) {
          onStatusChange('error', 'Invalid game signature');
          return;
        }
        

        try {
          onStatusChange('pending');
          
          const response = await fetch('/api/server', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': csrfToken,
              'X-App-Origin': xapporigin,
            },
            credentials: 'include', // Sends gameSig and sessionId cookies
            body: JSON.stringify({ action: 'start-game', gameId, address }),
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
          if (errorMsg.includes('Invalid or missing CSRF token') && !isRetry) {
            console.log('Refreshing CSRF token due to invalid token');
            await refreshCsrfToken();
            console.log('Retrying startGame with new CSRF token');
            return startGame(true);
          }
          onStatusChange('error', errorMsg);
        }

        async function getSignature() {
          const walletClient = createWalletClient({
            chain: baseSepolia,
            transport: custom(window.ethereum!),
          });
          const [account] = await walletClient.getAddresses();
          const message = `StartGameSession`;
          try {
            const signature = await walletClient.signMessage({ 
              account,
              message: message,
            });
            Cookies.set('gameSig', JSON.stringify({ message, signature }), {
              expires: 0.01, // 1 day
              secure: true,
              sameSite: 'strict',
              httpOnly: false, // Accessible to JS
            });
            console.log('Signature set in cookies');
            setHasSigned(true);
            gameSigRaw = decodeURIComponent(Cookies.get('gameSig') || '');
          } catch (error) {
            onStatusChange('error', 'Please sign game session to start the game');
            return;
          }
        }

      },
      [setHasSigned, csrfToken, refreshCsrfToken]
    );

    useImperativeHandle(ref, () => ({
      startGame,
    }));

    return null;
  }
);

StartGameWrapper.displayName = 'StartGameWrapper';

export default StartGameWrapper;
