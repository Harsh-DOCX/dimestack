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

The repository includes a Render Blueprint in `render.yaml` and a Vercel SPA rewrite in `frontend/vercel.json`.

### Render

1. Create a Render Blueprint from this repository and deploy the `dimestack-api` web service. Its root directory is `server`.
2. Create a persistent MongoDB database (for example MongoDB Atlas) and set `MONGO_URI` in the Render service.
3. Set `CLIENT_ORIGIN` to the exact Vercel production origin, such as `https://dimestack.vercel.app`. Multiple allowed origins can be comma-separated.
4. Set `API_ORIGIN` to the Render service URL, such as `https://dimestack-api.onrender.com`.
5. Set `SITE_URL` to the public frontend URL. Keep `JWT_SECRET` unique and private; the Blueprint generates it.
6. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` to enable verification and password-reset email.

The production server refuses to start without `MONGO_URI`, a non-default `JWT_SECRET`, and secure cookies.

### Vercel

1. Import the repository in Vercel and set the project root directory to `frontend`.
2. Add `REACT_APP_API_URL` as the full Render API origin, with no trailing slash (for example `https://dimestack-api.onrender.com`). This is public configuration, not a secret.
3. Deploy or redeploy after setting the variable; Create React App embeds it at build time.

### Cookies, domains, and Google sign-in

For reliable cookie-based authentication, use custom domains on the same site, such as `app.example.com` for Vercel and `api.example.com` for Render, and set `CLIENT_ORIGIN` and `REACT_APP_API_URL` to those origins. Keep `COOKIE_SAME_SITE=lax`.

If using unrelated default Vercel and Render domains, set `COOKIE_SAME_SITE=none` on Render. Cross-site cookies may still be blocked by some browsers; same-site custom domains are strongly recommended.

For Google sign-in, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL` on Render. Set the callback URL to `https://<api-domain>/api/auth/google/callback` and register that exact URL in Google Cloud Console.

Never put database credentials, JWT secrets, SMTP passwords, or OAuth client secrets in Vercel environment variables or frontend files.
