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
    let tx, receipt;
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
        tx = await contract.createGame();
        receipt = await tx.wait();
        rateLimitStore.set(sessionId, nowCreate);
        console.log('create game successful',tx.hash);
        return new Response(
          JSON.stringify({ status: 'success', txHash: tx.hash }),
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
            if(!stats || !telemetry) {
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

            const gameTimeSec = stats.time / 1000;
            // All games check that telemetry in in order by time and frameId
            let lastTime = -Infinity;
            let lastFrameId = 0;
            const telemetryLength = telemetry.length;
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
            //common frame events filter for subsequent checks
            const frameEvents = telemetry.filter(e => e.event === 'frame');
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
            const minFps = Math.min(...fpsValues);
            const maxFps = Math.max(...fpsValues);
            console.log('minFps',minFps);
            console.log('maxFps',maxFps);
            // Allow 40–72 FPS for mobile compatibility. No upper bound as game is harder when faster.
            if (minFps < 40) {
              console.log('minFps < 40',minFps, '<', '40');
              return new Response(JSON.stringify({ status: 'error', message: 'FPS out of acceptable range' }), { status: 400 });
            }
            // Check for suspicious FPS variance (e.g., >20 FPS change)
            if (maxFps - minFps > 15) {
              console.log('maxFps - minFps > 15',maxFps,' -', minFps, '>',' 15');
              return new Response(JSON.stringify({ status: 'error', message: 'Suspicious FPS variance during game' }), { status: 400 });
            }
            
            // All games check that difficultyFactor progresses correctly.
            const difficultyFactorTime = 
                    stats.game === 'fly'? FLY_PARAMETERS.DIFFICULTY_FACTOR_TIME:
                    stats.game === 'jump'? JUMP_PARAMETERS.DIFFICULTY_FACTOR_TIME:
                    stats.game === 'shoot'? SHOOT_PARAMETERS.DIFFICULTY_FACTOR_TIME: 0;
            //const firstFrameId = telemetry.find(e => e.event === 'frame')?.data?.frameId || 10;
            //const frameInterval = 1000 / minFps; // Assume 60 FPS
            //const offset = (firstFrameId - 1) * frameInterval; // Adjust for frames before first logged event and miliseconds to seconds  
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
            const deltaTimes = frameEvents.map(e => e.data.deltaTime);
            const avgDeltaTime = deltaTimes.reduce((a, b) => a + b, 0) / deltaTimes.length;
            const deltaVariance = deltaTimes.reduce((a, b) => a + Math.pow(b - avgDeltaTime, 2), 0) / deltaTimes.length;
            if (deltaVariance < 1e-7 || deltaVariance > 0.0012) { // 0.0000001 to 0.0001 s²
              console.log('Delta time variance check failed for',{ 
                address,
                gameId,
                gameName: stats.game,
                deltaTimes,
                deltaVariance,
              });
              return new Response(JSON.stringify({ status: 'error', message: 'Suspicious deltaTime variance' }), { status: 400 });
            }
            
            //All games events filtered required
            const spawnEvents = telemetry.filter(e => e.event === 'spawn');
            //const frameSwpawnEvents = telemetry.filter(e => e.event === 'frame' || e.event === 'spawn');
            // common duration and score checks for TIME based games
            if (stats.game === 'fly' || stats.game === 'jump') {
              // validate recaptcha token for bot detection
              try {
                const recaptchaResponse = await fetch(
                  `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaTokenEnd}`
                );
                const recaptchaData = await recaptchaResponse.json();
                console.log('reCAPTCHA END data:', recaptchaData);
                if (!recaptchaData.success || recaptchaData.score < FLY_PARAMETERS.RECAPTCHA_END_THRESHOLD) {
                  console.log('!recaptchaData.success || recaptchaData.score < FLY_PARAMETERS.RECAPTCHA_END_THRESHOLD',
                    !recaptchaData.success, '||', recaptchaData.score, '<', FLY_PARAMETERS.RECAPTCHA_END_THRESHOLD);
                  return new Response(JSON.stringify({ status: 'error', message: 'CAPTCHA failed. You behaved like a bot' }), {
                    status: 403,
                  });
                }
              } catch (error) {
                console.error('reCAPTCHA error:', error);
                //continue because backend mistake and not player's fault
                //assume player is human
              }
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
              let computedScore = 0;
             // if (telemetryLength < TELEMETRY_LIMIT-1) { //*************keep for now only for the code. Delete check and else before production
              // Simple sum for games with complete telemetry
              for (const event of frameEvents) {
                  computedScore += event.data.deltaTime * FLY_PARAMETERS.SCORE_MULTIPLIER;
              }
              // } else {
              //   // Estimate first frame score for games with truncated telemetry
              //   let firstFrameTime = null;
              //   let firstFrameScore = null;
              //   let frameEventsProcessed = false;
                
              //   for (const event of frameEvents) {
              //     if (firstFrameTime === null) {
              //       firstFrameTime = event.time;
              //       firstFrameScore = event.data.score;
              //       const gameStartTime = firstFrameTime - stats.time;
              //       const elapsedTimeSeconds = (firstFrameTime - gameStartTime) / 1000;
              //       computedScore = elapsedTimeSeconds * FLY_PARAMETERS.SCORE_MULTIPLIER;
              //       if (Math.abs(computedScore - firstFrameScore) > computedScore * 0.1) {
              //         return new Response(JSON.stringify({ status: 'error', message: 'Suspicious first frame score' }), { status: 400 });
              //       }
              //     } else {
              //       computedScore += event.data.deltaTime * FLY_PARAMETERS.SCORE_MULTIPLIER;
              //     }
              //     frameEventsProcessed = true;
              //   }
              //   if (!frameEventsProcessed) {
              //     computedScore = gameTimeSec * FLY_PARAMETERS.SCORE_MULTIPLIER;
              //   }
              // }
              console.log('computedScore', computedScore);
              if (Number(score) > computedScore * 1.1) {
                console.log('Number(score) > computedScore * 1.1', Number(score), '>', computedScore, '* 1.1');
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious score: computed events and reported score don’t match' }), { status: 400 });
              }
            }
                        
			      // Stats validation and telemetry validation specific to each Game
            // FLY GAME
            if (stats.game === 'fly') {
                           
              // SPAWN RELATED VALIDATION
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

              // Dynamic spawn count validation
              let expectedSpawns = 0;
              let expectedDoubleSpawns = 0;
              for (let t = 0; t < gameTimeSec; t++) {
                const difficultyFactor = Math.min(t / FLY_PARAMETERS.DIFFICULTY_FACTOR_TIME, 1);
                const spawnInterval = 2.5 * (1 - difficultyFactor) + 0.3; // in seconds
                const clusterChance = difficultyFactor * 0.3;
                const spawnsPerSecond = 1 / spawnInterval;
                expectedSpawns += spawnsPerSecond * (1 + clusterChance);
                expectedDoubleSpawns += spawnsPerSecond * clusterChance;
              }
              // Spawn count tolerance
              const spawnStdDev = Math.sqrt(expectedSpawns * (1 + 0.3) * (1 - (1 + 0.3))); // Approximate variance for obstacles
              const spawnTolerance = 1.5 * spawnStdDev;
              const minExpectedSpawns = expectedSpawns - spawnTolerance;
              const maxExpectedSpawns = expectedSpawns + spawnTolerance;
              console.log('spawnTolerance',spawnTolerance);
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

              // Double spawn tolerance
              const doubleSpawnStdDev = Math.sqrt(expectedDoubleSpawns * 0.3 * (1 - 0.3)); // Variance for double spawns
              const doubleSpawnTolerance = 1.5 * doubleSpawnStdDev;
              console.log('doubleSpawnTolerance',doubleSpawnTolerance);
              console.log('expectedDoubleSpawns',expectedDoubleSpawns);
              console.log('actual double spawn',doubleSpawnCount);
              if (doubleSpawnCount < expectedDoubleSpawns - doubleSpawnTolerance) {
                console.log('Suspicious double spawn count', {
                    doubleSpawnCount,
                    expectedDoubleSpawns,
                    doubleSpawnTolerance
                });
                return new Response(JSON.stringify({ Wstatus: 'error', message: 'Suspicious double spawn count' }), { status: 400 });
              }

              // Validate maxObstacles range
              let minObstacles, maxObstacles;
              if (gameTimeSec <= FLY_PARAMETERS.DIFFICULTY_FACTOR_TIME * 0.33) { minObstacles = 1; maxObstacles = 4; }
              else if (gameTimeSec <= FLY_PARAMETERS.DIFFICULTY_FACTOR_TIME * 0.66) { minObstacles = 2; maxObstacles = 6; }
              else if (gameTimeSec <= FLY_PARAMETERS.DIFFICULTY_FACTOR_TIME) { minObstacles = 6; maxObstacles = 18; }
              else { minObstacles = 12; maxObstacles = 20; }
              if (stats.maxObstacles < minObstacles || stats.maxObstacles > maxObstacles) {
                console.log('Suspicious maxObstacles', {
                    maxObstacles: stats.maxObstacles,
                    minObstacles,
                    maxObstacles
                });
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious maxObstacles: outside expected range' }), { status: 400 });
              }
              // END SPAWN RELATED VALIDATION
              

              // FLAPS RELATED VALIDATOINS
              // validate stats.flapsPerSec matches the number of flap and events in telemetry
              const flapEvents = telemetry.filter(e => e.event === 'flap').length;
              const expectedFlapsPerSec = flapEvents / gameTimeSec;
              if (Math.abs(stats.flapsPerSec - expectedFlapsPerSec) > 0.5) {
                console.log('Math.abs(stats.flapsPerSec - expectedFlapsPerSec) > 0.5',
                  'Math.abs(',stats.flapsPerSec,' - ',expectedFlapsPerSec,') > 0.5'
                );
                  return new Response(JSON.stringify({ status: 'error', message: 'Suspicious flapsPerSec vs flap events patterns' }), { status: 400 });
              }
              //validate the flapspersec against inputsPerSec
              if (Math.abs(stats.flapsPerSec - stats.inputsPerSec) > 0.01) {
                console.log('Math.abs(stats.flapsPerSec - stats.inputsPerSec) > 0.01',
                  'Math.abs(',stats.flapsPerSec,' - ',stats.inputsPerSec,') > 0.01'
                );
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious stats flapsPerSec vs inputsPerSec ' }), { status: 400 });
              } 
              // Validate flap plausibility
              let lastFlapTime = null;
              let lastY = null;
              for (const event of telemetry) {
                if (event.event === 'flap') {
                  if (lastFlapTime && lastY) {
                    const timeDiff = (event.time - lastFlapTime) / 1000;
                    const expectedY = lastY + event.data.vy * timeDiff + 0.5 * timeDiff * timeDiff * FLY_PARAMETERS.GRAVITY; // GRAVITY = 0.2
                    if (Math.abs(event.data.y - expectedY) > 10) {
                      console.log('Math.abs(event.data.y - expectedY) > 10 Math.abs(',event.data.y,' - ',expectedY,') > 10');
                      return new Response(JSON.stringify({ status: 'error', message: 'Suspicious play: flap position' }), {
                        status: 400,
                      });
                    }
                  }
                  lastFlapTime = event.time;
                  lastY = event.data.y;
                }
              }
              //validate flap events timing
              const flapIntervals = [];
              for (let i = 1; i < flapEvents.length; i++) {
                flapIntervals.push(flapEvents[i].time - flapEvents[i - 1].time);
              }
              const avgInterval = flapIntervals.reduce((a, b) => a + b, 0) / flapIntervals.length;
              const flapIntervalVariance = flapIntervals.reduce((a, b) => a + Math.pow(b - avgInterval, 2), 0) / flapIntervals.length;
              if (flapIntervalVariance < 10) { // Low variance indicates robotic consistency
                console.log('flapIntervalVariance < 10',flapIntervalVariance, '< 10');
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious play: flap timing too robotic' }), { status: 400 });
              }
              // Validate minimum flaps per second required to not hit the ground
              if (stats.flapsPerSec < FLY_PARAMETERS.MIN_FLAPS_PER_SEC) {
                console.log('stats.flapsPerSec < FLY_PARAMETERS.MIN_FLAPS_PER_SEC',
                  stats.flapsPerSec, '<', FLY_PARAMETERS.MIN_FLAPS_PER_SEC
                );
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious gameplay stats: too few flaps per second' }), {
                  status: 400,
                });
              }
              // Validate maximum flaps per second humanly possible for long games that will have obstacle on top
              if (stats.flapsPerSec > FLY_PARAMETERS.MAX_FLAPS_PER_SEC) {
                console.log('stats.flapsPerSec > FLY_PARAMETERS.MAX_FLAPS_PER_SEC',
                  stats.flapsPerSec, '>', FLY_PARAMETERS.MAX_FLAPS_PER_SEC);
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious gameplay stats: excessive flaps per second' }), {
                  status: 400,
                });
              }

              // Fly game check between frame actions
              // Check if game physics between frames are in position and plausible
              const frameFlapEvents = telemetry.filter(e => e.event === 'frame' || e.event === 'flap');

              let lastFrame = null;
              let frameIndex = 0;
              const frames = 10;

              for (let i = 0; i < frameFlapEvents.length; i++) {
                if (frameFlapEvents[i].event === 'frame' && lastFrame) {// && lastFrame.frameId > 0) { //was 50. check if this is ok? *****
                  const event = frameFlapEvents[i];
                  const deltaTime = event.data.deltaTime;
                  // Collect flaps between lastFrame.time and event.time
                  const flapsBetween = [];
                  for (let j = frameIndex + 1; j < i; j++) {
                    if (frameFlapEvents[j].event === 'flap') {
                      flapsBetween.push(frameFlapEvents[j]);
                    }
                  }
                  frameIndex = i;

                  let currentY = lastFrame.data.y;
                  let currentVy = lastFrame.data.vy;
                  const frameDeltaTime = deltaTime / frames;

                  for (let k = 0; k < frames; k++) {
                    const frameStartTime = lastFrame.time + k * frameDeltaTime * 1000;
                    const frameEndTime = frameStartTime + frameDeltaTime * 1000;
                    const hasFlap = flapsBetween.some(
                      flap => flap.time > frameStartTime && flap.time <= frameEndTime
                    );
                    if (hasFlap) {
                      currentVy = FLY_PARAMETERS.FLAP_VELOCITY;
                    }
                    currentVy += FLY_PARAMETERS.GRAVITY;
                    currentY += currentVy;
                  }
                  if (Math.abs(event.data.y - currentY) > 15) {
                    console.log('Frame position check failed', {
                      address,
                      gameId,
                      gameName: stats.game,
                      event,
                      lastFrame,
                      expectedY: currentY,
                      actualY: event.data.y,
                      flapsBetween,
                      computedVy: currentVy
                    });
                    return new Response(JSON.stringify({ status: 'error', message: 'Suspicious frame position' }), { status: 400 });
                  }
                }
                if (frameFlapEvents[i].event === 'frame') {
                  lastFrame = frameFlapEvents[i];
                }
              }

              // SHOOT GAME
            } else if (stats.game === 'shoot') {
              // validate recaptcha token for bot detection
              try {
                const recaptchaResponse = await fetch(
                  `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaTokenEnd}`
                );
                const recaptchaData = await recaptchaResponse.json();
                if (!recaptchaData.success || recaptchaData.score < SHOOT_PARAMETERS.RECAPTCHA_END_THRESHOLD) {
                  return new Response(JSON.stringify({ status: 'error', message: 'CAPTCHA failed. You behaved like a bot' }), {
                    status: 403,
                  });
                }
              } catch (error) {
                console.error('reCAPTCHA error:', error);
                //continue because backend mistake and not player's fault
                //assume player is human
              }
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
        gameDurationStore.set(address, Date.now());
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
