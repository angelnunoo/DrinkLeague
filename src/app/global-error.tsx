"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#0b1512",
          color: "#e8f0ec",
          fontFamily: "system-ui, sans-serif",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <p style={{ fontSize: 48, margin: 0 }}>⚠️</p>
          <h1 style={{ fontSize: 28, marginTop: 12 }}>Ha ocurrido un error</h1>
          <p style={{ color: "#8fa39a", maxWidth: 320, margin: "8px auto 24px" }}>
            Reintenta o vuelve atrás con el menú.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              maxWidth: 280,
              margin: "0 auto",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: 48,
                borderRadius: 999,
                border: "none",
                background: "#f0a202",
                color: "#14110a",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
            <Link
              href="/app/games"
              style={{
                minHeight: 48,
                display: "grid",
                placeItems: "center",
                borderRadius: 999,
                border: "1px solid rgba(232,240,236,0.2)",
                color: "#e8f0ec",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              ← Juegos
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
