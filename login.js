// GET /api/login
// Шаг 1-2: формирует authorize-URL и редиректит пользователя в окно Instagram.
// Никаких секретов здесь нет — только публичный App ID, redirect_uri и scopes.

export default function handler(req, res) {
  const appId = process.env.INSTAGRAM_APP_ID;
  const redirectUri = process.env.REDIRECT_URI;
  const scopes = process.env.SCOPES || 'instagram_business_basic,instagram_business_manage_messages';

  if (!appId || !redirectUri) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Не заданы переменные окружения INSTAGRAM_APP_ID и/или REDIRECT_URI.');
    return;
  }

  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes);
  // state для защиты от CSRF (в проде стоит проверять его в callback через cookie/KV)
  url.searchParams.set('state', Math.random().toString(36).slice(2));
  // заставляет вводить данные именно нужного аккаунта, даже если в браузере залогинен другой
  url.searchParams.set('force_reauth', 'true');

  res.writeHead(302, { Location: url.toString() });
  res.end();
}
