// src/app/api/server/route.js
import { ethers } from 'ethers';
import { getCsrfTokens } from 'src/lib/csrfStore';
import {  contractABI,
          CONTRACT_ADDRESS,
          TELEMETRY_SCORE_THRESHOLD,
          TELEMETRY_LIMIT,
          SCORE_DIVISOR_TIME,
          FLY_PARAMETERS,
          SHOOT_PARAMETERS, 
          JUMP_PARAMETERS,
          scaleBaseW, scaleBaseH, minScale,
         } from '../../../constants';

const banMessage = "Yo, not cool! We sniffed out some sus moves. Keep it legit to avoid the banhammer. Play fair and HODL the leaderboard!";
const tooLuckyMessage = "Whoa! Either you're the luckiest player in the crypto-verse or something's fishy. Give it another shot, but keep it real, fam!";
const browserPerfMessage = "Hold up, yo! Looks like either sneaky tricks or a laggy browser. Pump up your rig’s performance and play fair to moon that score!";
const rateLimitStore = new Map();
const gameDurationStore = new Map();
const GAME_MASTER_PRIVATE_KEY = process.env.GAME_MASTER_PRIVATE_KEY;
const PROVIDER_URL = process.env.API_URL;
const RECAPTCHA_START_THRESHOLD = process.env.RECAPTCHA_START_THRESHOLD;

const GAME_RECAPTCHA_END_THRESHOLD = {
  fly: process.env.FLY_RECAPTCHA_END_THRESHOLD,
  shoot: process.env.SHOOT_RECAPTCHA_END_THRESHOLD,
  jump: process.env.JUMP_RECAPTCHA_END_THRESHOLD,
};
// Cluster counts
let clusterCounts = { '1x1': 0, '1x2': 0, '2x2': 0, '2x3': 0, '2x4': 0 };


if (!GAME_MASTER_PRIVATE_KEY || !PROVIDER_URL) {
  throw new Error('Missing GAME_MASTER_PRIVATE_KEY or PROVIDER_URL in environment');
}

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const wallet = new ethers.Wallet(GAME_MASTER_PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, wallet);

// Helper function to get the current nonce
async function getCurrentNonce(address) {
  try {
    const nonce = await provider.getTransactionCount(address, 'pending');
    console.log('nonce',nonce);
    return nonce;
  } catch (error) {
    console.error('Error fetching nonce:', error);
    throw new Error('Failed to fetch nonce');
  }
}

