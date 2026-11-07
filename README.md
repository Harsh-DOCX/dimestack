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
