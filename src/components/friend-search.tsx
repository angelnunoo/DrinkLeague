"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  removeFriendAction,
  searchUsersAction,
  sendFriendRequestAction,
} from "@/app/actions";

type SearchHit = {
  id: string;
  display_name: string;
  username: string | null;
  friend_code: string | null;
  level: number;
  title: string | null;
  is_friend: boolean;
  request_pending: boolean;
};

export function FriendSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function search() {
    setError(null);
    start(async () => {
      const r = await searchUsersAction(q);
      if (r?.error) {
        setError(r.error);
        setHits([]);
        return;
      }
      setHits((r?.payload?.users as SearchHit[]) ?? []);
    });
  }

  return (
    <div className="surface space-y-3 p-5">
      <h2 className="font-display text-xl">Buscar usuarios</h2>
      <div className="flex gap-2">
        <input
          className="input min-h-12"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre, usuario o código"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
        />
        <button type="button" className="btn-primary px-4" disabled={pending} onClick={search}>
          {pending ? "…" : "Buscar"}
        </button>
      </div>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <ul className="space-y-2">
        {hits.map((h) => {
          const href = `/app/u/${encodeURIComponent(h.username || h.friend_code || h.id)}`;
          return (
            <li
              key={h.id}
              className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-2"
            >
              <div className="min-w-0">
                <Link href={href} className="font-semibold hover:underline">
                  {h.display_name}
                </Link>
                <p className="text-[11px] text-[var(--muted)]">
                  {h.title ?? "Novato"} · Nv.{h.level}
                  {h.friend_code ? ` · ${h.friend_code}` : ""}
                </p>
              </div>
              {h.is_friend ? (
                <Link href={href} className="text-xs text-[var(--teal)] hover:underline">
                  Ver perfil
                </Link>
              ) : h.request_pending ? (
                <span className="text-xs text-[var(--muted)]">Pendiente</span>
              ) : (
                <button
                  type="button"
                  className="btn-ghost px-3 py-2 text-xs"
                  disabled={pending || !h.friend_code}
                  onClick={() => {
                    if (!h.friend_code) return;
                    const fd = new FormData();
                    fd.set("friend_code", h.friend_code);
                    start(async () => {
                      const r = await sendFriendRequestAction(fd);
                      if (r?.error) setError(r.error);
                      else search();
                    });
                  }}
                >
                  Añadir
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function RemoveFriendButton({ friendUserId }: { friendUserId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn-ghost px-2 py-1 text-[10px] text-[var(--danger)]"
      disabled={pending}
      onClick={() => {
        if (!confirm("¿Eliminar a este amigo?")) return;
        start(async () => {
          await removeFriendAction(friendUserId);
          router.refresh();
        });
      }}
    >
      Eliminar
    </button>
  );
}