// Helper function to estimate gas price (updated for ethers@6.x)
async function getGasPrice() {
  try {
    const feeData = await provider.getFeeData();
    
    // Log feeData for debugging
    console.log('Fee data from provider:', feeData);

    // Check if EIP-1559 fields are available (Base Sepolia uses EIP-1559)
    if (feeData.maxFeePerGas !== null && feeData.maxPriorityFeePerGas !== null) {
      // Apply a 10% buffer to maxFeePerGas (BigInt arithmetic)
      let maxFeePerGas = (feeData.maxFeePerGas * 110n) / 100n;
      // Ensure maxFeePerGas is at least 1 Gwei to avoid unrealistically low values
      const minMaxFeePerGas = ethers.parseUnits('1', 'gwei'); // 1 Gwei
      maxFeePerGas = maxFeePerGas > minMaxFeePerGas ? maxFeePerGas : minMaxFeePerGas;

      // Ensure maxPriorityFeePerGas is reasonable (at least 0.1 Gwei, max 50% of maxFeePerGas)
      const minPriorityFee = ethers.parseUnits('0.1', 'gwei');
      let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas > minPriorityFee
        ? feeData.maxPriorityFeePerGas
        : minPriorityFee;
      // Cap maxPriorityFeePerGas at 50% of maxFeePerGas to avoid exceeding it
      const maxPriorityFeeCap = maxFeePerGas / 2n;
      maxPriorityFeePerGas = maxPriorityFeePerGas < maxPriorityFeeCap
        ? maxPriorityFeePerGas
        : maxPriorityFeeCap;

      return { maxFeePerGas, maxPriorityFeePerGas };
    } else if (feeData.gasPrice !== null) {
      // Fallback to legacy gasPrice with a 10% buffer (BigInt arithmetic)
      const gasPrice = (feeData.gasPrice * 110n) / 100n;
      return { gasPrice };
    } else {
      throw new Error('No valid gas price data returned from provider');
    }
  } catch (error) {
    console.error('Error fetching gas price:', error);
    // Fallback to reasonable defaults for Base Sepolia (EIP-1559)
    return {
      maxFeePerGas: ethers.parseUnits('2', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('0.1', 'gwei')
    };
  }
}

// Helper function to send transaction with retry logic
async function sendTransaction(txFunction, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const nonce = await getCurrentNonce(wallet.address);
      const gasSettings = await getGasPrice();
      
      // Execute the transaction with explicit nonce and gas settings
      const tx = await txFunction({ nonce, ...gasSettings });
      console.log(`Transaction sent, attempt ${attempt + 1}:`, tx.hash);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', tx.hash);
      return { tx, receipt };
    } catch (error) {
      console.error(`Transaction failed, attempt ${attempt + 1}:`, error);
      attempt++;
      if (attempt === maxRetries) {
        throw new Error(`Transaction failed after ${maxRetries} attempts: ${error.message}`);
      }
      // Wait briefly before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

export async function POST(request) {
  const body = await request.json(); // Parse JSON body
  const appOrigin = request.headers.get('x-app-origin');
  const allowedOrigin = process.env.APP_ORIGIN;

  if (appOrigin !== allowedOrigin) {
    console.log('appOrigin !== allowedOrigin', appOrigin,'!==', allowedOrigin)
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

  // Map game names to their parameter sets
  const GAME_PARAMETERS = {
    fly: FLY_PARAMETERS,
    shoot: SHOOT_PARAMETERS,
    jump: JUMP_PARAMETERS,
  };

  if (!csrfToken || !sessionId || csrfTokens.get(sessionId) !== csrfToken) {
    console.log('!csrfToken || !sessionId || csrfTokens.get(sessionId) !== csrfToken', !csrfToken,'||',!sessionId,' ||', csrfTokens.get(sessionId),'!==', csrfToken);
    return new Response(JSON.stringify({ status: 'error', message: "Security token's gone AWOL or acting sus. Hit F5 to refresh and get back to dominating the leaderboard!" }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' },
    });
  }

  const { action, gameId, address, score, recaptchaTokenStart, recaptchaTokenEnd, telemetry, stats } = body;
  if (!action) {
    console.log('!action', !action);
    return new Response(JSON.stringify({ status: 'error', message: 'Missing action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' },
    });
  }

  try {
    let result;
    switch (action) {
      case 'create-game':
        const nowCreate = Date.now();
        const fifteenMinutes = 15 * 60 * 1000; // 15 minutes in milliseconds
        const lastCallCreate = rateLimitStore.get(sessionId);
        if (lastCallCreate && nowCreate - lastCallCreate < fifteenMinutes) {
          const timeLeft = Math.ceil((fifteenMinutes - (nowCreate - lastCallCreate)) / (60 * 1000));
          console.log('lastCallCreate && nowCreate - lastCallCreate < fifteenMinutes', lastCallCreate,' &&', nowCreate,' -', lastCallCreate,' <', fifteenMinutes);
          return new Response(
            JSON.stringify({ status: 'error', message: `Rate limit exceeded. Try again in ${timeLeft} minutes.` }),
            { status: 429, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
          );
        }
        result = await sendTransaction(async (txOptions) => {
          return await contract.createGame(txOptions);
        });
        console.log
        rateLimitStore.set(sessionId, Date.now());
        console.log('Create game successful:', result.tx.hash);
        return new Response(
          JSON.stringify({ status: 'success', txHash: result.tx.hash }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
        );
      
      case 'start-game':
        if (!gameId || !address) {
          return new Response(
            JSON.stringify({ status: 'error', message: 'Missing gameId or address' }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
          );
        }
        
        try {
          const recaptchaResponse = await fetch(
            `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaTokenStart}`
          );
          const recaptchaData = await recaptchaResponse.json();
          console.log('reCAPTCHA START data:', recaptchaData);
          if (!recaptchaData.success || recaptchaData.score < RECAPTCHA_START_THRESHOLD) {
            return new Response(JSON.stringify({ status: 'error', message: "CAPTCHA's not vibing with your moves. Wiggle that mouse like you're dodging FUD and try again to HODL the score!" }), {
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
        console.log('gameSigRaw',gameSigRaw);
        if (gameSigRaw) {
          try {
            const { message: signedMessage, signature, timestamp } = JSON.parse(gameSigRaw);
            // Verify timestamp is within 2 days (172,800,000 ms = 2 days)
            const currentTime = Date.now();
            const maxAge = 0.5 * 24 * 60 * 60 * 1000; // 0.5 days in milliseconds
            if (Math.abs(currentTime - timestamp) < maxAge) {
              //positive case do nothing
            } else {
              return new Response(JSON.stringify({ status: 'error', message: 'Your signature has gone stale!. Please sign again to keep the vibes legit!' }), {
                  status: 403,
                  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' },
              });
            }
            const expectedMessage = `Yo, no gas, no cash, just legit vibes! Sign to lock in your chips for Stupid Games. Timestamp ${timestamp}. Let's game on!`;
            if (signedMessage !== expectedMessage) { // Verify the message matches the expected constant
              return new Response(JSON.stringify({ status: 'error', message: "Your signature is out of sync! Sus!" }), {
                status: 403,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } },
              );
            }
            playerAddress = ethers.verifyMessage(signedMessage, signature);
            console.log('signature validation for playerAddress',playerAddress, 'address', address);
            if (playerAddress.toLowerCase() !== address.toLowerCase()) {
              return new Response(JSON.stringify({ status: 'error', message: "Your signature is out of sync. Refresh the page and make sure you're logged in with the right wallet to keep the vibes legit!" }), {
                status: 403,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' },
              });
            }
          } catch (error) {
            console.error('Signature verification failed:', error);
            return new Response(JSON.stringify({ status: 'error', message: 'Your signature is invalid' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' },
            });
          }
        } else {
          return new Response(JSON.stringify({ status: 'error', message: 'No sig, no game! Drop Your signature to moon with Stupid Games!' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' },
          });
        }

        console.log('playerAddress',playerAddress);
        result = await sendTransaction(async (txOptions) => {
          return await contract.startGame(BigInt(gameId), playerAddress, txOptions);
        });
        gameDurationStore.set(address, Date.now());
        console.log('Start game successful:', result.tx.hash);
        return new Response(
          JSON.stringify({ status: 'success', txHash: result.tx.hash }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
        );

      case 'end-game':
        //verify that required input fields are present
        if (gameId && address && score) {
          //positive case, do nothing
        } else {
          console.log('!gameId || !address || !score', !gameId,' ||', !address,' ||', !score);
          return new Response(
            JSON.stringify({ status: 'error', message: 'Missing gameId or address or score' }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
          );
        }
        // implement rate limiting for end game
        const nowEnd = Date.now();
        const lastCallEnd = rateLimitStore.get(`${sessionId}:end`);
        const rateLimitSeconds = Number(process.env.ENDGAME_RATE_LIMIT_SECONDS) || 10;
        if (lastCallEnd && nowEnd - lastCallEnd < rateLimitSeconds * 1000) {
          console.log('lastCallEnd && nowEnd - lastCallEnd < rateLimitSeconds * 1000', lastCallEnd, '&&', nowEnd, '-', lastCallEnd, '<', rateLimitSeconds, '* 1000');
          return new Response(
            JSON.stringify({ status: 'error', message: `Rate limit exceeded. Try again in a few seconds.` }),
            { status: 429 }
          );
        }
        rateLimitStore.set(`${sessionId}:end`, nowEnd);

        //get and delete gameDurationStore EARLY as a check to ensure only one end game per start game
        const gameDurationStoreValue = gameDurationStore.get(address);
        gameDurationStore.delete(address);

        //main logic to check telemetry and stats and score and try to send contract transaction
        try {
          // Fetch current highScore from contract to ensure only highscores are validated and submitted
            let gameData;
            try {
              gameData = await contract.getGame(gameId);
              const contractHighScore = Number(gameData.highScore.toString());
              const gameEndTime = Number(gameData.endTime.toString()); // Convert seconds to milliseconds
              if (gameData) {
                // early check and return if game is already over
                if (gameEndTime <= Date.now()/1000) {
                  console.log('gameEndTime <= Date.now()/1000', gameEndTime, '<=', Date.now()/1000);
                  return new Response(JSON.stringify({ status: 'error', message: "Yo, degen! Your score's fire, but this game's already wrapped. Jump into the next round and moon that leaderboard!" }), {
                    status: 400,
                  });
                }
                // early check if score less than high score
                if (Number(score) <= contractHighScore) {
                  console.log('Number(score) <= contractHighScore', Number(score), '<=', contractHighScore);
                  return new Response(
                    JSON.stringify({ status: 'success', isHighScore: false, highScore: contractHighScore }),
                    { status: 200 }
                  );
                }
              } else {
                console.error('Invalid game data:', gameData);
              }
            } catch (error) {
            console.error('Error fetching game data from contract:', error);
            //continue with game validation and submission because not players fault this call failed
            }
          // Validate only if score >= TELEMETRY_SCORE_THRESHOLD and > contractHighScore
          // all telemetry and stats checks go inside this if block
          if (Number(score) >= TELEMETRY_SCORE_THRESHOLD) {
            
            //make sure stats and telemetry are present
            if(stats && telemetry && telemetry.length !== 0) {
              //positive case do nothing
            } else {
              console.log('stats', stats, 'telemetry', telemetry, 'or telemetry.length', telemetry.length, 'is invalid');
              return new Response(JSON.stringify({ status: 'error', message: banMessage }), {
                status: 400,
              });
            }
            if (telemetry.length < TELEMETRY_LIMIT) {
              //positive case do nothing
            } else {
              console.log('telemetry.length',telemetry.length, 'is more than limit', TELEMETRY_LIMIT);
              return new Response(JSON.stringify({ status: 'error', message: tooLuckyMessage }), {
                status: 400,
              });
            }
            
            console.log('telemetry (first 100 events): ', telemetry.slice(0, 100));
            console.log('telemetry (last 100 events): ', telemetry.slice(-100));
            console.log('stats for game: ', {
              address,
              gameId,
              stats, });
            const telemetryLength = telemetry.length;
            console.log('telemetryLength', telemetryLength);
            
            if (stats.game === 'fly' || stats.game === 'jump' || stats.game === 'shoot') {
               //positive case do nothing
            } else {
              console.log('Invalid game name', stats.game);
              return new Response(JSON.stringify({ status: 'error', message: 'Invalid game name' }), { status: 400 });
            }

            //get the game parameters for this specific game
            const RECAPTCHA_END_THRESHOLD = GAME_RECAPTCHA_END_THRESHOLD[stats.game];
            //const gameParams = GAME_PARAMETERS[stats.game];
            const baseGameParams = GAME_PARAMETERS[stats.game];
            // Create a local copy of game parameters with scaling applied
            const gameParams = { ...baseGameParams };
            // scale all game parameters by the scale factor
            gameParams.OBSTACLE_SIZE = baseGameParams.OBSTACLE_SIZE * stats.scale;
            gameParams.SHIP_HEIGHT = baseGameParams.SHIP_HEIGHT * stats.scale;
            gameParams.SHIP_WIDTH = baseGameParams.SHIP_WIDTH * stats.scale;
            gameParams.BASE_OBSTACLE_SPEED = baseGameParams.BASE_OBSTACLE_SPEED * stats.scale;
            gameParams.GRAVITY = baseGameParams.GRAVITY * stats.scale;
            if (stats.game === 'fly') {
              gameParams.FLAP_VELOCITY = baseGameParams.FLAP_VELOCITY * stats.scale;
            }
            if (stats.game === 'jump') {
              gameParams.JUMP_VELOCITY = baseGameParams.JUMP_VELOCITY * stats.scale;
            }            

            try {
              const recaptchaResponse = await fetch(
                `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaTokenEnd}`
              );
              const recaptchaData = await recaptchaResponse.json();
              console.log('reCAPTCHA END data:', recaptchaData);
              if (recaptchaData.success && recaptchaData.score >= RECAPTCHA_END_THRESHOLD) {
                //positive case do nothing
              } else {
                console.log('recaptchaData.success', recaptchaData.success, 'or recaptchaData.score',recaptchaData.score, 'is invalid');
                return new Response(JSON.stringify({ status: 'error', message: "Our CAPTCHA's calling you out—acting a bit too bot-like." }), {
                  status: 403,
                });
              }
            } catch (error) {
              console.error('reCAPTCHA error:', error);
              //continue because backend mistake and not player's fault
              //assume player is human
            }

            //first easy check thats score is 0 in stats
            if (stats.score === 0) {
              //positve case do nothing
            } else {
              console.log('Stats score should be 0', {
                address,
                gameId,
                gameName: stats.game,
            });
              return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
            }
            //ALL games check GAME_PARAMETERS
            const fpsEvents = telemetry.filter(e => e.event === 'fps');
            for (const event of fpsEvents) {
              for (const [key, expectedValue] of Object.entries(gameParams)) {
                if ((key in event.parameters) && event.parameters[key] === expectedValue) {
                  //positve case do nothing
                } else {
                  console.log('Game parameter mismatch', {
                    address,
                    gameId,
                    gameName: stats.game,
                    event,
                    parameter: key,
                    received: event.parameters[key],
                    expected: expectedValue,
                  });
                  return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                }
              }
            }

            //ALL games check ship size in frame events and telemetry score is 0, and
            //common frame events filter for subsequent checks
            const frameEvents = telemetry.filter(e => e.event === 'frame');

            for (const event of frameEvents) {
              if(event.data.height === gameParams.SHIP_HEIGHT && event.data.width === gameParams.SHIP_WIDTH) {
                //positve case do nothing
              } else {
                console.log('Ship dimensions mismatch:', {
                  address,
                  gameId,
                  gameName: stats.game,
                  event,
                  shipHeight: gameParams.SHIP_HEIGHT,
                  shipWidth: gameParams.SHIP_WIDTH,
                  eventShipHeight: event.data.height,
                  eventShipWidth: event.data.width,
                });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              if(event.data.score === 0) {
                //positve case do nothing
              } else {
                console.log('Frame event score should be 0', {
                  address,
                  gameId,
                  gameName: stats.game,
              });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
            }

            const gameTimeSec = stats.time / 1000;
            // All games check that telemetry in in order by time and frameId
            let lastTime = -Infinity;
            let lastFrameId = 0;
            for (let i = 0; i < telemetryLength; i++) {
              const event = telemetry[i];
              // Verify time is non-decreasing
              if (event.time >= lastTime) {
                //positve case do nothing
              } else {
                console.log('Telemetry time order violation', {
                  index: i,
                  eventTime: event.time,
                  lastTime
                });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              lastTime = event.time;

              // Verify frameId is strictly increasing for frame events
              if (event.event === 'frame' || event.event === 'spawn' || event.event === 'flap' || event.event === 'jump') {
                const currentFrameId = event.frameId;
                if (currentFrameId >= lastFrameId) {
                  //positve case do nothing
                } else {
                  console.log('Telemetry frameId order violation', {
                    index: i,
                    currentFrameId,
                    lastFrameId
                  });
                  return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                }
                lastFrameId = currentFrameId;
              }
            }
            // All game check telemetry only one event collision
            const collisionEvents = telemetry.filter(e => e.event === 'collision');
            if (collisionEvents.length === 1 || (collisionEvents.length == 2 && Math.abs(collisionEvents[0].time - collisionEvents[1].time) < 100 )) {
              //positve case do nothing
            } else {
              console.log('Incorrect number of collision events found for', {
                address,
                gameId,
                gameName: stats.game,
                numberEvents: collisionEvents.length,
              });
              return new Response(JSON.stringify({ status: 'error', message: banMessage }), {
                status: 400,
              });
            }
            // All game check that last event is a collision
            const lastEvent = telemetry[telemetryLength - 1];
            const secondLastEvent = telemetry[telemetryLength - 2];
            if (lastEvent.event === 'collision' || secondLastEvent.event === 'collision') {
              //positve case do nothing
            } else {
              console.log('lastEvent.event', lastEvent.event, 'or secondLastEvent.event', secondLastEvent.event, '!== collision');
              return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
            }
            // All gamess Check if server game duration is more than client game duration. With network latency, it can never be less.
            // if client game time is more, or too less by 2 seconds difference, indicates cheating attempts
            const serverDuration = nowEnd - gameDurationStoreValue;
            if (stats.time <= serverDuration) {
              //positive case do nothing
            } else {
                console.log('GameDurationStore Stats Time Check failed for', {
                    address,
                    gameId,
                    gameName: stats.game,
                    gameDurationStore: gameDurationStoreValue,
                    nowEnd,
                    serverDuration,
                    statsTime: stats.time});
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), {
                    status: 400,
                });
            }
            
            // Detect Game Clock Manipulation
            // check telemetry time agains server time only if telemetry length is less than limit
            const telemetryDuration = frameEvents[frameEvents.length-1].time - frameEvents[0].time;
            if (telemetryDuration <= serverDuration) {
              //positive case do nothing
            } else {
              console.log('GameDurationStore Duration Check failed for', {
                address,
                gameId,
                gameName: stats.game,
                gameDurationStore: gameDurationStoreValue,
                nowEnd,
                serverDuration,
                telemetryDuration});  
              return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
            }

            // all games common telemetry check for average fps (frames per second)
            if (fpsEvents.length >= Math.floor(frameEvents.length/10)) {
              //positive case do nothing
            } else {
              console.log('fpsEvents.length < (frameEvents.length/10 - 11)',fpsEvents.length, '<', frameEvents.length,'/10 - 11');
              return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
            }
            const fpsValues = fpsEvents.map(e => e.data.fps);
            const canvasHeightValues = fpsEvents.map(e => e.data.height);
            const canvasWidthValues = fpsEvents.map(e => e.data.width);
            const minFps = Math.min(...fpsValues);
            const maxFps = Math.max(...fpsValues);
            const avgFps = fpsValues.reduce((sum, fps) => sum + fps, 0) / fpsValues.length;
            const minCanvH = Math.min(...canvasHeightValues);
            const maxCanvH = Math.max(...canvasHeightValues);
            const avgCanvH = canvasHeightValues.reduce((sum, fps) => sum + fps, 0) / canvasHeightValues.length;
            const minCanvW = Math.min(...canvasWidthValues);
            const maxCanvW = Math.max(...canvasWidthValues);
            const avgCanvW = canvasWidthValues.reduce((sum, fps) => sum + fps, 0) / canvasWidthValues.length;
            console.log('minFps',minFps, 'maxFps',maxFps, 'avgFps',avgFps);
            console.log('minCanvH',minCanvH, 'maxCanvH',maxCanvH, 'avgCanvH',avgCanvH);
            console.log('minCanvW',minCanvW, 'maxCanvW',maxCanvW, 'avgCanvW',avgCanvW);
            // Allow 40–72 FPS for mobile compatibility. No upper bound as game is harder when faster.
            if (minFps > 55) {
              //positive case do nothing
            } else {
              console.log('minFps',minFps, 'is invalid');
              return new Response(JSON.stringify({ status: 'error', message: browserPerfMessage }), { status: 400 });
            }
            // Check for suspicious FPS variance (e.g., >10 FPS change)
            if (maxFps - minFps <= 7) {
              //positive case do nothing
            } else {
              console.log('maxFps - minFps > 7',maxFps,' -', minFps, '>',' 7');
              return new Response(JSON.stringify({ status: 'error', message: browserPerfMessage }), { status: 400 });
            }
            if (Math.abs(maxCanvH - minCanvH) < 1 && Math.abs(avgCanvH - stats.canvasHeight) < 1 ) {
              //positive case do nothing
            } else {
              console.log('maxCanvH - minCanvH > 1 || avgCanvH - stats.canvasHeight > 1 ',maxCanvH - minCanvH,' > 1 || ',avgCanvH - stats.canvasHeight,' > 1 ');
              return new Response(JSON.stringify({ status: 'error', message: browserPerfMessage }), { status: 400 });                
            }
            // check min max canvas size
            if (avgCanvH-1 <= 900 && avgCanvH+1 >= 400 && avgCanvW-1 <= 1008 && avgCanvW+1 >= 300) {
              //positive case do nothing
            } else {
              console.log('avgCanvH < 900 && avgCanvH > 400 && avgCanvW < 1008 && avgCanvW > 300',avgCanvH,'< 900 &&', avgCanvH,'> 400 &&', avgCanvW,'< 1008 &&', avgCanvW,'> 300');
              return new Response(JSON.stringify({ status: 'error', message: browserPerfMessage }), { status: 400 });
            }
            
            // check screen scaling factor against stats.scale
            const screenScalingFactor = Math.max(avgCanvW/scaleBaseW, avgCanvH/scaleBaseH, minScale);
            console.log('screenScalingFactor',screenScalingFactor, 'stats.scale', stats.scale);
            if (Math.abs(stats.scale - screenScalingFactor) < 0.001) {
              //positive case do nothing
            } else {
              console.log('screenScalingFactor',screenScalingFactor, 'doesnt match stats.scale', stats.scale);
              return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 }); 
            }

            // All games check that difficultyFactor progresses correctly.
            const gameStartTime = telemetry[0].time;
            // loop over frame events and check difficulty factor progress
            for (const event of frameEvents) {
              const elapsedTimeSec = ((event.time - gameStartTime) / 1000); //divide by 1000 to convert to seconds
              const difficultyFactor = Math.min(elapsedTimeSec / gameParams.DIFFICULTY_FACTOR_TIME, 1);
              if (event.data.difficulty >= difficultyFactor - 0.001) {
                //positive case do nothing
              } else {
                  console.log('Difficulty factor progression check failed', { 
                    address,
                    gameId,
                    gameName: stats.game,
                    event,
                    difficultyFactor,
                    eventDifficulty: event.data.difficulty,
                  });
                    return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                }
            }

            // All games Check for identical deltaTime values (suspicious for manipulation)
            const frameDeltaTimes = frameEvents.map(e => e.data.deltaTime);
            const totalFrameDeltaTime = frameDeltaTimes.reduce((a, b) => a + b, 0)
            const avgFrameDeltaTime = totalFrameDeltaTime / frameDeltaTimes.length;
            const frameDeltaTimieVariance = frameDeltaTimes.reduce((a, b) => a + Math.pow(b - avgFrameDeltaTime, 2), 0) / frameDeltaTimes.length;
            console.log('frameDeltaTimieVariance',frameDeltaTimieVariance.toString());
            //***************for mobile 0.006 but for desktop 0.0000001 to 0.001
            if (frameDeltaTimieVariance > 0.0000001 && frameDeltaTimieVariance < 0.006) { // 0.0000001 to 0.001 s²
              //positive case do nothing
            } else {
              console.log('Delta time variance check failed for',{ 
                address,
                gameId,
                gameName: stats.game,
                frameDeltaTimieVariance,
              });
              return new Response(JSON.stringify({ status: 'error', message: browserPerfMessage }), { status: 400 });
            }
            //all games check total telemetry frame delta time against stats.time/1000=gameTimeSec
            if (totalFrameDeltaTime < gameTimeSec  * 1.01 && totalFrameDeltaTime > gameTimeSec * 0.99) { //1% variance allowed
              //positive case do nothing
            } else {
              console.log('Frame delta time and stats total time mismatch', {
                address,
                gameId,
                gameName: stats.game,
                totalFrameDeltaTime,
                gameTimeSec,
              })
              return new Response(JSON.stringify({ status: 'error', message: browserPerfMessage }), {
                status: 400,
              });
            }
                                    
            //All games events filtered required
            const spawnEvents = telemetry.filter(e => e.event === 'spawn');

            // Validate spawn events vs. obstacles cleared and maxObstacles
            // need to modify for shoot (obstaclesCleared should equal kills)
            if (stats.obstaclesCleared >= spawnEvents.length - stats.maxObstacles &&
              stats.obstaclesCleared <= spawnEvents.length) {
                //positive case do nothing
            } else {
              console.log('Spawn events count mismatch', {
                  address,
                  gameId,
                  gameName: stats.game,
                  obstaclesCleared: stats.obstaclesCleared,
                  maxObstacles: stats.maxObstacles,
                  spawnEventsCount: spawnEvents.length
              });
              return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
            }

            // obsData validation for maxObstaclesInPool vs stats.maxObstacles
            // need to check if it works for shoot too
            let maxObstaclesInPool = 0;
            for (const event of frameEvents) {
              maxObstaclesInPool = Math.max(maxObstaclesInPool, event.obsData.obstacles.length);
            }
            let maxObstaclesTolerance = stats.game === 'jump' ? 8 : 2;
            if (Math.abs(maxObstaclesInPool - stats.maxObstacles) <= maxObstaclesTolerance) {
              //positive case do nothing
            } else {
              console.log('Invalid maxObstaclesInPool vs stats.maxObstacles', {
                address,
                gameId,
                gameName: stats.game,
                maxObstaclesInPool,
                maxObstaclesStats: stats.maxObstacles,
              });
              return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
            }
            console.log('maxObstaclesInPool',maxObstaclesInPool);

            // ALL Games Combined loop for size, speed and spawn frequency checks
            let prevSpawnEvent = null;
            for (const event of spawnEvents) {
              // Size check
              if (event.data.width === gameParams.OBSTACLE_SIZE && event.data.height === gameParams.OBSTACLE_SIZE) {
                //positive case do nothing
              } else {
                console.log('Invalid obstacle size', { actualWidth: event.data.width, actualHeight: event.data.height });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              // Speed check
              const elapsedTimeSec = ((event.time - gameStartTime) / 1000);
              const difficultyFactor = Math.min(elapsedTimeSec / gameParams.DIFFICULTY_FACTOR_TIME, 1);
              const expectedSpeed = gameParams.BASE_OBSTACLE_SPEED * (1 + difficultyFactor);
              // if actual speed is faster (more -ve, i.e. lower) than the expected speed with 0.002 tolerance
              if (event.data.speed <= expectedSpeed + 0.002) {
                //positive case do nothing
              } else {
                  console.log('Obstacle speed check failed', { 
                      address,
                      gameId,
                      gameName: stats.game,
                      event,
                      expectedSpeed,
                      actualSpeed: event.data.speed,
                      difficultyFactor
                  });
                  return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              // Check for spawn event gap time consitency with difficulty factor
              if (prevSpawnEvent) {
                const timeGap = event.time - prevSpawnEvent.time; // ms
                const expectedMinGap = gameParams.MAX_SPAWN_INTERVAL * (1 - difficultyFactor) + gameParams.MIN_SPAWN_INTERVAL;
                const tolerance = 34; // ms, for timing jitter approx 2 frames
                if (Math.abs(timeGap - expectedMinGap) <= tolerance || timeGap < tolerance) {
                  //positive case do nothing
                } else {
                  console.log('Invalid spawn gap', { 
                      address,
                      gameId,
                      gameName: stats.game,
                      event,
                      timeGap,
                      expectedMinGap,
                      tolerance,
                      difficultyFactor,
                  });
                  return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                }
              }
              prevSpawnEvent = event;

            }
            

            // common duration, score and ship position checks for FLY and JUMP
            if (stats.game === 'fly' || stats.game === 'jump') {
              
              // TIME based games Check if score is less than client side game duration with 1 seconds tolerance for start game
              if (score < (stats.time + 1000)/SCORE_DIVISOR_TIME) { // one second variance 
                //positive case do nothing
              } else {
                console.log('Duration and score check failed for', {
                  address,
                  gameId,
                  gameName: stats.game,
                  score,
                  scoreVariance: (stats.time + 1000)/SCORE_DIVISOR_TIME});
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), {
                  status: 400,
                });
              }
              // TIME based games telemetry computed score validation
              let computedScore = totalFrameDeltaTime * gameParams.SCORE_MULTIPLIER;
              console.log('computedScore max', computedScore * 1.01); // 1 percent variance
              if (Number(score) < computedScore * 1.1) {
                //positive case do nothing
              } else {
                console.log('Number(score) > computedScore * 1.1', Number(score), '>', computedScore, '* 1.1');
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              // Static x position games check ship x position
              // check ship start position
              if (stats.shipX === stats.canvasWidth * 0.15) {
                //positve case do nothing
              } else {
                console.log('Stats score should be 0', {
                  address,
                  gameId,
                  statsShipX: stats.shipX,
                  shipX: stats.canvasWidth * 0.15,
              });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              // check each frame event ship position
              for (const event of frameEvents) {
                if(event.data.x === stats.shipX) {
                  //positive case do nothing
                } else {
                  console.log('Ship x position mismatch:', {
                    address,
                    gameId,
                    gameName: stats.game,
                    statsShipPosition: stats.shipX,
                    eventShipPosition: event.data.x,
                  });
                  return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                }
              }

              //check and count clusters
              // check later if this works for shoot. cluster is not important in shoot
              let clusterW = 0;
              let clusterH = 0;
              clusterCounts = { '1x1': 0, '1x2': 0, '2x2': 0, '2x3': 0, '2x4': 0 };
              // Group spawn events by frameId
              const spawnGroups = {};
              for (const event of spawnEvents) {
                if (!spawnGroups[event.frameId]) {
                  spawnGroups[event.frameId] = [];
                }
                spawnGroups[event.frameId].push(event);
              }
              // Validate each spawn group
              for (const frameId in spawnGroups) {
                //group length is the number of obstacles in this cluster
                const obstacleCount = spawnGroups[frameId].length;
                if (obstacleCount === 1) {
                  // 1x1 cluster
                  clusterW = 1;
                  clusterH = 1;
                } else if (obstacleCount === 2) {
                  // 1x2 cluster
                  clusterW = 1;
                  clusterH = 2;
                } else if (obstacleCount === 4) {
                  // 2x2 cluster
                  clusterW = 2;
                  clusterH = 2;
                } else if (obstacleCount === 6) {
                  // 2x3 cluster
                  clusterW = 2;
                  clusterH = 3;
                } else if (obstacleCount === 8) {
                  // 2x4 cluster
                  clusterW = 2;
                  clusterH = 4;
                } else {
                  // no valid cluster size
                  console.log('Invalid cluster configuration', { frameId, obstacleCount, spawnGroups: spawnGroups[frameId] });
                  return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                }
                // Increment cluster count
                const clusterKey = `${clusterW}x${clusterH}`;
                clusterCounts[clusterKey]++;
              }
              // Log cluster counts for debugging
              console.log('Cluster counts', clusterCounts);

            } // end if FLY or JUMP only
            
   
			      // Stats validation and telemetry validation specific to each Game
            // JUMP GAME
            if (stats.game === 'jump') {

              //JUMP SPAWN RELATED VALIDATIONS
              // validate that all types of cluster sizes are present at least once
              if (clusterCounts['1x1'] >= 4 &&
                  clusterCounts['1x2'] >= 4 &&
                  clusterCounts['2x2'] >= 4 &&
                  clusterCounts['2x4'] >= 1 ) {
                //positive case do nothing
              } else {
                console.log('All cluster types are not present', {
                  gameId,
                  address,
                  clusterCounts,
                });
                return new Response(JSON.stringify({ status: 'error', message: tooLuckyMessage }), { status: 400 });
              }
              // Check y-position of obstacles and count clusters (Jump only)
              const GROUND_Y = avgCanvH * gameParams.GROUND_HEIGHT_RATIO - gameParams.SHIP_HEIGHT;
              console.log('GROUND_Y', GROUND_Y);
              const yPosA = GROUND_Y;
              const yPosB = GROUND_Y - gameParams.OBSTACLE_SIZE;
              const yPosC = GROUND_Y - 2 * gameParams.OBSTACLE_SIZE;
              const yPosD = GROUND_Y - 3 * gameParams.OBSTACLE_SIZE;
              let yCountA = 0; // GROUND_Y
              let yCountB = 0; // GROUND_Y - OBSTACLE_SIZE
              let yCountC = 0; // GROUND_Y - 2 * OBSTACLE_SIZE
              let yCountD = 0; // GROUND_Y - 3 * OBSTACLE_SIZE
              // for clusterCounts measurement
              let yCountAA = clusterCounts['1x1'] + clusterCounts['1x2'] + clusterCounts['2x2'] * 2 + clusterCounts['2x3'] * 2 + clusterCounts['2x4'] * 2; // GROUND_Y
              let yCountBB = clusterCounts['1x2'] + clusterCounts['2x2'] * 2 + clusterCounts['2x3'] * 2 + clusterCounts['2x4'] * 2; // GROUND_Y - OBSTACLE_SIZE
              let yCountCC = clusterCounts['2x3'] * 2 + clusterCounts['2x4'] * 2; // GROUND_Y - 2 * OBSTACLE_SIZE
              let yCountDD = clusterCounts['2x4'] * 2; // GROUND_Y - 3 * OBSTACLE_SIZE
              //reset cluster counts array
              clusterCounts = { '1x1': 0, '1x2': 0, '2x2': 0, '2x3': 0, '2x4': 0 };
              const yTolerance = 0.01; // For floating-point comparison
              console.log('spawnEvents.length', spawnEvents.length);
              const spawnEventY = [];
              for (const event of spawnEvents) {
                // Validate y-position
                spawnEventY.push(event.data.y);
                const y = event.data.y;
                if (Math.abs(y - yPosA) < yTolerance) {
                    yCountA++;
                } else if (Math.abs(y - yPosB) < yTolerance) {
                    yCountB++;
                } else if (Math.abs(y - yPosC) < yTolerance) {
                    yCountC++;
                } else if (Math.abs(y - yPosD) < yTolerance) {
                    yCountD++;
                } else {
                    console.log('Invalid obstacle y position', { frameId: event.frameId, y, validYPositions: [yPosA, yPosB, yPosC, yPosD] });
                    return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                }
              }
              // Compare positional counts
              if (yCountA === yCountAA &&
                  yCountB === yCountBB &&
                  yCountC === yCountCC &&
                  yCountD === yCountDD) {
                //positive case do nothing
              } else {
                console.log('Invalid y-position counts', {yCountA, yCountAA, yCountB, yCountBB, yCountC, yCountCC, yCountD, yCountDD});
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }

              //validate that spawn events and y position counts are equal
              if (spawnEvents.length === yCountA + yCountB + yCountC + yCountD) {
                //positive case do nothing
              } else {
                console.log('Invalid spawn events and y position counts', 
                  { spawnEventsLength: spawnEvents.length,
                    yPosCounts: yCountA + yCountB + yCountC + yCountD});
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              //end JUMP SPAWN RELATED VALIDATIONS
              //JUMPING RELATED VALIDATIONS
              const jumpEvents = telemetry.filter(e => e.event === 'jump');
              console.log('jumpEvents.length',jumpEvents.length);

              // validate jumpEvents.length and stats.jump
              if (jumpEvents.length == stats.jumps) {
                //positive case do nothing
              } else {
                console.log('Suspicious jumpEvents vs stats.jumps', {
                  statsJumps: stats.jumps,
                  jumpEventsLength: jumpEvents.length,
                });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              // Count jumps using both methods
              let posSingleJumpCount = 0;
              let posDoubleJumpCount = 0;
              let timeSingleJumpCount = 0;
              let timeDoubleJumpCount = 0;
              let lastJumpEvent = jumpEvents[0];
              let prevTime = lastJumpEvent.time;
              const doubleJumpIntervals = [];
              // Process remaining jumps
              for (const event of jumpEvents) {
                //handle differently for first jump event
                if (event == lastJumpEvent) {
                  if (Math.abs(event.data.y - GROUND_Y) <= 0.01) {
                    //positive case do nothing
                  } else {
                    console.log('Suspicious first jump vs ground', {
                      shipY: event.data.y,
                      GROUND_Y,
                    });
                    return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });    
                  }
                  posSingleJumpCount++;
                  timeSingleJumpCount++;
                  continue;
                }
                //for all other jump events, check ground position
                if (Math.abs(event.data.y - GROUND_Y) < 2) {
                  //on the ground first of double jump or only jump
                  posSingleJumpCount++;
                } else if (event.data.y <= GROUND_Y - 2) {
                  //in the air second of double jump
                  posDoubleJumpCount++;
                }
                //for all other jump events, check time difference
                if (event.time - prevTime > gameParams.DOUBLE_PRESS_THRESHOLD) {
                  //long time so first of double jump or only jump
                  timeSingleJumpCount++;
                } else if (event.time - prevTime <= gameParams.DOUBLE_PRESS_THRESHOLD) {
                  //less time so second of double jump
                  timeDoubleJumpCount++;
                  // Store double jump interval
                  doubleJumpIntervals.push(event.time - prevTime);
                }
                if (event.time - prevTime < 50) { // 50ms minimum human reaction time
                  console.log('Suspiciously fast jump', {
                    event,
                    timeDiff: event.time - prevTime,
                    lastJumpEvent,
                  });
                  return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                }
                //set previous time before closing the loop
                prevTime = event.time;
                lastJumpEvent = event;
              }
              
              // Validate single and double jump counts
              if (posSingleJumpCount === timeSingleJumpCount && posDoubleJumpCount === timeDoubleJumpCount) {
                // positive case do nothing
              } else {
                console.log('Jump count mismatch between methods', {
                  posSingleJumpCount,
                  posDoubleJumpCount,
                  timeSingleJumpCount,
                  timeDoubleJumpCount
                });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              // Validate total jumps
              if (jumpEvents.length === posSingleJumpCount + posDoubleJumpCount) {
                // positive case do nothing
              } else {
                console.log('Total jump count mismatch', {
                  totalJumps: posSingleJumpCount + posDoubleJumpCount,
                  expectedJumps: jumpEvents.length,
                  posSingleJumpCount,
                  posDoubleJumpCount
                });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              // Validate double jump intervals variance
              // Check variance of double jump intervals
              const dJmean = doubleJumpIntervals.reduce((sum, d) => sum + d, 0) / doubleJumpIntervals.length;
              const dJvariance = doubleJumpIntervals.reduce((sum, d) => sum + Math.pow(d - dJmean, 2), 0) / doubleJumpIntervals.length;
              const dJvarianceThreshold = 100; // ms², to be adjusted with playtest data
              console.log('Double jump interval variance check', { dJvariance, dJvarianceThreshold, dJmean });
              if (dJvariance > dJvarianceThreshold) {
                //positive case do nothing 
              } else {
                console.log('Suspiciously consistent double jump timing', {
                  variance: dJvariance,
                  varianceThreshold: dJvarianceThreshold,
                  doubleJumpIntervals,
                  mean: dJmean,
                });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              
              
              // Validate Jump Frequency
              const jumpCount = jumpEvents.length;
              const expectedJumpsPerSec = jumpCount / gameTimeSec;
              if (Math.abs(stats.jumpsPerSec - expectedJumpsPerSec) < 0.005) {
                //positive case do nothing
              } else {
                console.log('Suspicious jumpsPerSec vs jump events', {
                  statsJumpsPerSec: stats.jumpsPerSec,
                  expectedJumpsPerSec,
                });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }

              // Existing jumpsPerSec vs inputsPerSec check more inputs since some triple jumps not counted
              if (stats.jumpsPerSec <= stats.inputsPerSec) {
                //positive case do nothing
              } else {
                console.log('Suspicious jumpsPerSec vs inputsPerSec', {
                  statsJumpsPerSec: stats.jumpsPerSec,
                  statsInputsPerSec: stats.inputsPerSec,
                });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }

              // Existing min/max jumps per second checks
              if (stats.jumpsPerSec > 0.2 && stats.jumpsPerSec < 1.4) {
                //positive case do nothing
              } else {
                console.log('stats.jumpsPerSec is out of range', {
                  statsJumpsPerSec: stats.jumpsPerSec,
                  minJumpsPerSec: 0.2,
                  maxJumpsPerSec: 1.4,
                });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              //end JUMPING RELATED VALIDATIONS

              // JUMP FULL GAME PHYSICS SIMULATION
              // This block simulates the entire game physics for the "jump" game mode.
              // It validates the ship's position, velocity, and interactions with obstacles frame by frame.
              // The simulation ensures that the reported telemetry matches expected physics behavior,
              // including gravity, jump mechanics, obstacle movements, and collision detection.
              // JUMP FULL GAME PHYSICS SIMULATION
              let activeObstacles = [];
              let lastFrame = telemetry.find(e => e.event === 'frame');
              let stopFrame = telemetry.reverse().find(e => e.event === 'frame');
              telemetry.reverse(); // Restore original order
              const shipStartX = stats.canvasWidth * 0.15;
              let currentY = lastFrame.data.y;
              let currentVy = lastFrame.data.vy;
              let lastTime = lastFrame.time;
              let lastFrameId = lastFrame.frameId;
              const perFrameDeltaTime = 1 / avgFps;
              // Array to store normalized distances (in seconds) at jump events
              const jumpObstacleDistances = [];

              // Check that stop frame is within range of stats.framesCount
              if (stopFrame.frameId >= stats.framesCount - 10 && stopFrame.frameId <= stats.framesCount) {
              // Positive case
              } else {
                console.log('last frame is out of range of stats.framesCount', {
                lastFrameId: stopFrame.frameId,
                statsFramesCount: stats.framesCount,
              });
              return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }

              // Initialize obstacles
              if (lastFrame.obsData && lastFrame.obsData.obstacles) {
                activeObstacles = lastFrame.obsData.obstacles.map(obs => ({ ...obs }));
              }

              for (const event of telemetry) {
                if (event === lastFrame || event.frameId < 10 || event.event === 'fps') continue;
                if (event.event === 'collision' || event === stopFrame) break;

                const framesElapsed = event.frameId - lastFrameId;
                const expectedTime = framesElapsed * perFrameDeltaTime * 1000;
                const actualTime = event.time - lastTime;
                if (Math.abs(actualTime - expectedTime) < 100) {
                  // Positive case
                } else {
                  console.log('Time inconsistency', { event, lastFrameId, actualTime, expectedTime });
                  return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                }

                // Simulate frame by frame physics
                for (let i = lastFrameId + 1; i <= event.frameId; i++) {
                  // Update ship physics
                  currentVy += gameParams.GRAVITY; // Apply gravity
                  currentY += currentVy; // Update position
                  //if (currentY >= GROUND_Y && lastFrame.event !== 'jump') {
                  if (currentY > GROUND_Y) {
                    currentY = GROUND_Y;
                    currentVy = 0;
                  }
                  // Update obstacle positions
                  activeObstacles.forEach(obs => {
                    obs.x += obs.dx; // Scale obstacle movement by delta time
                  });
                  // Remove off-screen obstacles
                  activeObstacles = activeObstacles.filter(obs => obs.x >= 0);
                  // Check for collisions
                  const shipCenterX = shipStartX + gameParams.SHIP_WIDTH / 2;
                  const shipCenterY = currentY + gameParams.SHIP_HEIGHT / 2;
                  for (const obs of activeObstacles) {
                    const obsCenterX = obs.x + gameParams.OBSTACLE_SIZE / 2;
                    const obsCenterY = obs.y + gameParams.OBSTACLE_SIZE / 2;
                    const distance = Math.sqrt(
                      Math.pow(shipCenterX - obsCenterX, 2) + Math.pow(shipCenterY - obsCenterY, 2)
                    );
                    if (distance >= (gameParams.SHIP_WIDTH + gameParams.OBSTACLE_SIZE) / 2) {
                      // Positive case
                    } else {
                      console.log('Suspicious unreported obstacle collision', { frameId: event.frameId + i, shipX: shipStartX, shipY: currentY, obs });
                      return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                    }
                  }
                }

                // Handle event-specific logic
                if (event.event === 'spawn') {
                  activeObstacles.push({
                    x: event.data.w*gameParams.OBSTACLE_SIZE + stats.canvasWidth,
                    y: event.data.y,
                    dx: event.data.speed,
                    width: gameParams.OBSTACLE_SIZE,
                    height: gameParams.OBSTACLE_SIZE,
                    dodged: false
                  });
                } else if (event.event === 'jump') {
                  if (event.data.x === shipStartX) {
                    // Positive case
                  } else {
                    console.log('Ship out of start x position', { event, shipStartX });
                    return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                  }
                  currentVy = gameParams.JUMP_VELOCITY;
                  if (Math.abs(event.data.y - currentY) < 0.001) {
                    // Positive case
                  } else {
                    console.log('Jump position check failed', { event, expectedY: currentY, actualY: event.data.y });
                    return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                  }
                  if (Math.abs(event.data.vy - gameParams.JUMP_VELOCITY) < 0.001) {
                    // Positive case
                  } else {
                    console.log('Jump velocity check failed', { event, expectedVy: gameParams.JUMP_VELOCITY, actualVy: event.data.vy });
                    return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                  }
                  // Calculate distance to closest obstacle
                  if (activeObstacles.length > 0) {
                    const distances = activeObstacles
                      .filter(obs => obs.x > shipStartX) // Consider only obstacles ahead
                      .map(obs => ({
                        distance: obs.x - shipStartX,
                        normalizedDistance: (obs.x - shipStartX) / Math.abs(obs.dx) // Time to reach ship
                      }));
                    if (distances.length > 0) {
                      const closest = distances.reduce((min, curr) =>
                        curr.distance < min.distance ? curr : min
                      );
                      // only relevant jump distance
                      if (closest.normalizedDistance < 40) {
                        jumpObstacleDistances.push(closest.normalizedDistance);
                      }
                    }
                  }
                } else if (event.event === 'frame') {
                  if (Math.abs(event.data.y - currentY) < 0.001) {
                    // Positive case
                  } else {
                    console.log('Frame position check failed', { event, expectedY: currentY, actualY: event.data.y });
                    return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                  }
                  if (Math.abs(event.data.vy - currentVy) < 0.001) {
                    // Positive case
                  } else {
                    console.log('Frame velocity check failed', { event, expectedVy: currentVy, actualVy: event.data.vy });
                    return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                  }
                  const reportedObstacles = event.obsData.obstacles;
                  for (const activeObs of activeObstacles) {
                    if (activeObs.x + gameParams.OBSTACLE_SIZE >= 0) {
                      const matchingObs = reportedObstacles.find(obs =>
                        Math.abs(obs.y - activeObs.y) < 0.001 &&
                        Math.abs(obs.x - activeObs.x) < Math.abs(activeObs.dx)*1.5 &&
                        Math.abs(obs.dx - activeObs.dx) < 0.001
                      );
                      if (matchingObs) {
                        // Positive case
                      } else {
                        console.log('Suspicious obstacle disappearance', {
                          frameId: event.frameId,
                          missingObs: activeObs,
                          reportedObstacles,
                          activeObstacles,
                        });
                        return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                      }
                    }
                  }
                  currentVy = event.data.vy;
                }
                lastFrame = event;
                lastFrameId = event.frameId;
                lastTime = event.time;
              }
              // End JUMP FULL GAME PHYSICS SIMULATION
              // Check variance of jump distances for suspicious values
              const mean = jumpObstacleDistances.reduce((sum, d) => sum + d, 0) / jumpObstacleDistances.length;
              const variance = jumpObstacleDistances.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / jumpObstacleDistances.length;
              const varianceThreshold = 10; // adjust based on test data
              console.log('Jump distance variance', { variance, varianceThreshold});
              if (variance > varianceThreshold) {
                //positive case do nothing
              } else {
                console.log('Suspiciously consistent jump distances', {
                  variance,
                  jumpObstacleDistances,
                  mean
                });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              
              //end JUMP GAME


            // FLY GAME
            } else if (stats.game === 'fly') {
              
              // SPAWN RELATED VALIDATION
              // Extract y positions from all obstacles in obsData
              const yPositionsFrames = [];
              for (const event of frameEvents) {
                if (event.obsData && event.obsData.obstacles) {
                  event.obsData.obstacles.forEach(obstacle => {
                    yPositionsFrames.push(obstacle.y);
                  });
                }
              }
              const yPositionsSpawns = [];
              for (const event of spawnEvents) {
                yPositionsSpawns.push(event.data.y);
              }
              //get unique y positions which should be all unique spawns
              const uniqueYPositions = new Set(yPositionsFrames);
              const uniqueYPositionsSpawn = new Set(yPositionsSpawns);
              //check that all uniqe spawn positions and unique obsdata positions are the same tolerance 1 cluster frame event
              if (uniqueYPositions.size <= uniqueYPositionsSpawn.size && uniqueYPositions.size >= uniqueYPositionsSpawn.size -2) {
                //positive case do nothing
              } else {
                console.log('uniqueYPositions',uniqueYPositions,'uniqueYPositionsSpawn',uniqueYPositionsSpawn,'size not equal');
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              uniqueYPositions.forEach(y => {
                if (uniqueYPositionsSpawn.has(y)) {
                  //positive case do nothing
                } else {
                  console.log(`Mismatch: y position ${y} from uniqueYPositions not found in uniqueYPositionsSpawn`, uniqueYPositionsSpawn);
                  return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                }
              });
              // Additional check to ensure all elements in uniqueYPositionsSpawn are in uniqueYPositions
              let spawnMissing = 0;
              uniqueYPositionsSpawn.forEach(y => {
                if (!uniqueYPositions.has(y))
                  spawnMissing++;
              });
              if (spawnMissing <= 2){
                //positive case do nothing
              } else {
                console.log('Missing y positions from uniqueYPositionsSpawn not found in uniqueYPositions', {uniqueYPositionsSpawn, uniqueYPositions});
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }

              //check that the nuber of spawn events is equal to unique obsdata positions with 1 cluster frame event variance
              console.log('uniqueYPositions.size',uniqueYPositions.size, 'spawnEvents.length',spawnEvents.length);
              if(uniqueYPositions.size >= spawnEvents.length-2 && uniqueYPositions.size <= spawnEvents.length){
                //positive case do nothing
              } else {
                console.log('uniqueYPositions and spawns mismatch', {
                  address,
                  uniqueYPositions: uniqueYPositions.size,
                  spawns: spawnEvents.length,
                });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              // Perform chi-squared test for uniform distribution
              const playableHeight = avgCanvH - gameParams.OBSTACLE_SIZE;
              const numBins =  Math.floor(playableHeight/gameParams.OBSTACLE_SIZE); // Divide playable height into OBSTACLE_SIZE bins
              console.log('numBins', numBins);
              const binSize = playableHeight / numBins;
              const observedFrequencies = Array(numBins).fill(0);
              // Assign y positions to bins
              let isInvalidYPosition = false;
              uniqueYPositionsSpawn.forEach(y => {
                if (y >= 0 && y <= avgCanvH - gameParams.OBSTACLE_SIZE) {
                  const binIndex = Math.min(Math.floor(y / binSize), numBins - 1);
                  observedFrequencies[binIndex]++;
                }
                else {
                  console.log('Invalid y-position detected:', y);
                  isInvalidYPosition = true;
                }
              });
              if (isInvalidYPosition)
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              
              console.log('Observed frequencies:', observedFrequencies);

              //calculate variance between min and max
              let minObserved = Math.min(...observedFrequencies);
              let maxObserved = Math.max(...observedFrequencies);
              if(minObserved >= (maxObserved/2) * 0.5) {
                //positive case do nothing
              } else {
                console.log('Insufficient variable obstacle y position spawns in min bin', {
                  address,
                  gameId,
                  gameName: stats.game,
                  minObserved,
                  maxObserved,
                });
                // enable after more testing ********* doesnt seem to work
                //return new Response(JSON.stringify({ status: 'error', message: tooLuckyMessage }), { status: 400 });
              }
              if(minObserved >= 2) {
                //positive case do nothing
              } else {
                console.log('Insufficient fixed obstacle y position spawns in min bin', {
                  address,
                  gameId,
                  gameName: stats.game,
                  minObserved,
                  maxObserved,
                });
                return new Response(JSON.stringify({ status: 'error', message: tooLuckyMessage }), { status: 400 });
              }

              // Calculate chi-squared statistic
              let chiSquared = 0;
              // Expected frequency for uniform distribution
              const expectedFrequency = (uniqueYPositionsSpawn.size) / (numBins);
              for (let i = 0; i < numBins; i++) {
                const observed = observedFrequencies[i];
                const diff = observed - expectedFrequency;
                chiSquared += (diff * diff) / expectedFrequency;
              }
              // Critical value for chi-squared test with 9 degrees of freedom (numBins - 1)
              // at 95% confidence level (alpha = 0.05) is approximately 16.919
              const CHI_SQUARED_CRITICAL_VALUE = 22;
              console.log('Chi-squared statistic:', chiSquared, 'max chi: 22');
              if (chiSquared <= CHI_SQUARED_CRITICAL_VALUE) {
                //positive case do nothing
              } else {
                console.log('Suspicious obstacle y position distribution', {
                  address,
                  gameId,
                  gameName: stats.game,
                  chiSquared,
                  observedFrequencies,
                });
                return new Response(JSON.stringify({
                  status: 'error',
                  message: 'Obstacle y positions show suspicious distribution',
                }), { status: 400 });
              }
              
              
              // Dynamic spawn count, double spawn count, and max obstacle count caluculations 
              let doubleSpawnCount = clusterCounts['1x2'];
              // reset cluster counts array
              clusterCounts = { '1x1': 0, '1x2': 0, '2x2': 0, '2x3': 0, '2x4': 0 };
              let expectedSpawns = 0;
              let expectedDoubleSpawns = 0;
              let expectedMaxObstacles = 0;
              for (let t = 0; t < gameTimeSec; t++) {
                const difficultyFactor = Math.min(t / gameParams.DIFFICULTY_FACTOR_TIME, 1);
                const spawnInterval = (gameParams.MAX_SPAWN_INTERVAL/1000) * (1 - difficultyFactor) + gameParams.MIN_SPAWN_INTERVAL/1000; // in seconds
                const clusterChance = difficultyFactor * gameParams.CLUSTER_CHANCE;
                const spawnsPerSecond = 1 / spawnInterval;
                const obstacleSpeed = Math.abs(gameParams.BASE_OBSTACLE_SPEED * (1 + difficultyFactor)); // pixels per frame
                const timeToCross = stats.canvasWidth / obstacleSpeed * (1 / avgFps); // seconds to cross screen
                const maxObstaclesAtTime = timeToCross * spawnsPerSecond * (1 + clusterChance);
                expectedMaxObstacles = Math.max(expectedMaxObstacles, maxObstaclesAtTime);
                expectedSpawns += spawnsPerSecond * (1 + clusterChance);
                expectedDoubleSpawns += spawnsPerSecond * clusterChance;
              }
              // expected total spawn calculation and validations
              const spawnStdDev = Math.sqrt(Math.abs(expectedSpawns * (1 + gameParams.CLUSTER_CHANCE) * (1 - (1 + gameParams.CLUSTER_CHANCE)))); // Approximate variance for obstacles
              const spawnTolerance = 1.2 * spawnStdDev;
              const minExpectedSpawns = Math.floor(expectedSpawns - spawnTolerance);
              const maxExpectedSpawns = Math.ceil(expectedSpawns + spawnTolerance*2);
              console.log('minExpectedSpawns',minExpectedSpawns, 'maxExpectedSpawns',maxExpectedSpawns, 'actual spawns',spawnEvents.length);
              if (spawnEvents.length >= minExpectedSpawns && spawnEvents.length <= maxExpectedSpawns) {
                //positive case do nothing
              } else {
                console.log('Suspicious spawn count', {
                    spawnEventsLength: spawnEvents.length,
                    minExpectedSpawns,
                    maxExpectedSpawns,
                    expectedSpawns,
                    gameTimeSec
                });
                return new Response(JSON.stringify({ status: 'error', message: tooLuckyMessage }), { status: 400 });
              }
              // Expected Double spawn calculations and validations
              const doubleSpawnStdDev = Math.sqrt(expectedDoubleSpawns * gameParams.CLUSTER_CHANCE * (1 - gameParams.CLUSTER_CHANCE)); // Variance for double spawns
              const doubleSpawnTolerance = 2 * doubleSpawnStdDev;
              const minExpectedDoubleSpawns = Math.floor(expectedDoubleSpawns - doubleSpawnTolerance);
              console.log('min',minExpectedDoubleSpawns,' actual double spawns',doubleSpawnCount);
              if (doubleSpawnCount >= minExpectedDoubleSpawns) {
                //positive case do nothing
              } else {
                console.log('Suspicious double spawn count', {
                    doubleSpawnCount,
                    expectedDoubleSpawns,
                    doubleSpawnTolerance,
                    minExpectedDoubleSpawns,
                    //maxExpectedDoubleSpawns,
                });
                return new Response(JSON.stringify({status: 'error', message: tooLuckyMessage }), { status: 400 });
              }
              // expected maxObstacles range calcuations and validations
              const maxObstaclesStdDev = Math.sqrt(Math.abs(expectedMaxObstacles * (1 + gameParams.CLUSTER_CHANCE) * (1 - (1 + gameParams.CLUSTER_CHANCE))));
              const maxObstaclesTolerance = 1.5 * maxObstaclesStdDev;
              const minExpectedMaxObstacles = Math.floor(expectedMaxObstacles - maxObstaclesTolerance);
              const maxExpectedMaxObstacles = Math.ceil(expectedMaxObstacles + maxObstaclesTolerance*2 + 2);
              console.log('min',minExpectedMaxObstacles,'max',maxExpectedMaxObstacles,'and actual maxObstacles',stats.maxObstacles);
              if (stats.maxObstacles >= minExpectedMaxObstacles && stats.maxObstacles <= maxExpectedMaxObstacles) {
                //positive case do nothing
              } else {
                  console.log('Suspicious maxObstacles', {
                      maxObstacles: stats.maxObstacles,
                      minExpectedMaxObstacles,
                      maxExpectedMaxObstacles
                  });
                  return new Response(JSON.stringify({ status: 'error', message: tooLuckyMessage }), { status: 400 });
              }
              // END SPAWN RELATED VALIDATION
              

              // FLY GAME FLAP VALIDATIONS
              const flapEvents = telemetry.filter(e => e.event === 'flap');
              // validate jumpEvents.length and stats.jump
              if (flapEvents.length == stats.flaps) {
                //positive case do nothing
              } else {
                console.log('Suspicious flapEvents vs stats.flaps', {
                  statsFlaps: stats.flaps,
                  flapEventsLength: flapEvents.length,
                });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              // 1. Flap Interval Variance
              const flapIntervals = [];
              for (let i = 1; i < flapEvents.length; i++) {
                const frameInterval = (flapEvents[i].frameId - flapEvents[i - 1].frameId) / 10;
                flapIntervals.push(frameInterval);
              }
              const avgInterval = flapIntervals.reduce((a, b) => a + b, 0) / flapIntervals.length;
              const variance = flapIntervals.reduce((a, b) => a + Math.pow(b - avgInterval, 2), 0) / flapIntervals.length;
              console.log('Flap Interval Variance (min 2, max 6, variance:', variance);
              if (variance > 2 && variance < 6) {
                //positive case do nothing
              } else {
                console.log('Suspicious flap interval variance not between 2< >6', variance);
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }

              // 2. Validate Flap Frequency
              const flapCount = flapEvents.length;
              const expectedFlapsPerSec = flapCount / gameTimeSec;
              if (Math.abs(stats.flapsPerSec - expectedFlapsPerSec) < 0.005) {
                //positive case do nothing
              } else {
                console.log('Suspicious flapsPerSec vs flap events', {
                  statsFlapsPerSec: stats.flapsPerSec,
                  expectedFlapsPerSec,
                });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }

              // 3. Existing flapsPerSec vs inputsPerSec check
              if (Math.abs(stats.flapsPerSec - stats.inputsPerSec) < 0.01) {
                //positive case do nothing
              } else {
                console.log('Suspicious flapsPerSec vs inputsPerSec', {
                  statsFlapsPerSec: stats.flapsPerSec,
                  statsInputsPerSec: stats.inputsPerSec,
                });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }

              // 4. Existing min/max flaps per second checks
              if (stats.flapsPerSec > 1 && stats.flapsPerSec < 3) {
                //positive case do nothing
              } else {
                console.log('stats.flapsPerSec is out of range', {
                  flapsPerSec,
                  minFlapsPerSec: 1,
                  maxFlapsPerSec: 3,
                });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }


              //5. FLY FULL GAME PHYSICS SIMULATION
              let activeObstacles = []; // Track active obstacles
              let lastFrame = telemetry.find(e => e.event === 'frame');
              let stopFrame = telemetry.reverse().find(e => e.event === 'frame');
              telemetry.reverse(); // Restore original order
              const shipStartX = stats.canvasWidth * 0.15; // Initialize ship x
              let currentY = lastFrame.data.y;
              let currentVy = lastFrame.data.vy;
              let lastTime = lastFrame.time; // Start with first event's time
              let lastFrameId = lastFrame.frameId;
              const perFrameDeltaTime = 1 / avgFps;

              //check that stop frame is within range of stats.framesCount
              if (stopFrame.frameId >= stats.framesCount - 10 && stopFrame.frameId <= stats.framesCount) {
                //positive case do nothing
              } else {
                console.log('last frame  is out of range of stats.framesCount', {
                  lastFrameId: stopFrame.frameId,
                  statsFramesCount: stats.framesCount,
                });
                return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
              }
              // Initialize obstacles from the first frame's obsData or spawn events
              if (lastFrame.obsData && lastFrame.obsData.obstacles) {
                activeObstacles = lastFrame.obsData.obstacles.map(obs => ({ ...obs }));
              }

              for (const event of telemetry) {
                // Skip the initial frame used for initialization
                if (event === lastFrame || event.frameId < 10 || event.event === 'fps') continue;
                if (event.event === 'collision' || event === stopFrame) break;
                
                const framesElapsed = event.frameId - lastFrameId;
                const expectedTime = framesElapsed * perFrameDeltaTime * 1000; // Convert to ms
                const actualTime = event.time - lastTime;
                if (Math.abs(actualTime - expectedTime) < 100) { // 100ms tolerance
                  //positive case do nothing
                } else {
                  console.log('Time inconsistency', { event, lastFrameId, actualTime, expectedTime });
                  return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                }

                // Simulate frame by frame physics and obstacle movement
                for (let i = lastFrameId + 1; i <= event.frameId; i++) {
                  //if (event.frameId + i >= stats.framesCount) console.log('event.frameId + i', event.frameId + i);
                  // Update ship physics
                  currentVy += gameParams.GRAVITY;
                  currentY += currentVy;
                  //check ground and top collisions
                  if (currentY <= avgCanvH - gameParams.SHIP_HEIGHT && currentY > 0) {
                    //positive case do nothing
                  } else {
                    console.log('Suspicious ship no collision with ground or top', {
                      event,
                      lastFrameId,
                      eventFrameId: event.frameId,
                      frameId: i,
                      currentY,
                    });
                    return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                  }
                  // Update obstacle positions
                  activeObstacles.forEach(obs => {
                    obs.x += obs.dx; // Interpolate x using dx
                  });
                  // Remove obstacles that have moved off-screen (x < 0)
                  activeObstacles = activeObstacles.filter(obs => obs.x >= 0);
                  // Check for collisions with obstacles
                  const shipCenterX = shipStartX + gameParams.SHIP_WIDTH / 2;
                  const shipCenterY = currentY + gameParams.SHIP_HEIGHT / 2;
                  for (const obs of activeObstacles) {
                    const obsCenterX = obs.x + gameParams.OBSTACLE_SIZE / 2;
                    const obsCenterY = obs.y + gameParams.OBSTACLE_SIZE / 2;
                    const distance = Math.sqrt(
                      Math.pow(shipCenterX - obsCenterX, 2) + Math.pow(shipCenterY - obsCenterY, 2)
                    );
                    if (distance >= (gameParams.SHIP_WIDTH + gameParams.OBSTACLE_SIZE) / 2) {
                      //positive case do nothing
                    } else {
                      console.log('Suspicious unreported obstacle collision', { frameId: event.frameId + i, shipX: shipStartX, shipY: currentY, obs });
                      return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                    }
                  }
                }
                // Handle event-specific logic
                if (event.event === 'spawn') {
                  // Add new obstacle from spawn event
                  activeObstacles.push({
                    x: stats.canvasWidth, // spawn at right edge
                    y: event.data.y,
                    dx: event.data.speed,
                    width: gameParams.OBSTACLE_SIZE,
                    height: gameParams.OBSTACLE_SIZE,
                    dodged: false
                  });
                } else if (event.event === 'flap') {
                  if (event.data.x === shipStartX) {
                    //positive case do nothing
                  } else {
                    console.log('Ship out of start x position', { event, shipStartX });
                      return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                  }
                  // Apply flap velocity
                  currentVy = gameParams.FLAP_VELOCITY;
                  // Validate flap position and velocity
                  if (Math.abs(event.data.y - currentY) < 0.001) {
                    //positive case do nothing
                  } else {
                    console.log('Flap position check failed', { event, expectedY: currentY, actualY: event.data.y });
                    return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                  }
                  if (Math.abs(event.data.vy - gameParams.FLAP_VELOCITY) < 0.001) {
                    //positive case do nothing
                  } else {
                    console.log('Flap velocity check failed', { event, expectedVy: gameParams.FLAP_VELOCITY, actualVy: event.data.vy });
                    return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                  }

                } else if (event.event === 'frame') {
                  // Validate frame position and velocity
                  if (Math.abs(event.data.y - currentY) < 0.001) {
                    //positive case do nothing
                  } else {
                    console.log('Frame position check failed', { event, expectedY: currentY, actualY: event.data.y });
                    return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                  }
                  if (Math.abs(event.data.vy - currentVy) < 0.001) {
                    //positive case do nothing
                  } else {
                    console.log('Frame velocity check failed', { event, expectedVy: currentVy, actualVy: event.data.vy });
                    return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                  }

                  // Validate that obstacles haven't disappeared prematurely
                  const reportedObstacles = event.obsData.obstacles;
                  // Check each active obstacle that should still be on-screen
                  for (const activeObs of activeObstacles) {
                    if (activeObs.x + gameParams.OBSTACLE_SIZE >= 0) { // Should be on-screen
                      // Find a matching obstacle in reported obsData (based on y and proximity of x)
                      const matchingObs = reportedObstacles.find(obs => 
                        Math.abs(obs.y - activeObs.y) < 0.001 && 
                        Math.abs(obs.x - activeObs.x) < Math.abs(activeObs.dx)*1.5 &&// Allow small x discrepancy
                        Math.abs(obs.dx - activeObs.dx) < 0.001
                      );
                      if (matchingObs) {
                        //positive case do nothing
                      } else {
                        console.log('Suspicious obstacle disappearance', {
                          frameId: event.frameId,
                          missingObs: activeObs,
                          reportedObstacles,
                          activeObstacles,
                        });
                        return new Response(JSON.stringify({ status: 'error', message: banMessage }), { status: 400 });
                      }
                    }
                  }
                  // Update active obstacles with reported ones
                  currentVy = event.data.vy;
                } 
                // Update state
                lastFrame = event;
                lastFrameId = event.frameId;
                lastTime = event.time;
              }
              // END FLY GAME FULL SIMULATION
              // END FLY GAME VALIDATIONS
              

              // SHOOT GAME
            } else if (stats.game === 'shoot') {
              
              console.log('Shoot game ended with score', Number(score));
                  return new Response(
                    JSON.stringify({ status: 'success', isHighScore: false }),
                    { status: 200 }
                  );
            }

              
            
        } //end if score >= telemetry threshold and > contractHighScore
        //now submit the validated high score to the contract
        result = await sendTransaction(async (txOptions) => {
          return await contract.endGame(BigInt(gameId), address, BigInt(score), txOptions);
        });

        let isHighScore = false;
        try {
          isHighScore = result.receipt.logs[1].args[3]? true : false;
          // code after new contract deployment is:
          // isHighScore = result.receipt.logs[0].args[3];
        } catch (error) {
          isHighScore = false;
        }

        console.log('End game successful: isHighScore',isHighScore, 'tx.hash', result.tx.hash);
        return new Response(
          JSON.stringify({
            status: 'success',
            txHash: result.tx.hash,
            isHighScore,
            highScore: isHighScore ? score : contractHighScore,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } }
        );


      } catch (error) {
        console.error('End game error:', error);
        return new Response(JSON.stringify({ status: 'error', message: error.message || 'Failed to end game' }), {
          status: 500,
        });
      }
      
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
