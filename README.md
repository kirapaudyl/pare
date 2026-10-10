# Pare

Tasks, journal notes and resources across the domains of your life. React + TypeScript + Tailwind + Zustand, with data stored in Supabase.

## Run locally

    npm install
    cp .env.example .env.local   # then fill in the two Supabase values
    npm run dev

## Supabase setup (once)

1. Create a project at supabase.com.
2. SQL Editor: run `supabase/schema.sql`.
3. Project Settings -> API: copy the Project URL and the anon public key into `.env.local`.
4. Authentication -> Providers -> Email is on by default. After you create your own account in the app, turn off "Allow new users to sign up" (Authentication -> Sign In / Providers) so nobody else can register.

## Deploy (Vercel)

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel -> Project -> Settings -> Environment Variables, then push to `main`. Vite bakes env vars in at build time, so changing them needs a redeploy.

## Notes

- All data lives in Supabase and is protected by row level security (each user sees only their own rows).
- Open tabs and devices stay in sync through Supabase Realtime.
- Old browser-only data (localStorage key `orbit-brain-v1`) is offered for import on first sign-in.
