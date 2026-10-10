export default function SetupNotice() {
  return (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-lg rounded-xl2 bg-card p-7 shadow-lift">
        <h1 className="font-display text-2xl font-bold">Supabase isn&rsquo;t configured</h1>
        <p className="mt-2 text-sm text-muted">
          This build has no Supabase keys, so Pare can&rsquo;t load or save anything. Set these two environment
          variables, then rebuild (Vite reads them at build time, so a redeploy is required on Vercel):
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-paper p-4 text-xs">{`VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY`}</pre>
        <p className="mt-4 text-sm text-muted">Locally, copy .env.example to .env.local and fill them in.</p>
      </div>
    </div>
  );
}
