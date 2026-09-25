"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { BrandMark } from "@/components/brand";
import { SubmitButton } from "@/components/auth-form";
import { signIn } from "@/app/actions";

function LoginForm() {
  const search = useSearchParams();
  const next = search.get("next") ?? "/app";
  const authError = search.get("error");
  const [error, setError] = useState<string | null>(
    authError ? "No se pudo completar el acceso. Inténtalo de nuevo." : null,
  );
  const [, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          try {
            const result = await signIn(fd);
            if (result?.error) setError(result.error);
          } catch {
            /* redirect */
          }
        });
      }}
    >
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-2">
        <span className="text-sm text-[var(--muted)]">Identificador</span>
        <input
          className="input"
          name="login"
          required
          autoComplete="username"
          placeholder="El mismo texto con el que te registraste"
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-[var(--muted)]">Contraseña</span>
        <input
          className="input"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <input type="checkbox" name="remember" defaultChecked className="accent-[var(--amber)]" />
        Mantener sesión iniciada
      </label>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <SubmitButton className="w-full">Entrar</SubmitButton>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <BrandMark href="/" size="md" />
      <h1 className="mt-10 font-display text-3xl">Entrar</h1>
      <p className="mt-2 text-[var(--muted)]">Identificador + contraseña. Sin email obligatorio.</p>
      <div className="surface mt-8 p-6">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
      <p className="mt-4 text-center text-sm text-[var(--muted)]">
        ¿Nuevo?{" "}
        <Link
          href="/register"
          className="font-semibold text-[var(--ink-strong)] underline-offset-2 hover:underline"
        >
          Crear cuenta
        </Link>
      </p>
    </main>
  );
}
