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

function validateFlyFlapTelemetry(telemetry, stats, frameEvents, flapEvents, gameTimeSec, address, avgFps) {
  
  // 1. Flap Plausibility Validation
  let lastFlapTime = null;
  let lastY = null;
  let lastVy = null;
  let lastFrameY = null;
  let lastFrameTime = null;
  let lastFrameVy = null;
  let lastFrame = null;
  let frameIndex = 0;

  for (let i = 0; i < telemetry.length; i++) {
    const event = telemetry[i];

    // Track recent frame event
    if (event.event === 'frame') {
      lastFrameY = event.data.y;
      lastFrameTime = event.time;
      lastFrameVy = event.data.vy;
      lastFrame = event;

      // Frame physics check (replaces separate frameFlapEvents loop)
      if (lastFrame && frameIndex > 0) {
        const deltaTime = event.data.deltaTime; // Time for 10 frames
        const frameDeltaTime = deltaTime / 10; // Per-frame time
        let currentY = lastFrame.data.y;
        let currentVy = lastFrame.data.vy;

        // Collect flaps between lastFrame.time and event.time
        const flapsBetween = telemetry.slice(frameIndex + 1, i).filter(e => e.event === 'flap');

        for (let k = 0; k < 10; k++) {
          const frameStartTime = lastFrame.time + k * frameDeltaTime * 1000;
          const frameEndTime = frameStartTime + frameDeltaTime * 1000;
          const hasFlap = flapsBetween.some(flap => flap.time > frameStartTime && flap.time <= frameEndTime);
          if (hasFlap) {
            currentVy = FLY_PARAMETERS.FLAP_VELOCITY; // -5
          }
          currentVy += FLY_PARAMETERS.GRAVITY; // 0.2
          currentY += currentVy;
        }

        if (Math.abs(event.data.y - currentY) > 15) {
          console.log('Frame position check failed', {
            address,
            expectedY: currentY,
            actualY: event.data.y,
            lastFrame,
            flapsBetween,
          });
          return new Response(JSON.stringify({ status: 'error', message: 'Suspicious frame position' }), { status: 400 });
        }
      }
      frameIndex = i;
    }

    if (event.event === 'flap') {
      if (!event.data.deltaTime || !Number.isFinite(event.data.deltaTime) || event.data.deltaTime < 0 || event.data.deltaTime > 0.025) {
        console.log('Invalid deltaTime in flap event', { event });
        return new Response(JSON.stringify({ status: 'error', message: 'Invalid flap telemetry: missing or invalid deltaTime' }), { status: 400 });
      }

      if (lastFlapTime && lastY && lastVy) {
        const timeDiff = (event.time - lastFlapTime) / 1000; // Total time between flaps in seconds
        const wholeFrames = Math.floor((timeDiff - event.data.deltaTime) * avgFps); // Number of whole frames
        const partialTime = timeDiff - (wholeFrames / avgFps); // Remaining time (including flap's deltaTime)

        // Simulate discrete physics for whole frames
        let currentY = lastY;
        let currentVy = lastVy;
        for (let i = 0; i < wholeFrames; i++) {
          currentVy += FLY_PARAMETERS.GRAVITY; // 0.2 per frame
          currentY += currentVy; // Update y
        }

        // Apply continuous physics for the partial frame
        const expectedY = currentY + currentVy * partialTime + 0.5 * FLY_PARAMETERS.GRAVITY * partialTime * partialTime;

        // Check if reported y is within tolerance
        const tolerance = 10; // Tighter tolerance due to precise timing
        console.log('event.data.y - expectedY', event.data.y - expectedY);
        if (Math.abs(event.data.y - expectedY) > tolerance) {
          console.log('Suspicious play: flap position', {
            address,
            expectedY,
            eventY: event.data.y,
            event,
            timeDiff,
            wholeFrames,
            partialTime,
            currentVy,
          });
          return new Response(JSON.stringify({ status: 'error', message: 'Suspicious play: flap position' }), { status: 400 });
        }

        // Cross-validate with recent frame event
        if (lastFrameY && lastFrameTime && lastFrameVy && (event.time - lastFrameTime) / 1000 < 0.2) { // Frame within 200ms
          const timeSinceFrame = (event.time - lastFrameTime) / 1000;
          const frameExpectedY = lastFrameY + lastFrameVy * timeSinceFrame + 0.5 * FLY_PARAMETERS.GRAVITY * timeSinceFrame * timeSinceFrame;
          console.log('event.data.y - frameExpectedY',event.data.y - frameExpectedY);
          if (Math.abs(event.data.y - frameExpectedY) > tolerance) {
            console.log('Suspicious play: flap position inconsistent with frame', {
              address,
              frameExpectedY,
              eventY: event.data.y,
              event,
              lastFrameY,
              lastFrameVy,
              timeSinceFrame,
            });
            return new Response(JSON.stringify({ status: 'error', message: 'Suspicious play: flap position inconsistent with frame telemetry' }), { status: 400 });
          }
        }
      }

      lastFlapTime = event.time;
      lastY = event.data.y;
      lastVy = event.data.vy;
    }
  }

  // 2. Validate deltaTime Consistency
  const flapEvents = telemetry.filter(e => e.event === 'flap');
  const totalDeltaTime = flapEvents.reduce((sum, e) => sum + (e.data.deltaTime || 0), 0);
  const expectedDeltaTime = frameEvents.length / avgFps; // Total frame time based on frame count and avgFps
  console.log('totalDeltaTime - expectedDeltaTime',totalDeltaTime - expectedDeltaTime);
  if (Math.abs(totalDeltaTime - expectedDeltaTime) > 0.5) {
    console.log('Suspicious deltaTime sum', { totalDeltaTime, expectedDeltaTime });
    return new Response(JSON.stringify({ status: 'error', message: 'Suspicious deltaTime in telemetry' }), { status: 400 });
  }
  // check flap interval timing
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
  // Check individual deltaTime values
  for (const event of flapEvents) {
    console.log('event.data.deltaTime > 1 / minFps || event.data.deltaTime < 1 / maxFps',
                  event.data.deltaTime,' > ',1 / minFps,' || ',event.data.deltaTime,' < ',1 / maxFps);
    if (event.data.deltaTime > 1 / minFps || event.data.deltaTime < 1 / maxFps) {
      console.log('Suspicious deltaTime value', { deltaTime: event.data.deltaTime, minFps, maxFps });
      return new Response(JSON.stringify({ status: 'error', message: 'Suspicious deltaTime value in flap telemetry' }), { status: 400 });
    }
  }

  // 3. Check Frame Event Gaps
  let lastFrameTimeCheck = null;
  for (const event of telemetry) {
    if (event.event === 'frame') {
      if (lastFrameTimeCheck) {
        const frameGap = (event.time - lastFrameTimeCheck) / 1000; // Time between frame events in seconds
        const expectedGap = 10 / avgFps; // Expected gap for 10 frames
        console.log('Math.abs(frameGap - expectedGap) > expectedGap * 0.2', (Math.abs(frameGap - expectedGap),' > ',expectedGap * 0.2));
        if (Math.abs(frameGap - expectedGap) > expectedGap * 0.2) { // Allow 20% variance
          console.log('Suspicious frame event timing', { frameGap, expectedGap });
          return new Response(JSON.stringify({ status: 'error', message: 'Suspicious frame event timing' }), { status: 400 });
        }
      }
      lastFrameTimeCheck = event.time;
    }
  }

  // 4. Validate Flap Frequency
  const flapCount = flapEvents.length;
  const expectedFlapsPerSec = flapCount / gameTimeSec;
  console.log('Math.abs(stats.flapsPerSec - expectedFlapsPerSec) > 0.5',
            Math.abs(stats.flapsPerSec - expectedFlapsPerSec),' > ',0.5
  );
  if (Math.abs(stats.flapsPerSec - expectedFlapsPerSec) > 0.5) {
    console.log('Suspicious flapsPerSec vs flap events', {
      statsFlapsPerSec: stats.flapsPerSec,
      expectedFlapsPerSec,
    });
    return new Response(JSON.stringify({ status: 'error', message: 'Suspicious flapsPerSec vs flap events patterns' }), { status: 400 });
  }

  // Cross-check flap effects in frame events
  const flapEffectFrames = frameEvents.filter(e => Math.abs(e.data.vy - FLY_PARAMETERS.FLAP_VELOCITY) < 0.1).length;
  const expectedFlapEffectFrames = flapCount * (avgFps / 10); // Approximate frames showing vy ≈ -5
  console.log('flapEffectFrames < expectedFlapEffectFrames * 0.5', flapEffectFrames,' < ',expectedFlapEffectFrames * 0.5);
  if (flapEffectFrames < expectedFlapEffectFrames * 0.5) { // Allow 50% variance
    console.log('Suspicious flap frequency in frame events', {
      flapEffectFrames,
      expectedFlapEffectFrames,
    });
    return new Response(JSON.stringify({ status: 'error', message: 'Suspicious flap frequency: inconsistent with frame telemetry' }), { status: 400 });
  }

  // Existing flapsPerSec vs inputsPerSec check
  console.log('Math.abs(stats.flapsPerSec - stats.inputsPerSec) > 0.01', Math.abs(stats.flapsPerSec - stats.inputsPerSec),' > 0.01');
  if (Math.abs(stats.flapsPerSec - stats.inputsPerSec) > 0.01) {
    console.log('Suspicious flapsPerSec vs inputsPerSec', {
      statsFlapsPerSec: stats.flapsPerSec,
      statsInputsPerSec: stats.inputsPerSec,
    });
    return new Response(JSON.stringify({ status: 'error', message: 'Suspicious stats flapsPerSec vs inputsPerSec' }), { status: 400 });
  }

  // Existing min/max flaps per second checks
  console.log('stats.flapsPerSec < FLY_PARAMETERS.MIN_FLAPS_PER_SEC',stats.flapsPerSec,' < ',FLY_PARAMETERS.MIN_FLAPS_PER_SEC);
  if (stats.flapsPerSec < FLY_PARAMETERS.MIN_FLAPS_PER_SEC) {
    console.log('stats.flapsPerSec < MIN_FLAPS_PER_SEC', stats.flapsPerSec, '<', FLY_PARAMETERS.MIN_FLAPS_PER_SEC);
    return new Response(JSON.stringify({ status: 'error', message: 'Suspicious gameplay stats: too few flaps per second' }), { status: 400 });
  }
  console.log('stats.flapsPerSec > FLY_PARAMETERS.MAX_FLAPS_PER_SEC',stats.flapsPerSec,' > ',FLY_PARAMETERS.MAX_FLAPS_PER_SEC);
  if (stats.flapsPerSec > FLY_PARAMETERS.MAX_FLAPS_PER_SEC) {
    console.log('stats.flapsPerSec > MAX_FLAPS_PER_SEC', stats.flapsPerSec, '>', FLY_PARAMETERS.MAX_FLAPS_PER_SEC);
    return new Response(JSON.stringify({ status: 'error', message: 'Suspicious gameplay stats: excessive flaps per second' }), { status: 400 });
  }

  // All validations passed
  return true; // Or proceed with score submission
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
            const avgFps = Math.mean(...fpsValues);
            console.log('minFps',minFps);
            console.log('maxFps',maxFps);
            console.log('avgFps',avgFps);
            // Allow 40–72 FPS for mobile compatibility. No upper bound as game is harder when faster.
            if (minFps < 40) {
              console.log('minFps < 40',minFps, '<', '40');
              return new Response(JSON.stringify({ status: 'error', message: 'FPS out of acceptable range' }), { status: 400 });
            }
            // Check for suspicious FPS variance (e.g., >10 FPS change)
            if (maxFps - minFps > 10) {
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

              // Dynamic spawn count, double spawn count, and max obstacle count caluculations 
              let expectedSpawns = 0;
              let expectedDoubleSpawns = 0;
              let expectedMaxObstacles = 0;
              for (let t = 0; t < gameTimeSec; t++) {
                const difficultyFactor = Math.min(t / FLY_PARAMETERS.DIFFICULTY_FACTOR_TIME, 1);
                const spawnInterval = 2.5 * (1 - difficultyFactor) + 0.3; // in seconds
                const clusterChance = difficultyFactor * 0.3;
                const spawnsPerSecond = 1 / spawnInterval;
                const obstacleSpeed = Math.abs(FLY_PARAMETERS.BASE_OBSTACLE_SPEED * (1 + difficultyFactor)); // pixels per frame
                const timeToCross = stats.canvasWidth / obstacleSpeed * (1 / 60); // seconds to cross screen
                const maxObstaclesAtTime = timeToCross * spawnsPerSecond * (1 + clusterChance);
                expectedMaxObstacles = Math.max(expectedMaxObstacles, maxObstaclesAtTime);
                expectedSpawns += spawnsPerSecond * (1 + clusterChance);
                expectedDoubleSpawns += spawnsPerSecond * clusterChance;
              }
              console.log('expectedSpawns',expectedSpawns);
              // expected total spawn calculation and validations
              const spawnStdDev = Math.sqrt(Math.abs(expectedSpawns * (1 + 0.3) * (1 - (1 + 0.3)))); // Approximate variance for obstacles
              console.log('spawnStdDev',spawnStdDev);
              const spawnTolerance = 1.5 * spawnStdDev;
              const minExpectedSpawns = expectedSpawns - spawnTolerance;
              const maxExpectedSpawns = expectedSpawns + spawnTolerance*1.5;
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
              // Expected Double spawn calculations and validations
              const doubleSpawnStdDev = Math.sqrt(expectedDoubleSpawns * 0.3 * (1 - 0.3)); // Variance for double spawns
              const doubleSpawnTolerance = 1.7 * doubleSpawnStdDev;
              const minExpectedDoubleSpawns = expectedDoubleSpawns - doubleSpawnTolerance;
              const maxExpectedDoubleSpawns = expectedDoubleSpawns + doubleSpawnTolerance*1.5;
              console.log('doubleSpawnTolerance',doubleSpawnTolerance);
              console.log('expectedDoubleSpawns',expectedDoubleSpawns);
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
              const maxObstaclesStdDev = Math.sqrt(Math.abs(expectedMaxObstacles * (1 + 0.3) * (1 - (1 + 0.3))));
              const maxObstaclesTolerance = 1.5 * maxObstaclesStdDev;
              const minExpectedMaxObstacles = expectedMaxObstacles - maxObstaclesTolerance;
              const maxExpectedMaxObstacles = expectedMaxObstacles + maxObstaclesTolerance*2;
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
              

              // FLAPS RELATED VALIDATOINS
              validateFlyFlapTelemetry(telemetry, stats, frameEvents, gameTimeSec, address, avgFps);
              //validate flap events timing
              
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
