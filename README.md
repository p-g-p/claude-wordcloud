# Live Word Cloud

Real-time collaborative word cloud, backed by Supabase, deployed to GitHub Pages.

## Local setup
1. `npm install`
2. Copy `.env.example` to `.env`, fill in your Supabase project URL and anon key
3. `npm run dev`

## Admin access
Log in with the email/password you created in Supabase Authentication.
Only that account can delete submissions (enforced by RLS in `supabase/schema.sql`, not just the frontend).

## Deploy
Push to `main`. GitHub Actions builds and deploys to GitHub Pages automatically.
Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set as repo secrets first.

## Enable GitHub Pages
Repo Settings → Pages → Source: "GitHub Actions" (not "Deploy from a branch").
