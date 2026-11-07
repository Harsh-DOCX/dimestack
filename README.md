# DimeStack

Personal finance tracker (React, Express, MongoDB).

## Run locally

```bash
npm install
npm install --prefix server
npm install --prefix frontend
npm start
```

The site is at http://localhost:3000 and the API at http://localhost:5000.

If MongoDB is not installed, the API uses an embedded database and writes backups to `server/backups`. Set `MONGO_URI` in `server/.env` (see `server/.env.example`) to use your own database.

Copy `server/.env.example` to `server/.env` before adding Google OAuth or SMTP. Without SMTP, verification and password-reset messages are printed by the API and shown in the form.

## Deploy: Render API + Vercel frontend

The repository includes a Render Blueprint in `render.yaml` and Vercel rewrites in `frontend/vercel.json`. Vercel proxies `/api/*` to Render so API requests, OAuth callbacks, and auth cookies use the Vercel origin in the browser.

### Render

1. Create a Render Blueprint from this repository and deploy the `dimestack-api` web service. Its root directory is `server`.
2. Create a persistent MongoDB database (for example MongoDB Atlas) and set `MONGO_URI` in the Render service.
3. Set `CLIENT_ORIGIN` and `SITE_URL` to the exact Vercel production origin, such as `https://dimestack.vercel.app`. Multiple allowed origins can be comma-separated for `CLIENT_ORIGIN`.
4. Set `API_ORIGIN` to the Render service URL, such as `https://dimestack-akju.onrender.com`.
5. Set `SITE_URL` to the public frontend URL. Keep `JWT_SECRET` unique and private; the Blueprint generates it.
6. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` to enable verification and password-reset email.

The production server refuses to start without `MONGO_URI`, a non-default `JWT_SECRET`, and secure cookies.

### Vercel

1. Import the repository in Vercel and set the project root directory to `frontend`.
2. Remove `REACT_APP_API_URL` from Vercel if you added it earlier. The frontend calls same-origin `/api/*` routes, and `frontend/vercel.json` proxies them to Render.
3. Deploy or redeploy after changing the Vercel rewrite or environment settings.

### Cookies, domains, and Google sign-in

The Vercel proxy keeps browser API traffic and auth cookies on the Vercel origin, avoiding third-party cookie blocking. Keep `COOKIE_SAME_SITE=lax` and `COOKIE_SECURE=true` in Render.

For Google sign-in, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL` on Render. Set the callback URL to `https://<frontend-domain>/api/auth/google/callback` (for example `https://dimestack.vercel.app/api/auth/google/callback`) and register that exact URL under Authorized redirect URIs in Google Cloud Console. Add `https://<frontend-domain>` under Authorized JavaScript origins. Use HTTPS, not HTTP.

Never put database credentials, JWT secrets, SMTP passwords, or OAuth client secrets in Vercel environment variables or frontend files.
