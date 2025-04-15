// src/app/api/csrf/route.js
import { randomBytes } from 'crypto';
import { getCsrfTokens } from 'src/lib/csrfStore';

const csrfTokens = getCsrfTokens(); // Use shared Map

export async function GET(request) {
  const appOrigin = request.headers.get('x-app-origin');
  const allowedOrigin = process.env.APP_ORIGIN;

  if (appOrigin !== null && appOrigin !== allowedOrigin) {
    return new Response(JSON.stringify({ status: 'error', message: 'Invalid origin' }), { status: 403 });
  }

  const cookies = request.headers.get('cookie') || '';
  const sessionIdMatch = cookies.match(/sessionId=([^;]+)/);
  let sessionId = sessionIdMatch ? sessionIdMatch[1] : null;

  if (!sessionId) {
    sessionId = randomBytes(16).toString('hex');
  }
  
  // if (csrfTokens.get(sessionId)) {
  //   return new Response(JSON.stringify({ token: csrfTokens.get(sessionId) }), {
  //     status: 200,
  //     headers: {
  //       'Content-Type': 'application/json',
  //       'Access-Control-Allow-Origin': allowedOrigin,
  //       'Access-Control-Allow-Credentials': 'true',
  //     },
  //   });
  // }

  const token = randomBytes(32).toString('hex');
  csrfTokens.set(sessionId, token);

  const response = new Response(JSON.stringify({ token }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Credentials': 'true',
    },
  });
  response.headers.set('Set-Cookie', `sessionId=${sessionId}; secure: true; HttpOnly; Path=/; SameSite=Strict`);
  return response;
}
