"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BrandMark } from "@/components/brand";
import { SubmitButton } from "@/components/auth-form";
import { requestPasswordReset } from "@/app/actions";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <BrandMark href="/" size="md" />
      <h1 className="mt-10 font-display text-3xl">Recuperar contraseña</h1>
      <p className="mt-2 text-[var(--muted)]">Te enviaremos un enlace a tu email.</p>
      <div className="surface mt-8 p-6">
        <form
          className="flex flex-col gap-4"
          action={(fd) => {
            setError(null);
            setInfo(null);
            startTransition(async () => {
              const result = await requestPasswordReset(fd);
              if (result?.error) setError(result.error);
              else if (result?.message) setInfo(result.message);
            });
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--muted)]">Email</span>
            <input className="input" name="email" type="email" required autoComplete="email" />
          </label>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {info ? <p className="text-sm text-[var(--teal)]">{info}</p> : null}
          <SubmitButton className="w-full">Enviar enlace</SubmitButton>
        </form>
      </div>
      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        <Link href="/login" className="font-semibold underline-offset-2 hover:underline">
          Volver a entrar
        </Link>
      </p>
    </main>
  );
}
