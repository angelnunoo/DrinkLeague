# DrinkLeague

PWA de ligas privadas: registra bebidas, suma puntos y compite por semana, mes y temporada.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind
- **Supabase** (Auth + PostgreSQL + RLS + RPC)

## Arranque rápido

### 1. Variables de entorno

```bash
cp .env.example .env.local
```

Rellena con la URL y la anon key de tu proyecto Supabase.

### 2. Base de datos

En el **SQL Editor** de Supabase, ejecuta en orden los ficheros de `supabase/migrations/`:

1. `20260325000001_initial_schema.sql`
2. `20260325000002_functions.sql`
3. `20260325000003_seeds.sql`
4. `20260325000004_rpc_leagues.sql`
5. `20260325000005_rpc_log_drinks.sql`
6. `20260325000006_rls.sql`

Opcional: Auth → Providers → Email enabled. Desactiva “Confirm email” en desarrollo si quieres entrar al instante.

### 3. App

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Visión / Spec vigente

- **Spec completa v4:** [`docs/PRODUCT_SPEC_v4.md`](docs/PRODUCT_SPEC_v4.md)  
  (registro global, DrinkBets, tienda/fichas, juegos, calendario, economía)  
- Visión intermedia: `docs/PRODUCT_VISION_v3.md` (histórico)

## Rutas app (v5)

| Ruta | Qué hace |
|---|---|
| `/app` | Quick Log global + lugares inteligentes + digests IA |
| `/app/shop` | Tienda global de cosméticos |
| `/app/bets` | DrinkBets + SuperAumentos |
| `/app/games` | Peaje / Rey / Duelo + Fiesta |
| `/app/calendar` | Eventos, cumpleaños +300, actividad 5/7 |
| `/app/social` | Amigos, química 0–100, feed, parejas legendarias |
| `/app/battle-pass` | Pase 100 niveles reclamable |
| `/app/records` | Libro de récords, MVPs, noches históricas |
| `/app/wrapped` | DrinkWrapped anual |
| `/app/profile` | Perfil videojuego: títulos, vitrina, personalidades |
| `/app/admin` | Superadmin total + auditoría |
| `/app/leagues` · `/challenges` · `/wars` | Ligas, retos, guerras |

## Spec

- Vigente: [`docs/PRODUCT_SPEC_v4.md`](docs/PRODUCT_SPEC_v4.md) (+ ampliación v5 en producto: títulos, vitrina, wrapped, IA, admin audit)

En Supabase → **Authentication → Providers → Email**:

1. Enable Email = ON  
2. **Confirm email = OFF** (sin verificación)  
3. Site URL = `http://localhost:3000`

Superadmin: `angel.nuunoo@gmail.com` (también se reconoce `angelnuunoo@gmail.com`).
