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
  const body = await request.json(); // Parse JSON body
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

  const { action, gameId, address, score, recaptchaToken } = body;
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
        const nowCreate = Date.now();
        const fifteenMinutes = 25 * 60 * 1000; // 25 minutes in milliseconds
        const lastCallCreate = rateLimitStore.get(sessionId);
        if (lastCallCreate && nowCreate - lastCallCreate < fifteenMinutes) {
          const timeLeft = Math.ceil((fifteenMinutes - (nowCreate - lastCallCreate)) / (60 * 1000));
          return new Response(
            JSON.stringify({ status: 'error', message: `Rate limit exceeded. Try again in ${timeLeft} minutes.` }),
            { status: 429, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
          );
        }
        tx = await contract.createGame();
        receipt = await tx.wait();
        rateLimitStore.set(sessionId, nowCreate);
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
        const nowEnd = Date.now();
        const lastCallEnd = rateLimitStore.get(`${sessionId}:end`);
        const rateLimitSeconds = Number(process.env.ENDGAME_RATE_LIMIT_SECONDS) || 30;
        if (lastCallEnd && nowEnd - lastCallEnd < rateLimitSeconds * 1000) {
          return new Response(
            JSON.stringify({ status: 'error', message: `Rate limit exceeded. Try again in a few seconds.` }),
            { status: 429 }
          );
        }
        rateLimitStore.set(`${sessionId}:end`, nowEnd);

        try {
          // Fetch current highScore from contract
          const gameData = await contract.getGame(gameId);
          const contractHighScore = Number(gameData.highScore.toString());
          console.log('contractHighScore', contractHighScore);
          if (Number(score) <= contractHighScore) {
            return new Response(
              JSON.stringify({ status: 'success', isHighScore: false, highScore: contractHighScore }),
              { status: 200 }
            );
          }
          // Validate only if score >= 2000 and > contractHighScore
          if (Number(score) >= 2000) {
            const SCORE_VARIANCE = Number(process.env.SCORE_VARIANCE);
            let computedScore = 0;

            // Telemetry validation
            if (telemetry && telemetry.length > 0) {
              for (const event of telemetry) {
                if (event.event === 'frame' && event.data?.deltaTime && event.data?.difficulty !== undefined) {
                  computedScore += event.data.deltaTime * 10 * (1 + event.data.difficulty);
                }
              }
            }
            // Stats validation
            if (stats) {
              if (stats.game === 'fly') {
                if (stats.flapsPerSec > 5 || stats.obstaclesDodged > stats.time / 1000) {
                  return new Response(JSON.stringify({ status: 'error', message: 'Suspicious gameplay stats' }), {
                    status: 400,
                  });
                }
              } else if (stats.game === 'shoot') {
                const hitRate = stats.kills / (stats.shots || 1);
                if (hitRate > 0.8 || stats.kills > stats.time / 1000 || Number(score) > stats.kills * 31) {
                  return new Response(JSON.stringify({ status: 'error', message: 'Suspicious gameplay stats' }), {
                    status: 400,
                  });
                }
                computedScore = stats.kills * 31; // Override telemetry for Shoot
              } else if (stats.game === 'jump') {
                if (stats.jumpsPerSec > 3 || stats.obstaclesCleared > stats.time / 1000) {
                  return new Response(JSON.stringify({ status: 'error', message: 'Suspicious gameplay stats' }), {
                    status: 400,
                  });
                }
              }
            }
            // Check score variance
            if (Math.abs(computedScore - Number(score)) > Number(score) * SCORE_VARIANCE) {
              return new Response(JSON.stringify({ status: 'error', message: 'Suspicious score' }), {
                status: 400,
              });
            }
        }
        tx = await contract.endGame(BigInt(gameId), address, BigInt(score));
        receipt = await tx.wait();
        let isHighScore = false;
        try {
          isHighScore = receipt.logs[1].args[3]? true : false;
          // code after new contract deployment is:
          // isHighScore = receipt.logs[0].args[3];
        } catch (error) {
          isHighScore = false;
        }
                
        return new Response(
          JSON.stringify({
            status: 'success',
            txHash: receipt.hash,
            isHighScore,
            highScore: isHighScore ? score : contractHighScore,
          }),
          { status: 200 }
        );
      } catch (error) {
        console.error('End game error:', error);
        return new Response(JSON.stringify({ status: 'error', message: error.message || 'Failed to end game' }), {
          status: 500,
        });
      }

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
        //const { recaptchaToken } = body;
        try {
          const recaptchaResponse = await fetch(
            `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`
          );
          const recaptchaData = await recaptchaResponse.json();
          const recaptchaThreshold = Number(process.env.RECAPTCHA_THRESHOLD) || 0.5;
          if (!recaptchaData.success || recaptchaData.score < recaptchaThreshold) {
            return new Response(JSON.stringify({ status: 'error', message: 'CAPTCHA verification failed' }), {
              status: 403,
            });
          }
        } catch (error) {
          console.error('reCAPTCHA error:', error);
          return new Response(JSON.stringify({ status: 'error', message: 'CAPTCHA verification error' }), {
            status: 500,
          });
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
