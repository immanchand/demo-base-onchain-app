// src/app/api/server/route.js
import { ethers } from 'ethers';
import { getCsrfTokens } from 'src/lib/csrfStore';
import {  contractABI,
          CONTRACT_ADDRESS,
          RECAPTCHA_START_THRESHOLD,
          TELEMETRY_SCORE_THRESHOLD,
          TELEMETRY_LIMIT,
          SCORE_DIVISOR_TIME,
          FLY_PARAMETERS,
          SHOOT_PARAMETERS, 
          JUMP_PARAMETERS} from '../../../constants';

const rateLimitStore = new Map();
const gameDurationStore = new Map();
const GAME_MASTER_PRIVATE_KEY = process.env.GAME_MASTER_PRIVATE_KEY;
const PROVIDER_URL = process.env.API_URL;
const TIME_VARIANCE_MS = 1000; // 1 second time variance

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

  if (!csrfToken || !sessionId || csrfTokens.get(sessionId) !== csrfToken) {
    console.log('!csrfToken || !sessionId || csrfTokens.get(sessionId) !== csrfToken', !csrfToken,'||',!sessionId,' ||', csrfTokens.get(sessionId),'!==', csrfToken);
    return new Response(JSON.stringify({ status: 'error', message: 'Invalid or missing CSRF token. Press f5 to refresh' }), {
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
    let tx, receipt, result;
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
      
      case 'end-game':
        //verify that required input fields are present
        if (!gameId || !address || !score) {
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

        //main logic to check telemetry and stats and score and try to send contract transaction
        try {
          // Fetch current highScore from contract
            let gameData;
            try {
              gameData = await contract.getGame(gameId);
              const contractHighScore = Number(gameData.highScore.toString());
              const gameEndTime = Number(gameData.endTime.toString()); // Convert seconds to milliseconds
              if (gameData) {
                // early check and return if game is already over
                if (gameEndTime <= Date.now()/1000) {
                  console.log('gameEndTime <= Date.now()/1000', gameEndTime, '<=', Date.now()/1000);
                  return new Response(JSON.stringify({ status: 'error', message: 'This game is already over' }), {
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
            return new Response(JSON.stringify({ status: 'error', message: 'Failed to fetch game data' }), {
              status: 500,
            });
            }
          // Validate only if score >= 20000 and > contractHighScore
          // all telemetry and stats checks go inside this if block
          if (Number(score) >= TELEMETRY_SCORE_THRESHOLD) {
            
            //make sure stats and telemetry are present
            if(!stats || !telemetry || telemetry.length === 0) {
              console.log('!stats || !telemetry',!stats, '||', !telemetry);
              return new Response(JSON.stringify({ status: 'error', message: 'Missing telemetry or stats for high score validation' }), {
                status: 400,
              });
            }
            if (telemetry.length >= TELEMETRY_LIMIT-1) {
              console.log('telemetry.length >= TELEMETRY_LIMIT-1',telemetry.length, '>=', TELEMETRY_LIMIT,'-1');
              return new Response(JSON.stringify({ status: 'error', message: 'Telemetry data is invalid. Suspected cheating.' }), {
                status: 400,
              });
            }
            
            console.log('telemetry (first 100 events): ', telemetry.slice(0, 100));
            console.log('telemetry (last 100 events): ', telemetry.slice(-100));
            console.log('stats: ', stats);
            const telemetryLength = telemetry.length;
            console.log('telemetryLength', telemetryLength);


            // validate recaptcha token for bot detection
            const RECAPTCHA_END_THRESHOLD = 
                    stats.game === 'fly'? FLY_PARAMETERS.RECAPTCHA_END_THRESHOLD:
                    stats.game === 'jump'? JUMP_PARAMETERS.RECAPTCHA_END_THRESHOLD:
                    stats.game === 'shoot'? SHOOT_PARAMETERS.RECAPTCHA_END_THRESHOLD: 0.7;
            try {
              const recaptchaResponse = await fetch(
                `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaTokenEnd}`
              );
              const recaptchaData = await recaptchaResponse.json();
              console.log('reCAPTCHA END data:', recaptchaData);
              if (!recaptchaData.success || recaptchaData.score < RECAPTCHA_END_THRESHOLD) {
                console.log('!recaptchaData.success || recaptchaData.score < RECAPTCHA_END_THRESHOLD',
                  !recaptchaData.success, '||', recaptchaData.score, '<', RECAPTCHA_END_THRESHOLD);
                return new Response(JSON.stringify({ status: 'error', message: 'CAPTCHA failed. You behaved like a bot' }), {
                  status: 403,
                });
              }
            } catch (error) {
              console.error('reCAPTCHA error:', error);
              //continue because backend mistake and not player's fault
              //assume player is human
            }

            //first easy check thats score is 0 in stats
            if (stats.score != 0 ) {
              console.log('Stats score should be 0', {
                address,
                gameId,
                gameName: stats.game,
            });
              return new Response(JSON.stringify({ status: 'error', message: 'Suspicious score in stats' }), { status: 400 });
            }
            //ALL games check ship size in frame events and telemetry score is 0, and
            //common frame events filter for subsequent checks
            const frameEvents = telemetry.filter(e => e.event === 'frame');
            const shipHeight = 
                    stats.game === 'fly'? FLY_PARAMETERS.SHIP_HEIGHT:
                    stats.game === 'jump'? JUMP_PARAMETERS.SHIP_HEIGHT:
                    stats.game === 'shoot'? SHOOT_PARAMETERS.SHIP_HEIGHT: 0;
            const shipWidth = 
                    stats.game === 'fly'? FLY_PARAMETERS.SHIP_WIDTH:
                    stats.game === 'jump'? JUMP_PARAMETERS.SHIP_WIDTH:
                    stats.game === 'shoot'? SHOOT_PARAMETERS.SHIP_WIDTH: 0;
            for (const event of frameEvents) {
              if(event.data.height != shipHeight || event.data.width != shipWidth) {
                console.log('Ship dimensions mismatch:', {
                  address,
                  gameId,
                  gameName: stats.game,
                  shipHeight,
                  shipWidth,
                  eventShipHeight: event.data.height,
                  eventShipWidth: event.data.width,
                });
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious ship size' }), { status: 400 });
              }
              if(event.data.score != 0) {
                console.log('Frame event score should be 0', {
                  address,
                  gameId,
                  gameName: stats.game,
              });
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious event score' }), { status: 400 });
              }
            }

            const gameTimeSec = stats.time / 1000;
            // All games check that telemetry in in order by time and frameId
            let lastTime = -Infinity;
            let lastFrameId = 0;
            for (let i = 0; i < telemetryLength; i++) {
              const event = telemetry[i];
              // Verify time is non-decreasing
              if (event.time < lastTime) {
                console.log('Telemetry time order violation', {
                  index: i,
                  eventTime: event.time,
                  lastTime
                });
                return new Response(JSON.stringify({ status: 'error', message: 'Invalid telemetry order: time not chronological' }), { status: 400 });
              }
              lastTime = event.time;

              // Verify frameId is strictly increasing for frame events
              if (event.event === 'frame') {
                const currentFrameId = event.data.frameId/10; //divide 10 because front end captures every 10 frames
                if (currentFrameId <= lastFrameId) {
                  console.log('Telemetry frameId order violation', {
                    index: i,
                    currentFrameId,
                    lastFrameId
                  });
                  return new Response(JSON.stringify({ status: 'error', message: 'Invalid telemetry order: frameId not in order' }), { status: 400 });
                }
                lastFrameId = currentFrameId;
              }
            }
            // All game check telemetry only one event collision
            const collisionEvents = telemetry.filter(e => e.event === 'collision');
            if (collisionEvents.length !== 1 && (collisionEvents.length == 2 && collisionEvents[0].time !== collisionEvents[1].time)) {
              console.log('Incorrect number of collision events found for', {
                address,
                gameId,
                gameName: stats.game,
                numberEvents: collisionEvents.length,
              });
              return new Response(JSON.stringify({ status: 'error', message: 'Incorrect collision event telemetry count' }), {
                status: 400,
              });
            }
            // All game check that last event is a collision
            const lastEvent = telemetry[telemetryLength - 1];
            const secondLastEvent = telemetry[telemetryLength - 2];
            if (lastEvent.event !== 'collision' && secondLastEvent.event !== 'collision') {
              console.log('lastEvent.event !== collision && secondLastEvent.event !== collision',
                lastEvent.event, '!== collision', '&&', secondLastEvent.event, '!== collision'
              );
              return new Response(JSON.stringify({ status: 'error', message: 'Last event must be collision' }), { status: 400 });
            }
            // All gamess Check if server game duration is less than client game duration. With network latency, it can never be less.
            // if less, indicates cheating on client side
            const serverDuration = nowEnd - gameDurationStore.get(address);
            if (serverDuration < stats.time) {
                console.log('GameDurationStore Stats Time Check failed for', {
                    address,
                    gameId,
                    gameName: stats.game,
                    gameDurationStore: gameDurationStore.get(address),
                    nowEnd,
                    serverDuration,
                    statsTime: stats.time});
                gameDurationStore.delete(address);
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious Score: game duration is more than expected' }), {
                    status: 400,
                });
            }
            
            // Detect Game Clock Manipulation
            // check telemetry time agains server time only if telemetry length is less than limit
            const telemetryDuration = frameEvents[frameEvents.length-1].time - frameEvents[0].time;
            if (telemetryDuration > serverDuration) {
              console.log('GameDurationStore Duration Check failed for', {
                address,
                gameId,
                gameName: stats.game,
                gameDurationStore: gameDurationStore.get(address),
                nowEnd,
                serverDuration,
                telemetryDuration});  
              gameDurationStore.delete(address);
              return new Response(JSON.stringify({ status: 'error', message: 'Suspicious telemetry duration vs server duration' }), { status: 400 });
            }
            gameDurationStore.delete(address);

            // all games common telemetry check for average fps (frames per second)
            // fps should be minumum 40 and can not change more than 15 over a game period
            const fpsEvents = telemetry.filter(e => e.event === 'fps');
            if (fpsEvents.length < (frameEvents.length/10 - 11)) {
              console.log('fpsEvents.length < (frameEvents.length/10 - 11)',fpsEvents.length, '<', frameEvents.length,'/10 - 11');
              return new Response(JSON.stringify({ status: 'error', message: 'Missing FPS events in telemetry' }), { status: 400 });
            }
            const fpsValues = fpsEvents.map(e => e.data.fps);
            const canvasHeightValues = fpsEvents.map(e => e.data.height);
            const canvasWidthValues = fpsEvents.map(e => e.data.width);
            const minFps = Math.min(...fpsValues);
            const maxFps = Math.max(...fpsValues);
            const avgFps = fpsValues.reduce((sum, fps) => sum + fps, 0) / fpsValues.length;
            const minCanvH = Math.min(...canvasHeightValues);
            const maxCanvH = Math.min(...canvasHeightValues);
            const avgCanvH = canvasHeightValues.reduce((sum, fps) => sum + fps, 0) / canvasHeightValues.length;
            const minCanvW = Math.min(...canvasWidthValues);
            const maxCanvW = Math.min(...canvasWidthValues);
            const avgCanvW = canvasWidthValues.reduce((sum, fps) => sum + fps, 0) / canvasWidthValues.length;
            console.log('minFps',minFps);
            console.log('maxFps',maxFps);
            console.log('avgFps',avgFps);
            console.log('minCanvH',minCanvH);
            console.log('maxCanvH',maxCanvH);
            console.log('avgCanvH',avgCanvH);
            console.log('minCanvW',minCanvW);
            console.log('maxCanvW',maxCanvW);
            console.log('avgCanvW',avgCanvW);
            // Allow 40–72 FPS for mobile compatibility. No upper bound as game is harder when faster.
            if (minFps < 55) {
              console.log('minFps < 55',minFps, '<', '57');
              return new Response(JSON.stringify({ status: 'error', message: 'FPS out of acceptable range' }), { status: 400 });
            }
            // Check for suspicious FPS variance (e.g., >10 FPS change)
            if (maxFps - minFps > 7) {
              console.log('maxFps - minFps > 7',maxFps,' -', minFps, '>',' 7');
              return new Response(JSON.stringify({ status: 'error', message: 'Suspicious FPS variance during game' }), { status: 400 });
            }
            if (maxCanvH - minCanvH > 1 || avgCanvH - stats.canvasHeight > 1 ) {
              console.log('maxCanvH - minCanvH > 1 || avgCanvH - stats.canvasHeight > 1 ',maxCanvH - minCanvH,' > 1 || ',avgCanvH - stats.canvasHeight,' > 1 ');
              return new Response(JSON.stringify({ status: 'error', message: 'Canvas size changed during game' }), { status: 400 });                
            }
            
            // All games check that difficultyFactor progresses correctly.
            const difficultyFactorTime = 
                    stats.game === 'fly'? FLY_PARAMETERS.DIFFICULTY_FACTOR_TIME:
                    stats.game === 'jump'? JUMP_PARAMETERS.DIFFICULTY_FACTOR_TIME:
                    stats.game === 'shoot'? SHOOT_PARAMETERS.DIFFICULTY_FACTOR_TIME: 0;
            const gameStartTime = telemetry[0].time;
            // loop over frame events and check difficulty factor progress
            for (const event of frameEvents) {
              const elapsedTimeSec = ((event.time - gameStartTime) / 1000); //divide by 1000 to convert to seconds
              const difficultyFactor = Math.min(elapsedTimeSec / difficultyFactorTime, 1);
              if (event.data.difficulty < difficultyFactor - 0.001) {
                  console.log('Difficulty factor progression check failed', { 
                    address,
                    gameId,
                    gameName: stats.game,
                    event,
                    difficultyFactor,
                    eventDifficulty: event.data.difficulty,
                  });
                    return new Response(JSON.stringify({ status: 'error', message: 'Suspicious difficulty factor progression' }), { status: 400 });
                }
            }

            // All games Check for identical deltaTime values (suspicious for manipulation)
            const frameDeltaTimes = frameEvents.map(e => e.data.deltaTime);
            const totalFrameDeltaTime = frameDeltaTimes.reduce((a, b) => a + b, 0)
            const avgFrameDeltaTime = totalFrameDeltaTime / frameDeltaTimes.length;
            const frameDeltaTimieVariance = frameDeltaTimes.reduce((a, b) => a + Math.pow(b - avgFrameDeltaTime, 2), 0) / frameDeltaTimes.length;
            console.log('frameDeltaTimieVariance',frameDeltaTimieVariance);
            if (frameDeltaTimieVariance < 1e-7 || frameDeltaTimieVariance > 0.0012) { // 0.0000001 to 0.0001 s²
              console.log('Delta time variance check failed for',{ 
                address,
                gameId,
                gameName: stats.game,
                deltaTimes,
                deltaVariance,
              });
              return new Response(JSON.stringify({ status: 'error', message: 'Suspicious deltaTime variance' }), { status: 400 });
            }
            //all games check total telemetry frame delta time against stats.time/1000=gameTimeSec
            if (totalFrameDeltaTime > gameTimeSec  * 1.01 || totalFrameDeltaTime < gameTimeSec * 0.99) { //1% variance allowed
              console.log('Frame delta time and stats total time mismatch', {
                address,
                gameId,
                gameName: stats.gameName,
                totalFrameDeltaTime,
                gameTimeSec,
              })
              return new Response(JSON.stringify({ status: 'error', message: 'Suspicious time: delta time and total game Time dont match' }), {
                status: 400,
              });
            }
                                    
            //All games events filtered required
            const spawnEvents = telemetry.filter(e => e.event === 'spawn');
            //const frameSwpawnEvents = telemetry.filter(e => e.event === 'frame' || e.event === 'spawn');
            // common duration and score checks for TIME based games
            if (stats.game === 'fly' || stats.game === 'jump') {
              
              // TIME based games Check if score is less than client side game duration with 1 seconds tolerance for start game
              if (score > (stats.time + TIME_VARIANCE_MS)/SCORE_DIVISOR_TIME) {
                console.log('Duration and score check failed for', {
                  address,
                  gameId,
                  gameName: stats.game,
                  score,
                  scoreVariance: (stats.time + 1000)/SCORE_DIVISOR_TIME});
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious Score: score and game duration dont match' }), {
                  status: 400,
                });
              }

              // TIME based games telemetry computed score validation
              let computedScore = totalFrameDeltaTime * FLY_PARAMETERS.SCORE_MULTIPLIER;
              console.log('computedScore max', computedScore * 1.01); // 1 percent variance
              if (Number(score) > computedScore * 1.1) {
                console.log('Number(score) > computedScore * 1.1', Number(score), '>', computedScore, '* 1.1');
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious score: computed events and reported score don’t match' }), { status: 400 });
              }

              //Time based games check ship x position
              for (const event of frameEvents) {
                if(event.data.x != stats.shipX) {
                  console.log('Ship x position mismatch:', {
                    address,
                    gameId,
                    gameName: stats.game,
                    statsShipPosition: stats.shipX,
                    eventShipPosition: event.data.x,
                  });
                  return new Response(JSON.stringify({ status: 'error', message: 'Suspicious ship size' }), { status: 400 });
                }
              }
              
            }
                        
			      // Stats validation and telemetry validation specific to each Game
            // FLY GAME
            if (stats.game === 'fly') {

              // SPAWN RELATED VALIDATION
              // obsData validation for maxObstaclesInPool vs stats.maxObstacles
              let maxObstaclesInPool = 0;
              for (const event of frameEvents) {
                maxObstaclesInPool = Math.max(maxObstaclesInPool, event.obsData.obstacles.length);
              }
              if (Math.abs(maxObstaclesInPool - stats.maxObstacles) > 1) {
                console.log('Invalid maxObstaclesInPool vs stats.maxObstacles', {
                  address,
                  gameId,
                  gameName: stats.game,
                  maxObstaclesInPool,
                  maxObstaclesStats: stats.maxObstacles,
                });
                return new Response(JSON.stringify({ status: 'error', message: 'Invalid maxObstaclesInPool vs stats.maxObstacles' }), { status: 400 });
              }
              console.log('maxObstaclesInPool',maxObstaclesInPool);
              // Extract y positions from all obstacles in obsData
              const yPositions = [];
              for (const event of frameEvents) {
                if (event.obsData && event.obsData.obstacles) {
                  event.obsData.obstacles.forEach(obstacle => {
                    yPositions.push(obstacle.y);
                  });
                }
              }
              //get unique y positions which should be all unique spawns
              const uniqueYPositions = new Set(yPositions);
              console.log('uniqueYPositions.size',uniqueYPositions.size);
              console.log('spawnEvents.length',spawnEvents.length);
              if(uniqueYPositions.size < spawnEvents.length * 0.99 || uniqueYPositions.size > spawnEvents.length){
                console.log('uniqueYPositions and spawns mismatch', {
                  address,
                  uniqueYPositions: uniqueYPositions.size,
                  spawns: spawnEvents.length,
                })
              }
              // Perform chi-squared test for uniform distribution
              const playableHeight = stats.canvasHeight - FLY_PARAMETERS.OBSTACLE_SIZE;
              const numBins =  Math.floor(playableHeight/FLY_PARAMETERS.OBSTACLE_SIZE); // Divide playable height into OBSTACLE_SIZE bins
              console.log('numBins', numBins);
              const binSize = playableHeight / numBins;
              const observedFrequencies = Array(numBins).fill(0);
              // Assign y positions to bins
              let isInvalidYPosition = false;
              uniqueYPositions.forEach(y => {
                if (y >= 0 && y <= stats.canvasHeight - FLY_PARAMETERS.OBSTACLE_SIZE) {
                  const binIndex = Math.min(Math.floor(y / binSize), numBins - 1);
                  observedFrequencies[binIndex]++;
                }
                else {// (y < 0 || y > stats.canvasHeight - FLY_PARAMETERS.OBSTACLE_SIZE) {
                  console.log('Invalid y-position detected:', y);
                  isInvalidYPosition = true;
                }
              });
              if (isInvalidYPosition)
                return new Response(JSON.stringify({ status: 'error', message: 'Invalid obstacle y-position detected' }), { status: 400 });
              
              console.log('Observed frequencies:', observedFrequencies);

              //calculate variance between min and max
              let minObserved = Math.min(...observedFrequencies);
              let maxObserved = Math.max(...observedFrequencies);
              if(minObserved < (maxObserved/2) * 0.5) {
                console.log('Insufficient obstacle y position spawns in min bin', {
                  address,
                  gameId,
                  gameName: stats.game,
                  minObserved,
                  maxObserved,
                });
                // enable after more testing *******************
                //return new Response(JSON.stringify({ status: 'error', message: 'Insufficient obstacle y position spawns in min bin' }), { status: 400 });
              }

              // Calculate chi-squared statistic
              let chiSquared = 0;
              // Expected frequency for uniform distribution
              const expectedFrequency = (uniqueYPositions.size) / (numBins);
              for (let i = 0; i < numBins; i++) {
               // if(observedFrequencies[i] === maxObserved)
                //  continue
                const observed = observedFrequencies[i];
                console.log('observedFrequency',observed, 'expectedFrequency',expectedFrequency);
                const diff = observed - expectedFrequency;
                chiSquared += (diff * diff) / expectedFrequency;
              }
              // Critical value for chi-squared test with 9 degrees of freedom (numBins - 1)
              // at 95% confidence level (alpha = 0.05) is approximately 16.919
              const CHI_SQUARED_CRITICAL_VALUE = 16;
              console.log('Chi-squared statistic:', chiSquared, 'max chi: 16');
              if (chiSquared > CHI_SQUARED_CRITICAL_VALUE) {
                console.log('Suspicious obstacle y position distribution', {
                  address,
                  gameId,
                  gameName: stats.game,
                  chiSquared,
                  observedFrequencies,
                });
                // enable after more testing *******************
                //return new Response(JSON.stringify({
                //  status: 'error',
                //  message: 'Obstacle y positions show suspicious distribution',
                //}), { status: 400 });
              }

              // Validate spawn events vs. obstacles cleared and maxObstacles
              if (stats.obstaclesCleared < spawnEvents.length - stats.maxObstacles
                || stats.obstaclesCleared > spawnEvents.length) {
                console.log('Spawn events count mismatch', {
                    address,
                    gameId,
                    gameName: stats.game,
                    obstaclesCleared: stats.obstaclesCleared,
                    maxObstacles: stats.maxObstacles,
                    spawnEventsCount: spawnEvents.length
                });
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious obstacle count in stats and telemetry' }), { status: 400 });
              }

              // Combined loop for size, speed, and double spawn counting
              let doubleSpawnCount = 0;
              for (let i = 0; i < spawnEvents.length; i++) {
                const event = spawnEvents[i];
                // Size check
                if (event.data.width !== FLY_PARAMETERS.OBSTACLE_SIZE || event.data.height !== FLY_PARAMETERS.OBSTACLE_SIZE) {
                    console.log('Invalid obstacle size', { actualWidth: event.data.width, actualHeight: event.data.height });
                    return new Response(JSON.stringify({ status: 'error', message: 'Suspicious obstacle size' }), { status: 400 });
                }
                // Speed check
                const elapsedTimeSec = ((event.time - gameStartTime) / 1000);
                const difficultyFactor = Math.min(elapsedTimeSec / FLY_PARAMETERS.DIFFICULTY_FACTOR_TIME, 1);
                const expectedSpeed = FLY_PARAMETERS.BASE_OBSTACLE_SPEED * (1 + difficultyFactor);
                if (Math.abs(event.data.speed - expectedSpeed) > 0.1) {
                    console.log('Obstacle speed check failed', { 
                        address,
                        gameId,
                        gameName: stats.game,
                        event,
                        expectedSpeed,
                        actualSpeed: event.data.speed,
                        difficultyFactor
                    });
                    return new Response(JSON.stringify({ status: 'error', message: 'Suspicious obstacle speed' }), { status: 400 });
                }
                // Double spawn check
                if (i > 0 && event.time - spawnEvents[i-1].time < 100) {
                    doubleSpawnCount++;
                }
              }

              // Dynamic spawn count, double spawn count, and max obstacle count caluculations 
              let expectedSpawns = 0;
              let expectedDoubleSpawns = 0;
              let expectedMaxObstacles = 0;
              for (let t = 0; t < gameTimeSec; t++) {
                const difficultyFactor = Math.min(t / FLY_PARAMETERS.DIFFICULTY_FACTOR_TIME, 1);
                const spawnInterval = (FLY_PARAMETERS.MAX_SPAWN_INTERVAL/1000) * (1 - difficultyFactor) + FLY_PARAMETERS.MIN_SPAWN_INTERVAL/1000; // in seconds
                const clusterChance = difficultyFactor * FLY_PARAMETERS.CLUSTER_CHANCE;
                const spawnsPerSecond = 1 / spawnInterval;
                const obstacleSpeed = Math.abs(FLY_PARAMETERS.BASE_OBSTACLE_SPEED * (1 + difficultyFactor)); // pixels per frame
                const timeToCross = stats.canvasWidth / obstacleSpeed * (1 / avgFps); // seconds to cross screen
                const maxObstaclesAtTime = timeToCross * spawnsPerSecond * (1 + clusterChance);
                expectedMaxObstacles = Math.max(expectedMaxObstacles, maxObstaclesAtTime);
                expectedSpawns += spawnsPerSecond * (1 + clusterChance);
                expectedDoubleSpawns += spawnsPerSecond * clusterChance;
              }
              // expected total spawn calculation and validations
              console.log('FLY_PARAMETERS.CLUSTER_CHANCE', FLY_PARAMETERS.CLUSTER_CHANCE);
              const spawnStdDev = Math.sqrt(Math.abs(expectedSpawns * (1 + FLY_PARAMETERS.CLUSTER_CHANCE) * (1 - (1 + FLY_PARAMETERS.CLUSTER_CHANCE)))); // Approximate variance for obstacles
              console.log('spawnStdDev',spawnStdDev);
              const spawnTolerance = 1.3 * spawnStdDev;
              console.log('spawnTolerance',spawnTolerance);
              const minExpectedSpawns = Math.floor(expectedSpawns - spawnTolerance);
              const maxExpectedSpawns = Math.ceil(expectedSpawns + spawnTolerance*1.5);
              console.log('minExpectedSpawns',minExpectedSpawns);
              console.log('maxExpectedSpawns',maxExpectedSpawns);
              console.log('actual spawns',spawnEvents.length);
              if (spawnEvents.length < minExpectedSpawns || spawnEvents.length > maxExpectedSpawns) {
                console.log('Suspicious spawn count', {
                    spawnEventsLength: spawnEvents.length,
                    minExpectedSpawns,
                    maxExpectedSpawns,
                    expectedSpawns,
                    gameTimeSec
                });
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious spawn count' }), { status: 400 });
              }
              // Expected Double spawn calculations and validations
              const doubleSpawnStdDev = Math.sqrt(expectedDoubleSpawns * FLY_PARAMETERS.CLUSTER_CHANCE * (1 - FLY_PARAMETERS.CLUSTER_CHANCE)); // Variance for double spawns
              const doubleSpawnTolerance = 2 * doubleSpawnStdDev;
              const minExpectedDoubleSpawns = Math.floor(expectedDoubleSpawns - doubleSpawnTolerance);
              const maxExpectedDoubleSpawns = Math.ceil(expectedDoubleSpawns + doubleSpawnTolerance*1.5);
              console.log('minExpectedDoubleSpawns',minExpectedDoubleSpawns);
              console.log('maxExpectedDoubleSpawns',maxExpectedDoubleSpawns);
              console.log('actual double spawn',doubleSpawnCount);
              if (doubleSpawnCount < minExpectedDoubleSpawns || doubleSpawnCount > maxExpectedDoubleSpawns) {
                console.log('Suspicious double spawn count', {
                    doubleSpawnCount,
                    expectedDoubleSpawns,
                    doubleSpawnTolerance,
                    minExpectedDoubleSpawns,
                    maxExpectedDoubleSpawns,
                });
                return new Response(JSON.stringify({status: 'error', message: 'Suspicious double spawn count' }), { status: 400 });
              }
              // expected maxObstacles range calcuations and validations
              const maxObstaclesStdDev = Math.sqrt(Math.abs(expectedMaxObstacles * (1 + FLY_PARAMETERS.CLUSTER_CHANCE) * (1 - (1 + FLY_PARAMETERS.CLUSTER_CHANCE))));
              const maxObstaclesTolerance = 1.5 * maxObstaclesStdDev;
              const minExpectedMaxObstacles = Math.floor(expectedMaxObstacles - maxObstaclesTolerance);
              const maxExpectedMaxObstacles = Math.ceil(expectedMaxObstacles + maxObstaclesTolerance*2);
              console.log('minExpectedMaxObstacles',minExpectedMaxObstacles);
              console.log('maxExpectedMaxObstacles',maxExpectedMaxObstacles);
              console.log('stats.maxObstacles',stats.maxObstacles);
              if (stats.maxObstacles < minExpectedMaxObstacles || stats.maxObstacles > maxExpectedMaxObstacles) {
                  console.log('Suspicious maxObstacles', {
                      maxObstacles: stats.maxObstacles,
                      minExpectedMaxObstacles,
                      maxExpectedMaxObstacles
                  });
                  return new Response(JSON.stringify({ status: 'error', message: 'Suspicious maxObstacles: outside expected range' }), { status: 400 });
              }
              // END SPAWN RELATED VALIDATION
              

              // FLY GAME FLAP VALIDATIONS
              const flapEvents = telemetry.filter(e => e.event === 'flap');

              console.log('last frame obsData', frameEvents[frameEvents.length-1].obsData);
              console.log('second last frame obsData', frameEvents[frameEvents.length-2].obsData);
              console.log('third last frame obsData', frameEvents[frameEvents.length-3].obsData);


              // // 1. Flap Plausibility
              // //let lastFrameIndex = 0;
              // //let perFrameDeltaTime = 1 / avgFps;
              // let lastFrame = flapFrameEvents.find(e => e.event === 'frame');
              // let currentY = lastFrame.data.y;
              // let currentVy = lastFrame.data.vy;
              // let lastTime = lastFrame.time;
              // let lastFrameId = lastFrame.frameId;
              // const perFrameDeltaTime = 1 / avgFps;
              // for (const event of flapFrameEvents) {
              //   // Skip the initial frame used for initialization
              //   if (event === lastFrame) continue;
              //   const framesElapsed = event.frameId - lastFrameId;
              //   const expectedTime = framesElapsed * perFrameDeltaTime * 1000; // Convert to ms
              //   const actualTime = event.time - lastTime;
              //   if (Math.abs(actualTime - expectedTime) > 50) { // 50ms tolerance
              //     console.log('Time inconsistency', { event, lastFrameId, actualTime, expectedTime });
              //     return new Response(JSON.stringify({ status: 'error', message: 'Suspicious event timing' }), { status: 400 });
              //   }
              //   // Simulate frame by frame physics up to the event
              //   for (let i = 0; i < Math.floor(framesElapsed); i++) {
              //     currentVy += FLY_PARAMETERS.GRAVITY;
              //     currentY += currentVy;
              //     if (currentY < 0) {
              //       currentY = 0; // Clamp y-position to 0
              //       currentVy = 0; // Clamp vy to 0
              //     }
              //     if (currentY > stats.canvasHeight - FLY_PARAMETERS.SHIP_HEIGHT) {
              //       console.log('Suspicious ship no collision with ground' );
              //       return new Response(JSON.stringify({ status: 'error', message: 'Suspicious ship no collision with ground' }), { status: 400 });
              //     }
              //     if (currentY > stats.canvasHeight - FLY_PARAMETERS.SHIP_HEIGHT*1.5 && i < 9) {
              //       console.log('SUPER CLOSE TO DEATH!! frame id:',  event.frameId+i);
              //     }
              //   }

              //   if (event.event === 'flap') {
              //     // Apply flap velocity
              //     currentVy = FLY_PARAMETERS.FLAP_VELOCITY;
              //     // Validate flap position and velocity
              //     if (Math.abs(event.data.y - currentY) > 0.001) {
              //       console.log('Flap position check failed', { event, expectedY: currentY, actualY: event.data.y });
              //       return new Response(JSON.stringify({ status: 'error', message: 'Suspicious flap position' }), { status: 400 });
              //     }
              //     if (Math.abs(event.data.vy - FLY_PARAMETERS.FLAP_VELOCITY) > 0.001) {
              //       console.log('Flap velocity check failed', { event, expectedVy: FLY_PARAMETERS.FLAP_VELOCITY, actualVy: event.data.vy });
              //       return new Response(JSON.stringify({ status: 'error', message: 'Suspicious flap velocity' }), { status: 400 });
              //     }
              //   } else if (event.event === 'frame') {
              //     // Validate frame position and velocity
              //     if (Math.abs(event.data.y - currentY) > 0.001) {
              //       console.log('Frame position check failed', { event, expectedY: currentY, actualY: event.data.y });
              //       return new Response(JSON.stringify({ status: 'error', message: 'Suspicious frame position' }), { status: 400 });
              //     }
              //     if (Math.abs(event.data.vy - currentVy) > 0.001) {
              //       console.log('Frame velocity check failed', { event, expectedVy: currentVy, actualVy: event.data.vy });
              //       return new Response(JSON.stringify({ status: 'error', message: 'Suspicious frame velocity' }), { status: 400 });
              //     }
              //   }
              //   // Update state
              //   lastFrame = event;
              //   lastFrameId = event.frameId;
              //   lastTime = event.time;
              //   currentY = event.data.y;
              //   currentVy = event.data.vy;
                
              // }

              // 2. Flap Interval Variance
              const flapIntervals = [];
              for (let i = 1; i < flapEvents.length; i++) {
                const frameInterval = (flapEvents[i].frameId - flapEvents[i - 1].frameId) / 10;
                flapIntervals.push(frameInterval);
              }
              const avgInterval = flapIntervals.reduce((a, b) => a + b, 0) / flapIntervals.length;
              const variance = flapIntervals.reduce((a, b) => a + Math.pow(b - avgInterval, 2), 0) / flapIntervals.length;
              console.log('Flap Interval Variance (min 2, max 8, variance:', variance);
              if (variance < 2 || variance > 8) {
                console.log('Suspicious flap interval variance not between 2< >8', variance);
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious flap interval variance' }), { status: 400 });
              }

              // 3. Validate Flap Frequency
              const flapCount = flapEvents.length;
              const expectedFlapsPerSec = flapCount / gameTimeSec;
              if (Math.abs(stats.flapsPerSec - expectedFlapsPerSec) > 0.005) {
                console.log('Suspicious flapsPerSec vs flap events', {
                  statsFlapsPerSec: stats.flapsPerSec,
                  expectedFlapsPerSec,
                });
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious flapsPerSec vs flap events patterns' }), { status: 400 });
              }

              // 4. Existing flapsPerSec vs inputsPerSec check
              if (Math.abs(stats.flapsPerSec - stats.inputsPerSec) > 0.01) {
                console.log('Suspicious flapsPerSec vs inputsPerSec', {
                  statsFlapsPerSec: stats.flapsPerSec,
                  statsInputsPerSec: stats.inputsPerSec,
                });
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious stats flapsPerSec vs inputsPerSec' }), { status: 400 });
              }

              // 5. Existing min/max flaps per second checks
              if (stats.flapsPerSec < 1 || stats.flapsPerSec > 4) {
                console.log('stats.flapsPerSec is out of range', {
                  flapsPerSec,
                  minFlapsPerSec: 1,
                  maxFlapsPerSec: 4,
                });
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious gameplay flapsPerSec out of range' }), { status: 400 });
              }


              //6. FULL GAME PHYSICS SIMULATION
              let activeObstacles = []; // Track active obstacles
              let lastFrame = telemetry.find(e => e.event === 'frame');
              let currentX = lastFrame.data.x; // Initialize ship x
              let currentY = lastFrame.data.y;
              let currentVy = lastFrame.data.vy;
              let lastTime = lastFrame.time;
              let lastFrameId = lastFrame.frameId;
              const perFrameDeltaTime = 1 / avgFps;

              // Initialize obstacles from the first frame's obsData or spawn events
              if (lastFrame.obsData && lastFrame.obsData.obstacles) {
                activeObstacles = lastFrame.obsData.obstacles.map(obs => ({ ...obs }));
              }

              for (const event of telemetry) {
                // Skip the initial frame used for initialization
                if (event === lastFrame) continue;
                if (event.event === 'frame' || event.event === 'flap') {
                  const framesElapsed = event.frameId - lastFrameId;
                  const expectedTime = framesElapsed * perFrameDeltaTime * 1000; // Convert to ms
                  const actualTime = event.time - lastTime;
                  if (Math.abs(actualTime - expectedTime) > 50) { // 50ms tolerance
                    console.log('Time inconsistency', { event, lastFrameId, actualTime, expectedTime });
                    return new Response(JSON.stringify({ status: 'error', message: 'Suspicious event timing' }), { status: 400 });
                  }

                  // Simulate frame by frame physics and obstacle movement
                  for (let i = 0; i < Math.floor(framesElapsed); i++) {
                    // Update ship physics
                    currentVy += FLY_PARAMETERS.GRAVITY;
                    currentY += currentVy;
                    if (currentY < 0) {
                      currentY = 0; // Clamp y-position to 0
                      currentVy = 0; // Clamp vy to 0
                    }
                    if (currentY > stats.canvasHeight - FLY_PARAMETERS.SHIP_HEIGHT) {
                      console.log('Suspicious ship no collision with ground');
                      return new Response(JSON.stringify({ status: 'error', message: 'Suspicious ship no collision with ground' }), { status: 400 });
                    }
                    if (currentY > stats.canvasHeight - FLY_PARAMETERS.SHIP_HEIGHT * 1.5) {
                      console.log('SUPER CLOSE TO DEATH!! frame id:', event.frameId + i);
                    }

                    // Update obstacle positions
                    activeObstacles.forEach(obs => {
                      obs.x += obs.dx * perFrameDeltaTime; // Interpolate x using dx
                    });

                    // Remove obstacles that have moved off-screen (x < 0)
                    activeObstacles = activeObstacles.filter(obs => obs.x >= 0);

                    // Check for collisions with obstacles
                    const shipCenterX = currentX + FLY_PARAMETERS.SHIP_WIDTH / 2;
                    const shipCenterY = currentY + FLY_PARAMETERS.SHIP_HEIGHT / 2;
                    for (const obs of activeObstacles) {
                      const obsCenterX = obs.x + FLY_PARAMETERS.OBSTACLE_SIZE / 2;
                      const obsCenterY = obs.y + FLY_PARAMETERS.OBSTACLE_SIZE / 2;
                      const distance = Math.sqrt(
                        Math.pow(shipCenterX - obsCenterX, 2) + Math.pow(shipCenterY - obsCenterY, 2)
                      );
                      if (distance < (FLY_PARAMETERS.SHIP_WIDTH + FLY_PARAMETERS.OBSTACLE_SIZE) / 2) {
                        console.log('Suspicious unreported obstacle collision', { frameId: event.frameId + i, shipX: currentX, shipY: currentY, obs });
                        return new Response(JSON.stringify({ status: 'error', message: 'Suspicious unreported obstacle collision' }), { status: 400 });
                      }
                    }
                  }
                }

                // Handle event-specific logic
                if (event.event === 'flap') {
                  // Apply flap velocity
                  currentVy = FLY_PARAMETERS.FLAP_VELOCITY;
                  // Validate flap position and velocity
                  if (Math.abs(event.data.y - currentY) > 0.001) {
                    console.log('Flap position check failed', { event, expectedY: currentY, actualY: event.data.y });
                    return new Response(JSON.stringify({ status: 'error', message: 'Suspicious flap position' }), { status: 400 });
                  }
                  if (Math.abs(event.data.vy - FLY_PARAMETERS.FLAP_VELOCITY) > 0.001) {
                    console.log('Flap velocity check failed', { event, expectedVy: FLY_PARAMETERS.FLAP_VELOCITY, actualVy: event.data.vy });
                    return new Response(JSON.stringify({ status: 'error', message: 'Suspicious flap velocity' }), { status: 400 });
                  }
                  currentX = event.data.x; // Update ship x
                } else if (event.event === 'frame') {
                  // Validate frame position and velocity
                  if (Math.abs(event.data.y - currentY) > 0.001) {
                    console.log('Frame position check failed', { event, expectedY: currentY, actualY: event.data.y });
                    return new Response(JSON.stringify({ status: 'error', message: 'Suspicious frame position' }), { status: 400 });
                  }
                  if (Math.abs(event.data.vy - currentVy) > 0.001) {
                    console.log('Frame velocity check failed', { event, expectedVy: currentVy, actualVy: event.data.vy });
                    return new Response(JSON.stringify({ status: 'error', message: 'Suspicious frame velocity' }), { status: 400 });
                  }

                  // Validate that obstacles haven't disappeared prematurely
                  const reportedObstacles = event.obsData.obstacles;
                  // Check each active obstacle that should still be on-screen
                  for (const activeObs of activeObstacles) {
                    if (activeObs.x + FLY_PARAMETERS.OBSTACLE_SIZE >= 0) { // Should be on-screen
                      // Find a matching obstacle in reported obsData (based on y and proximity of x)
                      const matchingObs = reportedObstacles.find(obs => 
                        Math.abs(obs.y - activeObs.y) < 0.001 && 
                        Math.abs(obs.x - activeObs.x) < Math.abs(activeObs.dx) * perFrameDeltaTime * 2 &&// Allow small x discrepancy
                        Math.abs(obs.dx - activeObs.dx) < 0.001
                      );
                      console.log('Math.abs(activeObs.dx) * perFrameDeltaTime * 2',Math.abs(activeObs.dx) * perFrameDeltaTime * 2);
                      console.log('Math.abs(obs.x - activeObs.x)',Math.abs(obs.x - activeObs.x));
                      if (!matchingObs) {
                        console.log('Suspicious obstacle disappearance', { frameId: event.frameId, missingObs: activeObs });
                        return new Response(JSON.stringify({ status: 'error', message: 'Suspicious obstacle disappearance' }), { status: 400 });
                      }
                    }
                  }
                  // Update active obstacles with reported ones
                  activeObstacles = reportedObstacles.map(obs => ({ ...obs }));
                  currentX = event.data.x; // Update ship x

                } else if (event.event === 'spawn') {
                  // Add new obstacle from spawn event
                  activeObstacles.push({
                    x: stats.canvasWidth, // spawn at right edge
                    y: event.data.y,
                    dx: event.data.speed,
                    width: FLY_PARAMETERS.OBSTACLE_SIZE,
                    height: FLY_PARAMETERS.OBSTACLE_SIZE,
                    dodged: false
                  });
                }
                if (event.event === 'frame' || event.event === 'flap') {
                  // Update state
                  lastFrame = event;
                  lastFrameId = event.frameId;
                  lastTime = event.time;
                  currentY = event.data.y;
                  currentVy = event.data.vy;
                }
              }
              // END FLY GAME FULL SIMULATION
              // END FLY GAME VALIDATIONS
              







              // SHOOT GAME
            } else if (stats.game === 'shoot') {
              
              const hitRate = stats.kills / (stats.shots || 1);
              if (hitRate > 0.8 || stats.kills > gameTimeSec || Number(score) > stats.kills * 31) {
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious gameplay stats' }), {
                  status: 400,
                });
              }
              computedScore = stats.kills * 31; // Override telemetry for Shoot




              
            // JUMP GAME
            } else if (stats.game === 'jump') {
              // Check if score is less than client side game duration with 1 seconds tolerance for start game
              if (score > (stats.time + 1000)/10) {
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious Score: score and game duration dont match' }), {
                  status: 400,
                });
              }

              if (stats.jumpsPerSec > 1 || stats.obstaclesCleared > stats.time / 10) {
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious gameplay stats' }), {
                  status: 400,
                });
              }
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
            return new Response(JSON.stringify({ status: 'error', message: 'CAPTCHA failed. Move mouse around and try again' }), {
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
