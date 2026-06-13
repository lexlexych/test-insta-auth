// GET /api/callback
// Шаги 4-7: принимает code, на сервере обменивает его на short-lived токен,
// затем на long-lived (60 дней), запрашивает /me и рендерит страницу с токеном.

const GRAPH = 'https://graph.instagram.com/v25.0';
const TOKEN_URL = 'https://api.instagram.com/oauth/access_token';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const CSS = `
:root{--bg:#0f172a;--panel:#1e293b;--border:#334155;--text:#e2e8f0;--muted:#94a3b8;--accent:#2dd4bf;--danger:#f87171;--code:#0b1220}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:680px;margin:0 auto;padding:40px 22px 80px}
h1{font-size:22px;margin:0 0 4px;letter-spacing:.2px}
.ok{color:var(--accent)} .err{color:var(--danger)}
.lede{color:var(--muted);margin:0 0 26px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:6px 20px;margin:0 0 22px}
.row{display:flex;justify-content:space-between;gap:14px;padding:13px 0;border-bottom:1px solid var(--border)}
.row:last-child{border-bottom:none}
.row .k{color:var(--muted);font-size:13px}
.row .v{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;text-align:right;word-break:break-all}
.tag{color:var(--accent)}
h2{font-size:14px;color:var(--muted);font-weight:600;margin:26px 0 9px;text-transform:uppercase;letter-spacing:.5px}
.tokwrap{position:relative}
pre{background:var(--code);border:1px solid var(--border);border-radius:10px;padding:16px;overflow:auto;
  font:13px ui-monospace,monospace;color:#cbd5e1;white-space:pre-wrap;word-break:break-all;margin:0}
.copy{position:absolute;top:10px;right:10px;cursor:pointer;border:1px solid var(--border);
  background:var(--panel);color:var(--accent);border-radius:8px;padding:7px 13px;font-size:12.5px;font-weight:600}
.copy:hover{filter:brightness(1.15)}
a{color:var(--accent)} .back{display:inline-block;margin-top:22px}
`;

function shell(title, inner) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head>
<body><main class="wrap">${inner}</main></body></html>`;
}

function errorPage(title, detail) {
  return shell(title, `
    <h1 class="err">${esc(title)}</h1>
    <p class="lede">Подробности ответа Instagram ниже — по ним обычно сразу видно причину.</p>
    <pre>${esc(detail)}</pre>
    <a class="back" href="/">← Начать заново</a>`);
}

function successPage({ token, expiresIn, username, userId, permissions }) {
  const days = expiresIn ? Math.round(expiresIn / 86400) : '—';
  const curlSub = `curl -X POST "${GRAPH}/${userId}/subscribed_apps?subscribed_fields=messages&access_token=${token}"`;
  const curlRefresh = `curl "${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}"`;

  return shell('Готово', `
    <h1 class="ok">Аккаунт подключён ✓</h1>
    <p class="lede">Авторизация прошла. Токен получен на серверной стороне.</p>

    <div class="card">
      <div class="row"><span class="k">Username</span><span class="v">@${esc(username)}</span></div>
      <div class="row"><span class="k">Instagram user ID</span><span class="v">${esc(userId)}</span></div>
      <div class="row"><span class="k">Срок жизни токена</span><span class="v">~${esc(days)} дн.</span></div>
      <div class="row"><span class="k">Разрешения</span><span class="v tag">${esc(permissions)}</span></div>
    </div>

    <h2>Long-lived access token (60 дней)</h2>
    <div class="tokwrap">
      <button class="copy" id="copyBtn" type="button">Копировать</button>
      <pre id="token">${esc(token)}</pre>
    </div>

    <h2>Готовые curl-команды</h2>
    <pre>${esc(curlSub)}

# обновление токена (запускать раз в ~50 дней):
${esc(curlRefresh)}</pre>

    <a class="back" href="/">← Подключить ещё один аккаунт</a>

    <script>
      var b = document.getElementById('copyBtn');
      b.addEventListener('click', function () {
        navigator.clipboard.writeText(document.getElementById('token').textContent).then(function () {
          var t = b.textContent; b.textContent = 'Скопировано ✓';
          setTimeout(function () { b.textContent = t; }, 1500);
        });
      });
    </script>`);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const q = req.query || {};
  if (q.error) {
    res.statusCode = 200;
    res.end(errorPage('Авторизация отклонена',
      `${q.error_reason || ''} — ${q.error_description || q.error}`));
    return;
  }

  const code = q.code ? String(q.code).replace(/#_$/, '') : '';
  if (!code) {
    res.statusCode = 400;
    res.end(errorPage('Нет кода', 'В callback не пришёл параметр code.'));
    return;
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    res.statusCode = 500;
    res.end(errorPage('Нет конфигурации',
      'Проверьте переменные окружения INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, REDIRECT_URI в Vercel.'));
    return;
  }

  try {
    // Шаг 5: code -> short-lived token
    const form = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    });
    const r1 = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const j1 = await r1.json();
    const short = Array.isArray(j1.data) ? j1.data[0] : j1;
    if (!short || !short.access_token) {
      res.statusCode = 200;
      res.end(errorPage('Ошибка обмена кода на токен', JSON.stringify(j1, null, 2)));
      return;
    }

    // Шаг 6: short -> long-lived token (60 дней).
    // Документация показывает GET, но эндпоинт для токенов нового формата (IGAA)
    // может отвечать "Unsupported request - method type: get". Поэтому пробуем GET,
    // а при таком отказе — повторяем тот же запрос POST'ом.
    const exParams = `grant_type=ig_exchange_token`
      + `&client_secret=${encodeURIComponent(appSecret)}`
      + `&access_token=${encodeURIComponent(short.access_token)}`;

    let j2 = await (await fetch(`${GRAPH}/access_token?${exParams}`, { method: 'GET' })).json();
    let exGetErr = null;
    if (!j2.access_token) {
      exGetErr = j2;
      j2 = await (await fetch(`${GRAPH}/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: exParams,
      })).json();
    }
    if (!j2.access_token) {
      res.statusCode = 200;
      res.end(errorPage('Ошибка обмена на long-lived токен',
        (exGetErr ? 'Ответ на GET:\n' + JSON.stringify(exGetErr, null, 2) + '\n\n' : '')
        + 'Ответ на POST:\n' + JSON.stringify(j2, null, 2)
        + '\n\nShort-lived токен (валиден 1 час) — им можно проверить обмен вручную:\n'
        + short.access_token));
      return;
    }

    // Шаг 7: кто подключился
    const meUrl = `${GRAPH}/me?fields=user_id,username`
      + `&access_token=${encodeURIComponent(j2.access_token)}`;
    const me = await (await fetch(meUrl, { method: 'GET' })).json();

    res.statusCode = 200;
    res.end(successPage({
      token: j2.access_token,
      expiresIn: j2.expires_in,
      username: me.username || '—',
      userId: me.user_id || short.user_id || '—',
      permissions: short.permissions || '—',
    }));
  } catch (e) {
    res.statusCode = 500;
    res.end(errorPage('Внутренняя ошибка', String((e && e.stack) || e)));
  }
}
