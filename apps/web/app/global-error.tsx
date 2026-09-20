"use client";

/**
 * Catches an exception thrown by the root layout itself (fonts, metadata,
 * or anything else in `app/layout.tsx`) — the one place `app/error.tsx`
 * cannot reach, because that boundary lives inside the layout it would need
 * to replace. This file must render its own `<html>`/`<body>`, since it
 * takes over from the root layout entirely rather than nesting under it.
 *
 * Deliberately plain: the layout it stands in for only loads two Google
 * fonts, so this path is rare, and a self-hosted style guarantees this page
 * still renders even if the failure is font- or CSS-related.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fbf8f3", fontFamily: "system-ui, sans-serif", padding: "1.5rem" }}>
        <div style={{ maxWidth: "22rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.5rem" }}>WonderHome couldn&rsquo;t load</h1>
          <p style={{ fontSize: "0.875rem", color: "#6b6459", margin: "0 0 1.25rem" }}>
            Nothing was changed. Reloading usually fixes this.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ minHeight: "2.75rem", padding: "0 1.25rem", borderRadius: "9999px", border: "none", background: "#3d6b8c", color: "#fff", fontWeight: 600, fontSize: "0.875rem" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
