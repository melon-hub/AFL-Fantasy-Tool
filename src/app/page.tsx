export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="flex flex-col items-center gap-8 p-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          AFL Fantasy Draft Tool 2026
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          VORP-based draft assistant for 6-team leagues. Upload your CSV to get
          started.
        </p>
        <div className="flex flex-col gap-3 text-sm text-zinc-500 dark:text-zinc-500">
          <p>Phase 1 foundation complete — UI coming next.</p>
          <p className="font-mono text-xs">
            types · vorp · csv-parser · stores · sample-data
          </p>
        </div>
      </main>
    </div>
  );
}
