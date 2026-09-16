import { checkSupabaseHealth } from "@/lib/supabase/health";
import {
  WONDERHOME_PROJECT_REF,
  WONDERHOME_SUPABASE_URL,
} from "@/lib/supabase/project";

export const dynamic = "force-dynamic";

export default async function Home() {
  const health = await checkSupabaseHealth();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">WonderHome</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          Pinned to a single Supabase project. Nothing else connects.
        </p>
      </header>

      <dl className="grid gap-3 rounded-lg border border-black/10 p-5 text-sm dark:border-white/15">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-black/60 dark:text-white/60">Project ref</dt>
          <dd className="font-mono">{WONDERHOME_PROJECT_REF}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-black/60 dark:text-white/60">API URL</dt>
          <dd className="truncate font-mono">{WONDERHOME_SUPABASE_URL}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-black/60 dark:text-white/60">Connection</dt>
          <dd className="font-mono">
            {health.ok ? `reachable (${health.latencyMs}ms)` : "unreachable"}
          </dd>
        </div>
      </dl>

      {!health.ok && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 font-mono text-xs break-words text-red-700 dark:text-red-400">
          {health.error}
        </p>
      )}
    </main>
  );
}
