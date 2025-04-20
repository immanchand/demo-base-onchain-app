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
          SHOOT_PARAMETERS } from '../../../constants';

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
    return new Response(JSON.stringify({ status: 'error', message: 'Invalid or missing CSRF token. Press f5 to refresh' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' },
    });
  }

  const { action, gameId, address, score, recaptchaTokenStart, recaptchaTokenEnd, telemetry, stats } = body;
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
        if (!gameId || !address || !score) {
          return new Response(
            JSON.stringify({ status: 'error', message: 'Missing gameId or address or score' }),
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

        //main logig to check telemetry and stats and score and try to send contract transaction
        try {
          // Fetch current highScore from contract
          const gameData = await contract.getGame(gameId);
          const contractHighScore = Number(gameData.highScore.toString());
          console.log('contractHighScore', contractHighScore);
          // early check and return if score is less than contract high score
          if (Number(score) <= contractHighScore) {
            return new Response(
              JSON.stringify({ status: 'success', isHighScore: false, highScore: contractHighScore }),
              { status: 200 }
            );
          }
          // Validate only if score >= 20000 and > contractHighScore
          if (Number(score) >= TELEMETRY_SCORE_THRESHOLD) {
            
            //make sure stats and telemetry are present
            if(!stats || !telemetry) {
              return new Response(JSON.stringify({ status: 'error', message: 'Missing telemetry or stats for high score validation' }), {
                status: 400,
              });
            }
            console.log('telemetry: ', telemetry);
            console.log('stats: ', stats);

            const gameTimeSec = stats.time / 1000;

            // All game check timestamp of last telemetry event collision
            const endEvent = telemetry.find(e => e.event === 'collision');
            if (!endEvent) {
              console.log('No collision event found for game end');
              return new Response(JSON.stringify({ status: 'error', message: 'Missing collision event telemetry' }), {
                status: 400,
              });
            }
            // All gamess Check if server game duration is less than client game duration. With network latency, it should never be less.
            // if less, indicates cheating on client side
            const serverDuration = nowEnd - gameDurationStore.get(address);
            if (serverDuration < stats.time) {
                console.log('GameDurationStore Duration Check failed for',
                    ' Player: ', address,
                    ' Game Id: ', gameId,
                    ' Game Name: ', stats.game,
                    ' Server Game Start: ', gameDurationStore.get(address),
                    ' Server Game End: ', nowEnd,
                    ' Server Game Duration: ', serverDuration,
                    ' Client Game Duration: ', stats.time);
                gameDurationStore.delete(address);
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious Score: game duration is more than expected' }), {
                    status: 400,
                });
            }
            // Detect Game Clock Manipulation
            const frameEvents = telemetry.filter(e => e.event === 'frame');
            const telemetryDuration = frameEvents[frameEvents.length-1].time - frameEvents[0].time;
            if (telemetryDuration > serverDuration) {
              console.log('GameDurationStore Duration Check failed for',
                ' Player: ', address,
                ' Game Id: ', gameId,
                ' Game Name: ', stats.game,
                ' Server Game Start: ', gameDurationStore.get(address),
                ' Server Game End: ', nowEnd,
                ' Server Game Duration: ', serverDuration,
                ' Telemetry Duration: ', telemetryDuration);
              gameDurationStore.delete(address);
              return new Response(JSON.stringify({ status: 'error', message: 'Suspicious telemetry duration vs server duration' }), { status: 400 });
            }
            gameDurationStore.delete(address);
            
            // Check for identical deltaTime values (suspicious for manipulation)
            const deltaTimes = frameEvents.map(e => e.data.deltaTime);
            const avgDeltaTime = deltaTimes.reduce((a, b) => a + b, 0) / deltaTimes.length;
            const deltaVariance = deltaTimes.reduce((a, b) => a + Math.pow(b - avgDeltaTime, 2), 0) / deltaTimes.length;
            if (deltaVariance < 1e-7 || deltaVariance > 1e-4) { // 0.0000001 to 0.0001 s²
              console.log('Delta time variance check failed for',
                ' Player: ', address,
                ' Game Id: ', gameId,
                ' Game Name: ', stats.game,
                ' Delta Times: ', deltaTimes,
                ' Delta Variance: ', deltaVariance);
              return new Response(JSON.stringify({ status: 'error', message: 'Suspicious deltaTime variance' }), { status: 400 });
            }
            
       
            // all games common telemetry check for average fps frames per second
            const fpsEvents = telemetry.filter(e => e.event === 'fps');
            if (fpsEvents.length > 0) {
              const fpsValues = fpsEvents.map(e => e.data.fps);
              const minFps = Math.min(...fpsValues);
              const maxFps = Math.max(...fpsValues);
              // Allow 40–72 FPS for mobile compatibility. No upper bound as game is harder when faster.
              if (minFps < 40) {
                return new Response(JSON.stringify({ status: 'error', message: 'FPS out of acceptable range' }), { status: 400 });
              }
              // Check for suspicious FPS variance (e.g., >20 FPS change)
              if (maxFps - minFps > 15) {
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious FPS variance during game' }), { status: 400 });
              }
            }          
            
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
                  return new Response(JSON.stringify({ status: 'error', message: 'CAPTCHA failed. You behaved like a bot' }), {
                    status: 403,
                  });
                }
              } catch (error) {
                console.error('reCAPTCHA error:', error);
                //continue because backend mistake and not player's fault
                //assume player is human
              }
              // Check if score is less than client side game duration with 1 seconds tolerance for start game
              if (score > (stats.time + TIME_VARIANCE_MS)/SCORE_DIVISOR_TIME) {
                console.log('Duration and score check failed for',
                  ' Player: ', address,
                  ' Game Id: ', gameId,
                  ' Game Name: ', stats.game,
                  ' Client Score: ', score,
                  ' Client Time Score Variance: ', (stats.time + 1000)/SCORE_DIVISOR_TIME);
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious Score: score and game duration dont match' }), {
                  status: 400,
                });
              }

              // telemetry computed score validation
              let computedScore = 0;
              if (telemetry.length < TELEMETRY_LIMIT) {
                // Simple sum for games with complete telemetry
                for (const event of frameEvents) {
                    computedScore += event.data.deltaTime * FLY_PARAMETERS.SCORE_MULTIPLIER;
                }
                console.log('first computedScore', computedScore);
              } else {
                // Estimate first frame score for games with truncated telemetry
                let firstFrameTime = null;
                let firstFrameScore = null;
                let frameEventsProcessed = false;
                
                for (const event of frameEvents) {
                  if (firstFrameTime === null) {
                    firstFrameTime = event.time;
                    firstFrameScore = event.data.score;
                    const gameStartTime = firstFrameTime - stats.time;
                    const elapsedTimeSeconds = (firstFrameTime - gameStartTime) / 1000;
                    computedScore = elapsedTimeSeconds * FLY_PARAMETERS.SCORE_MULTIPLIER;
                    if (Math.abs(computedScore - firstFrameScore) > computedScore * 0.1) {
                      return new Response(JSON.stringify({ status: 'error', message: 'Suspicious first frame score' }), { status: 400 });
                    }
                  } else {
                    computedScore += event.data.deltaTime * FLY_PARAMETERS.SCORE_MULTIPLIER;
                  }
                  frameEventsProcessed = true;
                }
                if (!frameEventsProcessed) {
                  computedScore = gameTimeSec * FLY_PARAMETERS.SCORE_MULTIPLIER;
                  console.log('second computedScore', computedScore);
                }
              }
              console.log('computedScore', computedScore);
              if (Number(score) > computedScore * 1.1) {
                console.log('score', Number(score));
                console.log('computedScore * 1.1', computedScore * 1.1);
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious score: computed events and reported score don’t match' }), { status: 400 });
              }
            }
            //check between frame actions
            // Check if frameId is in order and position is plausible
            let lastFrame = null;
            for (const event of frameEvents) {
              if (lastFrame) {
                const deltaTime = event.data.deltaTime;
                // Find flap events between lastFrame.time and event.time
                const flapsBetween = telemetry.filter(
                  e => e.event === 'flap' && e.time > lastFrame.time && e.time <= event.time
                );
                // Assume velocity could be affected by flaps (vy = FLAP_VELOCITY) or gravity
                const maxVy = lastFrame.frameId < 20 ? FLY_PARAMETERS.FLAP_VELOCITY*2 : lastFrame.data.vy; // Best case: no flaps, just last velocity
                const minVy = lastFrame.frameId < 20 ? FLY_PARAMETERS.GRAVITY : lastFrame.data.vy; // Account for initial vy
                // Calculate expected y range
                const deltaTimePerFrame = event.data.deltaTime / 10;
                const expectedYMax = lastFrame.data.y + maxVy * deltaTimePerFrame + 0.5 * deltaTimePerFrame * deltaTimePerFrame * FLY_PARAMETERS.GRAVITY;
                const expectedYMin = lastFrame.data.y + minVy * deltaTimePerFrame + 0.5 * deltaTimePerFrame * deltaTimePerFrame * FLY_PARAMETERS.GRAVITY;
                // Allow 10px variance outside the range
                if (event.data.y < expectedYMin - 10 || event.data.y > expectedYMax + 10) {
                  console.log('Frame position check failed', {
                    event,
                    lastFrame,
                    expectedYMin,
                    expectedYMax,
                    actualY: event.data.y,
                    flapsBetween
                  });
                  return new Response(JSON.stringify({ status: 'error', message: 'Suspicious frame position' }), { status: 400 });
                }
              }
              lastFrame = event;
            }
            // Telemetry validation
            // Validate collision events
            const collisionEvents = telemetry.filter(e => e.event === 'collision');
            if (collisionEvents.length != 1) {
              return new Response(JSON.stringify({ status: 'error', message: 'Invalid collisions detected' }), {
                status: 400,
              });
            }
            // validate that the last event is a collision
            const lastEvent = telemetry[telemetry.length - 1];
            if (lastEvent.event !== 'collision') {
              return new Response(JSON.stringify({ status: 'error', message: 'Last event must be collision' }), { status: 400 });
            }


			      // Stats validation
            // FLY GAME
            if (stats.game === 'fly') {
							//SPAWN RELETED VALIDATION
              // validate spawn events speed against expected values
              const difficultyFactor = Math.min(stats.time / 90000, 1);
              const expectedSpeed = FLY_PARAMETERS.BASE_OBSTACLE_SPEED * (1 + difficultyFactor);
              const spawnEvents = telemetry.filter(e => e.event === 'spawn');
              for (const event of spawnEvents) {
                if (Math.abs(event.data.speed - expectedSpeed) > 0.1) {
                  return new Response(JSON.stringify({ status: 'error', message: 'Suspicious obstacle speed' }), { status: 400 });
                }
              }
              // Validate obstacle spawns
              const minExpectedSpawns = stats.time / FLY_PARAMETERS.MIN_SPAWN_INTERVAL;
              if (spawnEvents.length < minExpectedSpawns) {
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious play: Too few obstacle spawns' }), {
                  status: 400,
                });
              }
              const spawnInterval = 2500 * (1 - difficultyFactor) + FLY_PARAMETERS.MIN_SPAWN_INTERVAL;
              if (stats.obstaclesCleared > stats.time / spawnInterval) {
                  return new Response(JSON.stringify({ status: 'error', message: 'Suspicious play: number of obstacles dodged' }), { status: 400 });
              }
              
              let minObstacles, maxObstacles;
              if (gameTimeSec <= 30) {
                minObstacles = 1;
                maxObstacles = 3;
              } else if (gameTimeSec <= 60) {
                minObstacles = 2;
                maxObstacles = 4;
              } else if (gameTimeSec <= 90) {
                minObstacles = 3;
                maxObstacles = 6;
              } else {
                minObstacles = 5;
                maxObstacles = 10;
              }
              if (stats.maxObstacles < minObstacles || stats.maxObstacles > maxObstacles) {
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious maxObstacles: outside expected range' }), { status: 400 });
              }
              const expectedSpawns = gameTimeSec <= 90 ? gameTimeSec / 1.55 : (90 / 1.55) + (gameTimeSec - 90) / 0.3;
              if (Math.abs(spawnEvents.length - expectedSpawns * 1.15) > expectedSpawns * 0.2) { // 20% tolerance
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious spawn count' }), { status: 400 });
              }
              //check double spawn events
              let doubleSpawnCount = 0;
              for (let i = 1; i < spawnEvents.length; i++) {
                if (spawnEvents[i].time - spawnEvents[i-1].time < 10) {
                  doubleSpawnCount++;
                  const yDiff = Math.abs(spawnEvents[i].data.y - spawnEvents[i-1].data.y);
                  if (yDiff < FLY_PARAMETERS.OBSTACLE_SIZE * 1.5 * 0.9 || yDiff > FLY_PARAMETERS.OBSTACLE_SIZE * 2 * 1.1) {
                    return new Response(JSON.stringify({ status: 'error', message: 'Invalid cluster spawn spacing' }), { status: 400 });
                  }
                }
              }
              const expectedDoubleSpawns = spawnEvents.length * (stats.time / 90000 * 0.3);
              if (Math.abs(doubleSpawnCount - expectedDoubleSpawns) > expectedDoubleSpawns * 0.1) {
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious cluster spawn frequency' }), { status: 400 });
              }
              //Ensure stats.obstaclesCleared matches the number of obstacles marked as dodged in telemetry
              const dodgedObstacles = telemetry.filter(e => e.event === 'spawn').length;
              if (stats.obstaclesCleared < dodgedObstacles - 2 || stats.obstaclesCleared > dodgedObstacles + 2 ) { // +-2 for tolerance
                return new Response(JSON.stringify({ status: 'error', message: 'Mismatch in obstacles cleared' }), { status: 400 });
              }

              // FLAPS RELATED VALIDATOINS
              // validate stats.flapsPerSec matches the number of flap and keydown events
              const flapEvents = telemetry.filter(e => e.event === 'flap').length;
              const expectedFlapsPerSec = flapEvents / (gameTimeSec || 1);
              if (Math.abs(stats.flapsPerSec - expectedFlapsPerSec) > 0.5) {
                  return new Response(JSON.stringify({ status: 'error', message: 'Suspicious flapsPerSec vs flap events patterns' }), { status: 400 });
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
              const variance = flapIntervals.reduce((a, b) => a + Math.pow(b - avgInterval, 2), 0) / flapIntervals.length;
              if (variance < 10) { // Low variance indicates robotic consistency
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious play: flap timing too robotic' }), { status: 400 });
              }
              // Validate minimum flaps per second required to not hit the ground
              if (stats.flapsPerSec < FLY_PARAMETERS.MIN_FLAPS_PER_SEC) {
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious gameplay stats: too few flaps per second' }), {
                  status: 400,
                });
              }
              // Validate maximum flaps per second humanly possible for long games that will have obstacle on top
              if (stats.flapsPerSec > FLY_PARAMETERS.MAX_FLAPS_PER_SEC) {
                return new Response(JSON.stringify({ status: 'error', message: 'Suspicious gameplay stats: excessive flaps per second' }), {
                  status: 400,
                });
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
