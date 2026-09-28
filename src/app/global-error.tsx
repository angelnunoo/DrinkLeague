"use client";

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
            Reintenta. Usa el menú inferior para moverte.
          </p>
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
              padding: "0 24px",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
