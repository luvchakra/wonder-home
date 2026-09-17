import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";

export const metadata = { title: "Sign in" };

/**
 * Placeholder sign-in surface.
 *
 * The route gate armed in story 00-008 needs a real destination, but
 * authentication, invitations and household creation belong to module 01. This
 * page exists so the redirect completes honestly rather than landing on a 404,
 * and is replaced by story 01-001.
 */
export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[var(--wh-content-max)] flex-col justify-center px-4">
      <div className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">WonderHome</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            Happier homes. Brighter tomorrows.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Sign-in is not built yet</CardTitle>
          </CardHeader>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            Accounts, invitations and household creation arrive with Identity &amp; Family
            Accounts (module 01). Until then, Home is open and the personal areas are gated.
          </p>
        </Card>
      </div>
    </main>
  );
}
