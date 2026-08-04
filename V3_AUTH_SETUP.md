# V3 email authentication

The Web app uses a cookie session owned by the Cloudflare Worker. Passwords are salted and stored as PBKDF2-SHA-512 hashes. The browser never stores the password or the session token in local storage.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Copy `worker/.dev.vars.example` to `worker/.dev.vars`.
3. Start the Worker with `npm run worker:dev` and the Web app with `npm run dev`.

The Worker allows the origin defined by `FRONTEND_ORIGIN`. Keep the production Web app and Worker on the same site or explicitly set the production origin before deploying.

## Cloudflare deployment

Create the D1 database, put its generated `database_id` in `worker/wrangler.toml`, then apply migrations:

```powershell
cd worker
npx wrangler d1 migrations apply lexiscene-v3 --remote
npx wrangler deploy
```

Before public release, add email verification and a password reset flow. `users.email_verified_at` is already reserved for that work.
