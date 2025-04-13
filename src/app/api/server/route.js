// src/app/api/server/route.js
import { ethers } from 'ethers';
import { getCsrfTokens } from 'src/lib/csrfStore';
import { contractABI, CONTRACT_ADDRESS } from '../../../constants';

const rateLimitStore = new Map();
const GAME_MASTER_PRIVATE_KEY = process.env.GAME_MASTER_PRIVATE_KEY;
const PROVIDER_URL = process.env.API_URL;

if (!GAME_MASTER_PRIVATE_KEY || !PROVIDER_URL) {
  throw new Error('Missing GAME_MASTER_PRIVATE_KEY or PROVIDER_URL in environment');
}

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const wallet = new ethers.Wallet(GAME_MASTER_PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, wallet);

export async function POST(request) {
  const appOrigin = request.headers.get('x-app-origin');
  const allowedOrigin = process.env.APP_ORIGIN;

  if (appOrigin !== allowedOrigin) {
    return new Response(JSON.stringify({ status: 'error', message: 'Invalid application origin' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' },
    });
  }

  const csrfToken = request.headers.get('x-csrf-token');
  const cookies = request.headers.get('cookie') || '';
  const sessionIdMatch = cookies.match(/sessionId=([^;]+)/);
  const sessionId = sessionIdMatch ? sessionIdMatch[1] : null;
  const gameSigMatch = cookies.match(/gameSig=([^;]+)/);
  const gameSigRaw = gameSigMatch ? decodeURIComponent(gameSigMatch[1]) : null;

  const csrfTokens = getCsrfTokens();

  if (!csrfToken || !sessionId || csrfTokens.get(sessionId) !== csrfToken) {
    return new Response(JSON.stringify({ status: 'error', message: 'Invalid or missing CSRF token. Press f5 to refresh.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' },
    });
  }

  const { action, gameId, address, score } = await request.json();
  if (!action) {
    return new Response(JSON.stringify({ status: 'error', message: 'Missing action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' },
    });
  }

  try {
    let tx, receipt;
    switch (action) {
      case 'create-game':
        const now = Date.now();
        const fifteenMinutes = 25 * 60 * 1000; // 25 minutes in milliseconds
        const lastCallCreate = rateLimitStore.get(sessionId);
        if (lastCallCreate && now - lastCallCreate < fifteenMinutes) {
          const timeLeft = Math.ceil((fifteenMinutes - (now - lastCallCreate)) / (60 * 1000));
          return new Response(
            JSON.stringify({ status: 'error', message: `Rate limit exceeded. Try again in ${timeLeft} minutes.` }),
            { status: 429, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
          );
        }
        tx = await contract.createGame();
        receipt = await tx.wait();
        rateLimitStore.set(sessionId, now);
        return new Response(
          JSON.stringify({ status: 'success', txHash: tx.hash }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
        );
      
      case 'end-game':
        if (!gameId) {
          return new Response(
            JSON.stringify({ status: 'error', message: 'Missing gameId' }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
          );
        }
        if (!address) {
          return new Response(
            JSON.stringify({ status: 'error', message: 'Missing player address' }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
          );
        }
        if (!score) {
          return new Response(
            JSON.stringify({ status: 'error', message: 'Missing player score' }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
          );
        }

        tx = await contract.endGame(BigInt(gameId), address, BigInt(score));
        receipt = await tx.wait();
        let isHighScore = false;
        try {
          isHighScore = receipt.logs[1].args[3]? true : false;
          // code after new contract deployment is:
          // isHighScore = receipt.logs[0].args[3];
        } catch (error) {}
                
        return new Response(
           JSON.stringify({ status: 'success', txHash: tx.hash,  isHighScore}),
           { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
         );

      case 'start-game':
        if (!gameId) {
          return new Response(
            JSON.stringify({ status: 'error', message: 'Missing gameId' }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
          );
        }
        if (!address) {
          return new Response(
            JSON.stringify({ status: 'error', message: 'Missing player address' }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
          );
        }

        // Verify signature and recover address
        let playerAddress;
        if (gameSigRaw) {
          try {
            const { message, signature } = JSON.parse(gameSigRaw);
            playerAddress = ethers.verifyMessage(message, signature);
            if (playerAddress.toLowerCase() !== address.toLowerCase()) {
              return new Response(JSON.stringify({ status: 'error', message: 'Cookie Signature does not match player address' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' },
              });
            }
          } catch (error) {
            console.error('Signature verification failed:', error);
            return new Response(JSON.stringify({ status: 'error', message: 'Invalid signature' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' },
            });
          }
        } else {
          return new Response(JSON.stringify({ status: 'error', message: 'Missing or invalid signature' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' },
          });
        }


        tx = await contract.startGame(BigInt(gameId), playerAddress);
        receipt = await tx.wait();
        return new Response(
          JSON.stringify({ status: 'success', txHash: tx.hash }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
        );
      
      default:
        return new Response(
          JSON.stringify({ status: 'error', message: 'Invalid action' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
        );
    }
  } catch (error) {
    console.error(`${action} error:`, error);
    return new Response(
      JSON.stringify({ status: 'error', message: error.reason || error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
    );
  }
}
