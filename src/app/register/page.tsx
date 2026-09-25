"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BrandMark } from "@/components/brand";

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <BrandMark href="/" size="md" />
      <h1 className="mt-10 font-display text-3xl">Crear cuenta</h1>
      <p className="mt-2 text-[var(--muted)]">
        Sin email real. El identificador puede ser <strong>cualquier texto</strong>.
      </p>
      <div className="surface mt-8 p-6">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setError(null);
            setInfo(null);
            startTransition(async () => {
              try {
                const res = await fetch("/api/auth/register", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "same-origin",
                  body: JSON.stringify({
                    login: String(fd.get("login") ?? ""),
                    password: String(fd.get("password") ?? ""),
                    display_name: String(fd.get("display_name") ?? ""),
                  }),
                });
                const data = (await res.json()) as {
                  error?: string;
                  message?: string;
                  needsLogin?: boolean;
                  next?: string;
                };
                if (!res.ok || data.error) {
                  setError(data.error || "No se pudo crear la cuenta.");
                  return;
                }
                if (data.needsLogin) {
                  setInfo(data.message || "Cuenta creada. Ya puedes entrar.");
                  return;
                }
                window.location.assign(data.next?.startsWith("/") ? data.next : "/app");
              } catch {
                setError("Error de red. Inténtalo de nuevo.");
              }
            });
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--muted)]">Nombre visible (opcional)</span>
            <input className="input" name="display_name" maxLength={40} placeholder="Ángel" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--muted)]">Identificador</span>
            <input
              className="input"
              name="login"
              required
              maxLength={80}
              autoComplete="username"
              placeholder="pepe · gamer99 · loquesea"
            />
            <span className="text-xs text-[var(--muted)]">
              No hace falta email. Sirve cualquier texto para entrar después.
            </span>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--muted)]">Contraseña</span>
            <input
              className="input"
              name="password"
              type="password"
              required
              minLength={4}
              autoComplete="new-password"
              placeholder="mín. 4 caracteres"
            />
          </label>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {info ? <p className="text-sm text-[var(--teal)]">{info}</p> : null}
          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? "Espera…" : "Registrarme"}
          </button>
        </form>
      </div>
      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-semibold text-[var(--ink-strong)] underline-offset-2 hover:underline"
        >
          Entrar
        </Link>
      </p>
    </main>
  );
}
