# Instagram Business Login — тестер OAuth (Vercel)

Мини-приложение для проверки потока авторизации Instagram API with Instagram Login.
Поток: кнопка → окно Instagram → возврат с выводом **long-lived токена (60 дней)** и кнопкой копирования.

## Структура

```
ig-oauth-vercel/
├── index.html        # стартовая страница с кнопкой
├── api/
│   ├── login.js      # строит authorize-URL и редиректит в Instagram
│   └── callback.js   # обмен code → short → long-lived токен, вывод на экран
├── package.json
└── README.md
```

## Деплой

1. Залейте папку в репозиторий GitHub (или используйте `vercel` CLI) и импортируйте проект в Vercel. Сборка не нужна — это zero-config (статика + функции в `/api`).

2. **Сначала задеплойте**, чтобы узнать домен проекта — например `https://neuroposts-ig.vercel.app`.

3. В Vercel → **Settings → Environment Variables** добавьте:

   | Имя | Значение |
   |---|---|
   | `INSTAGRAM_APP_ID` | `1284491287135328` (ваш Instagram App ID) |
   | `INSTAGRAM_APP_SECRET` | секрет из Business login settings |
   | `REDIRECT_URI` | `https://<ваш-домен>.vercel.app/api/callback` |
   | `SCOPES` *(опц.)* | `instagram_business_basic,instagram_business_manage_messages` |

   После добавления переменных сделайте **Redeploy**, чтобы они подхватились.

4. В панели Meta: **Instagram → Настройка API для входа в Instagram → настройки входа → URI перенаправления OAuth** добавьте **точно то же** значение `https://<ваш-домен>.vercel.app/api/callback` (символ в символ, включая `/api/callback`).

5. Откройте `https://<ваш-домен>.vercel.app`, нажмите «Подключить Instagram», авторизуйтесь — вернётесь на страницу с токеном.

## Примечания

- App ID и Secret берутся из секции входа для бизнеса в дашборде — это **не** общий Meta App ID/Secret сверху страницы.
- Токен виден на экране — это нормально для теста, но не для прод-кода.
- Для своего аккаунта (с ролью на приложении) всё работает в Standard Access, без App Review. Тот же код без изменений заработает для сторонних аккаунтов после получения Advanced Access.
- Long-lived токен живёт 60 дней; на странице результата есть готовая команда для его обновления.
