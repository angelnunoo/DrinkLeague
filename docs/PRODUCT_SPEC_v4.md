# DrinkLeague — Especificación Funcional & Arquitectura v4.0

**Producto:** PWA social-competitiva  
**Stack:** Supabase (Auth, PostgreSQL, RLS, Storage, Realtime) + Next.js PWA  
**Superadmin:** `angel.nuunoo@gmail.com`  
**Estado:** Spec de producción — sustituye v2/v3 en decisiones de dominio críticas  

---

## 0. Principios no negociables

1. **Registro libre:** email + password, **sin verificación de correo**, acceso inmediato.  
2. **Un log, muchos efectos:** la bebida se registra **una sola vez** a nivel usuario y se propaga a todas las ligas del usuario.  
3. **Sin pay-to-win:** fichas y tienda **solo cosméticos**; no se compran ni venden con dinero real.  
4. **DrinkBets solo sobre DrinkLeague:** nunca fútbol ni eventos externos.  
5. **Juegos solo baraja española:** Peaje, Rey, Duelo.  
6. **Prioridad UX:** registrar consumición en **&lt; 3 segundos**.  

---

## 1. Visión del producto

DrinkLeague es una plataforma donde amigos compiten en **ligas privadas**, progresan como en un videojuego, juegan minijuegos, apuestan fichas virtuales sobre el meta de la propia app, y personalizan su perfil — todo alimentado por un **historial global de consumiciones**.

**Sensación:** Fortnite (pase/progreso) × Clash (guerras) × Strava (stats) × Duolingo (rachas) × casa de apuestas (DrinkBets) × red social.

---

## 2. Cambio arquitectónico #1 — Registro global de bebidas

### Antes (deprecado)
`drink_log` → ligado a **una** `league_id`. El usuario podía tener que registrar varias veces.

### Ahora (obligatorio)

```
Usuario → Quick Log (global)
        → drink_logs (user_id, venue, items, consumed_at)  [SIN league_id obligatorio]
        → fan-out automático a:
            · todas las memberships activas
            · rankings por liga (general + reyes)
            · stats globales + por liga
            · logros / retos / récords
            · desafíos activos / guerras activas
            · DrinkBets (mercados vivos)
            · química (si amigos activos el mismo día)
```

### UX Quick Log (pantalla principal)

1. Tap bebida (+ cantidad)  
2. Local (preset o texto)  
3. **Sumar**  

**No** se pregunta “¿en qué liga?”.  
Fecha/hora = `now()` (MVP).

### Reglas de fan-out

| Destino | Comportamiento |
|---|---|
| Ligas activas del user | +puntos en cada una (misma cantidad) |
| Desafíos activos | +pts al participante |
| Guerras activas | +pts al marcador de su(s) liga(s) en guerra |
| Récords | evaluar global y por liga |
| Logros | globales y de liga |
| Química | +si amigo también logueó el mismo día civil |

### Implicación de diseño
Un usuario en 3 ligas registra 4 cervezas → **una** fila de log + **tres** actualizaciones de ranking de liga (y side-effects).

---

## 3. Cambio arquitectónico #2 — Tienda global del usuario

- La tienda **no** pertenece a la liga.  
- Wallet de **fichas** por usuario (`token_balance`).  
- Catálogo global de cosméticos.  
- Inventario + “equipped” en perfil.  

---

# 4. Pilares funcionales

## 4.1 Cuentas y roles

| Rol | Quién |
|---|---|
| `user` | Cualquiera |
| `superadmin` | Solo `angel.nuunoo@gmail.com` |

**Capitán de liga** = `league_members.role = league_admin` (no es rol global).

Superadmin: ver/editar usuarios y ligas, analítica, moderación, temporadas/eventos globales.

---

## 4.2 Ligas

- Crear / unirse (código o enlace) / salir  
- Capitán: invites, expulsar, config, guerras  
- Miembro: logs (vía global), guerras, retos, bets de esa liga  
- Temporada: **2 ene → 2 ene** (TZ liga)  
- Rankings: semanal / mensual / anual / histórica + Reyes por bebida  

---

## 4.3 Registro de consumiciones (global)

**Bebidas**

| Código | Pts |
|---|---|
| tequifresa | 1 |
| cerveza | 3 |
| jarra | 5 |
| chupito | 7 |
| copa | 10 |

**Locales:** Bar, Pub, Discoteca, Festival, Casa, personalizado + stats de venues.

---

## 4.4 Social

- `friend_code` único  
- Solicitudes / amigos  
- Feed + reacciones  
- Perfiles  
- **Química** (0–5: Desconocidos → Leyendas inseparables)  
  - Sube: misma liga, mismo día de log, desafíos, guerras, juegos, fiestas  
  - Baja: sin actividad relacionada lunes→lunes  

---

## 4.5 Desafíos y guerras (existentes, adaptados al log global)

- Desafíos 1v1 / 2v2 / 3v3 / FFA / multi + rivalidades  
- Guerras semanales, MVP, divisiones, trofeos  

Los puntos de desafío/guerra salen del **mismo** `drink_log` global.

---

## 4.6 DrinkBets (nuevo)

Sección **DrinkBets** — apuestas solo sobre entidades DrinkLeague de **ligas donde el user es miembro**.

### Mercados (ejemplos)

| Mercado | Resolución |
|---|---|
| Campeón semanal / mensual / anual | Ranking general del periodo |
| Rey cerveza / chupito / … | Ranking por categoría |
| MVP semanal / mensual | Regla MVP (pts o algoritmo declarado) |
| Romper récord X | `league_records` |
| Ganador de desafío / guerra | Al settle |
| Evento de calendario | Al cierre del evento |

**Prohibido:** fútbol, deportes reales, mercados externos.

### Cuotas

Calculadas automáticamente (motor `odds_engine`):

```
inputs: historial, pts actuales, actividad 7/30d, winrate retos,
        posición ranking, forma reciente
output: decimal odds (≥ 1.01), probabilidad implícita
```

Inspiración UI: casas de apuestas (slip, cash-out futuro P2, historial).

### SuperAumentos

| Día | Cupo |
|---|---|
| Viernes | hasta **5** SuperAumentos |
| Sábado | hasta **5** SuperAumentos |
| Resto | **0** |
| Máx/día | **5** (nunca más) |

Ejemplo UI:

```
Ángel · 20 cervezas esta semana
2.40  →  3.50   (+45.8%)
⏱ 02:14:09 restantes
```

Muestra siempre: cuota original, aumentada, % mejora, countdown.

### Fichas en apuestas

- Apuesta con `tokens`  
- Liquidación al resolver mercado → crédito/débito wallet  
- Ranking apostadores **por liga** (fichas netas o balance ganado en esa liga)

### Logros de apuestas

| Código | Nombre | Idea |
|---|---|---|
| bet_first | Primer Apostador | 1ª apuesta |
| bet_visionary | Visionario | 5 aciertos |
| bet_shark | Tiburón | Racha 5 wins |
| bet_value_king | Rey del Value | ROI &gt; X% |
| bet_oracle | Oráculo | Acierta campeón de temporada |
| bet_odds_master | Maestro de las Cuotas | Volumen alto con ROI positivo |

---

## 4.7 Economía de fichas (virtual)

**Propiedades de las fichas**

- Sin valor económico  
- No comprables / no vendibles / no retirables / no intercambiables P2P  
- Solo desbloquean cosméticos (y sirven como stake en DrinkBets / juegos si aplica)

**Fuentes de ingreso (orientativo)**

| Fuente | Fichas (orden magnitud) |
|---|---|
| Logro común | 50–200 |
| Reto semanal | 100–500 |
| Juego (partida) | 20–150 |
| Level-up | 50–300 |
| MVP semana | 500–1500 |
| Evento | 200–2000 |
| Cierre temporada | 1000–5000 |
| DrinkBet ganada | según cuota × stake |

**Objetivo de balance**

- Casual: objetos baratos en días/semanas  
- Hardcore: objetos míticos en **meses**  

---

## 4.8 Tienda global (cosméticos)

| Tier | Precio (fichas) | Ejemplos |
|---|---|---|
| Barato | 100–1.000 | Marcos básicos, fondos simples, avatares comunes, stickers |
| Medio | 1.000–10.000 | Temas, marcos animados, fondos premium, FX |
| Raro | 10.000–50.000 | Legendarios, trofeos deco, vitrinas |
| Épico | 50.000–250.000 | Únicos, limited temporada |
| Mítico | 250.000+ | Fundador, corona leyenda, HoF frames |

**Inventario + equipado:** avatar, marco, banner/fondo, efecto, vitrina, tema.

---

## 4.9 Juegos (solo estos 3 — baraja española)

### 🚧 Peaje
Reglas según versión ya definida en producto (mantener).

### 👑 Rey
| Carta | Efecto |
|---|---|
| As | Todos beben |
| 2 | Elige quién bebe |
| 3 | Bebes tú |
| 4 | Todos menos tú |
| 5 | Elige a alguien: 2 tragos |
| 6 | Beben los solteros |
| 7 | Último en levantar la mano bebe |
| Sota | Beben quienes tienen pareja |
| Caballo | Bebe la última persona que ha hecho el amor |
| Rey | “Rey encontrado” — al salir los **4 Reyes** termina la partida |

### ⚔️ Duelo
2 jugadores · carta más alta gana · más baja “bebe” · empate → desempate.

**Cada juego incluye:** tutorial, stats, logros, historial, XP.  
Jugar juntos → **química +**.

---

## 4.10 Modo Fiesta

Sesión temporal (ej. “Previa Viernes”, 8 participantes).

Durante la fiesta, partidas Peaje/Rey/Duelo:

- Stats de fiesta  
- Química entre participantes  
- XP  
- Logros  

---

## 4.11 Calendario 📅

Centro de planificación.

### Semanal
Retos activos, MVP semana, eventos, SuperAumentos programados, récords “cerca”, highlights.

### Mensual
Retos mes, clasificación, eventos, **cumpleaños**, fin de retos, estado temporada.

### Cumpleaños
- Campo `birth_date` (día/mes; año opcional privacidad)  
- Día del cumple: badge temporal + feed + notificación liga  
- **+300 puntos** (una vez/año/usuario) vía job/RPC `claim_birthday_bonus`

### Recompensa actividad semanal
Si el usuario **abre la app ≥ 5 días distintos** en la misma semana ISO:

- **+10 puntos** (máx 1 vez/semana)  
- Anti-abuso: `app_opens(user_id, day)` único por día  

Stats: semanas activas, mejor racha de opens, pts por participación.

---

## 4.12 Progresión

- XP (logs, juegos, retos, bets resueltas, MVPs)  
- Niveles + títulos  
- Rangos / insignias / logros secretos  
- Pase de batalla 100 niveles (cosméticos)  

---

# 5. Arquitectura Supabase

```
PWA (Next.js)
  │  SSR cookies + Realtime (feed, bets live odds opcional)
  ▼
Supabase Auth ──► public.users (perfil + wallet)
       │
PostgreSQL
  · drink_logs (GLOBAL)
  · league fan-out tables / rankings
  · social / chemistry
  · challenges / wars
  · drinkbets + odds snapshots
  · games / parties
  · shop / inventory
  · calendar / opens / birthdays
Storage: avatars, banners, cosmetics assets
Edge Functions / Cron:
  · settle markets
  · SuperAumentos window
  · birthday grants
  · chemistry decay
  · season close
```

### Escritura crítica: `log_drinks_global`

RPC `SECURITY DEFINER` transaccional:

1. Validar items + venue  
2. INSERT `drink_logs` + items  
3. UPDATE `user_stats`  
4. FOR EACH active membership → UPSERT rankings + league stats  
5. `apply_competition_scores` (desafíos/guerras)  
6. Evaluar logros / récords (sync ligeros + queue pesados)  
7. Química same-day friends  
8. Feed events  
9. Refresh odds afectadas (async ok)  

---

# 6. Modelo de datos (PostgreSQL)

## 6.1 Core users

`users` (extiende auth.users)

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK FK auth | |
| email | citext UNIQUE | |
| display_name | varchar | |
| friend_code | varchar(8) UNIQUE | |
| username | varchar | |
| role | text | user \| superadmin |
| birth_date | date | nullable |
| token_balance | bigint | ≥ 0 |
| xp, level, title, rank_tier | | |
| avatar_url, banner_url | text | |
| equipped_cosmetics | jsonb | {frame, theme, …} |

## 6.2 Bebidas globales

### `drink_logs`
| Columna | Tipo |
|---|---|
| id | uuid PK |
| user_id | uuid FK |
| venue_id | uuid FK |
| venue_name_snapshot | text |
| consumed_at | timestamptz |
| points_total | int |
| status | active\|deleted |
| edited_until | timestamptz |

**Sin `league_id`.**

### `drink_log_items` — igual que antes (FK drink_log, drink_type, qty)

### `drink_log_league_effects` (opcional auditoría)
`(log_id, league_id, points_applied)` — trazabilidad del fan-out.

## 6.3 Ligas / rankings

Mantener `leagues`, `league_memberships`, `league_invites`,  
`rankings` unificado o `leaderboard_*`, `league_records`, `hall_of_fame_entries`.

## 6.4 Social

`friend_requests`, `friendships` (chemistry_xp, chemistry_level, last_related_activity_at),  
`activity_feed`, `activity_reactions`.

## 6.5 Competición

`challenges`, `challenge_participants`, `rivalries`,  
`league_wars`, `war_member_scores`, `league_divisions`.

## 6.6 DrinkBets

### `bet_markets`
| Columna | Tipo |
|---|---|
| id | uuid PK |
| league_id | uuid FK |
| market_type | text |
| title | text |
| status | open\|suspended\|settled\|void |
| opens_at / closes_at / settles_at | timestamptz |
| resolution_key | jsonb | {period, category, …} |
| winning_selection_id | uuid null |

### `bet_selections`
| id | market_id | label | subject_user_id null | base_odds numeric | boosted_odds null | meta jsonb |

### `super_boosts`
| id | selection_id | original_odds | boosted_odds | starts_at | ends_at | day_slot (fri\|sat) |

### `bets`
| id | user_id | league_id | market_id | selection_id | stake_tokens | odds_taken | status | potential_payout | settled_payout | created_at |

### `bettor_stats_league`
| league_id, user_id | staked | won | lost | net | updated_at | → ranking apostadores |

## 6.7 Wallet & shop

### `token_ledger`
| id | user_id | delta | balance_after | reason | ref_type | ref_id | created_at |

### `shop_items`
| id | sku | name | tier | price_tokens | asset_paths jsonb | season_tag null | is_active |

### `user_inventory`
| user_id, item_id | acquired_at | equipped bool |

## 6.8 Juegos

### `game_sessions`
| id | game_type (peaje\|rey\|duelo) | party_id null | status | created_by | deck_seed | created_at |

### `game_players` — session_id, user_id, seat, result_meta  

### `game_events` — historial de cartas/jugadas (jsonb)

### `parties` (modo fiesta)
| id | name | host_id | starts_at | ends_at | status |

### `party_members` — party_id, user_id  

## 6.9 Calendario / actividad

### `calendar_events`
| id | scope (global\|league) | league_id null | type | title | starts_at | ends_at | payload |

### `app_opens`
| user_id, day date | PK — 1 fila/día |

### `weekly_activity_rewards`
| user_id, week_start | claimed_at | points_granted |

### `birthday_claims`
| user_id, year | claimed_at |

---

# 7. Relaciones (resumen)

```
users 1─N drink_logs 1─N drink_log_items
users 1─N league_memberships N─1 leagues
drink_logs ─(fan-out)→ rankings / wars / challenges
users 1─1 token_balance (col) + N token_ledger
users N─M shop_items vía user_inventory
leagues 1─N bet_markets 1─N bet_selections 1─N bets
users N─N friendships
parties 1─N game_sessions
```

---

# 8. RLS (políticas clave)

| Tabla | SELECT | WRITE |
|---|---|---|
| drink_logs | self + peers liga compartida + superadmin | solo RPC |
| rankings_* | miembros liga / superadmin | RPC |
| bet_markets/selections | miembros de esa liga | RPC/admin |
| bets | self (+ superadmin) | RPC place_bet |
| token_ledger | self | RPC |
| shop_items | authenticated | superadmin |
| user_inventory | self | RPC purchase/equip |
| game_sessions | players / party members | RPC |
| app_opens | self | RPC record_open |
| friendships | participantes | RPC |

Helpers: `is_superadmin()`, `is_league_member(league_id)`.

---

# 9. Experiencia de usuario (wireframes conceptuales)

### Tab bar
`Log · Social · Calendario · Bets · Yo`  
(Ligas/Guerras/Retos/Juegos/Tienda como hubs secundarios o tab “Play”)

### Log (home)
Hero “¿Qué has pillado?” · grid bebidas · local chips · total · Sumar  
Sin selector de liga.

### Calendario
Toggle Semana/Mes · cards eventos · cumples · SuperAumentos countdown.

### DrinkBets
Lista mercados liga activa · slip · SuperAumento badge · historial · ranking apostadores.

### Tienda
Tiers tabs · preview equip · balance fichas.

### Juegos
Peaje / Rey / Duelo · tutorial · crear mesa · modo fiesta.

### Perfil
Banner/marco equipados · nivel · vitrina · stats · récords · rivalidades.

---

# 10. Roadmap

| Fase | Nombre | Entregable |
|---|---|---|
| **A** | Fundación global | Migrar a `log_drinks_global`, quitar liga del Quick Log, fan-out |
| **B** | Economía | Wallet, ledger, tienda cosméticos, equip |
| **C** | DrinkBets v1 | Mercados ranking/MVP, cuotas, place/settle, SuperAumentos |
| **D** | Juegos | Rey + Duelo + Peaje, stats/XP, química |
| **E** | Calendario | Semana/mes, cumples +300, activity +10 |
| **F** | Fiesta + polish | Parties, odds engine avanzado, battle pass cosméticos |

---

# 11. Backlog priorizado

### P0
- [ ] RPC `log_drinks_global` + migración schema (quitar league_id del log)  
- [ ] Quick Log sin liga  
- [ ] Fan-out rankings/stats/guerras/desafíos  
- [ ] Auth sin confirm email  
- [ ] Superadmin allowlist  

### P1
- [ ] `token_ledger` + balance  
- [ ] Shop catálogo + purchase + equip  
- [ ] DrinkBets mercados básicos + place_bet + settle  
- [ ] Ranking apostadores por liga  
- [ ] Calendario semanal UI  
- [ ] `app_opens` + reward +10  
- [ ] `birth_date` + bonus +300  

### P2
- [ ] SuperAumentos vie/sáb  
- [ ] Odds engine v2  
- [ ] Juegos Rey + Duelo (+ Peaje)  
- [ ] Logros de apuestas  
- [ ] Modo Fiesta  
- [ ] Química decay job  

### P3
- [ ] Objetos míticos / limited  
- [ ] Cash-out / parlays (si se desea)  
- [ ] Battle pass 100 niveles cosmético  
- [ ] Analítica superadmin avanzada  

---

# 12. Motor de cuotas (resumen)

```
p_raw = f(form, rank_position, volume_7d, head_to_head, prior)
p = clamp(p_raw, 0.02, 0.95)
odds = round(margin_factor / p, 2)   # margen casa ~5–8% sobre implícitas
```

SuperAumento: `boosted = min(odds * k, odds + cap)` con `k∈[1.2,1.6]`, TTL corto, máx 5 slots/día vie|sáb.

---

# 13. Escalabilidad (10k users · 1k ligas)

- Fan-out O(M) con M = nº ligas del user (típicamente 1–5) dentro de 1 transacción  
- Rankings por UPSERT, no SUM full-scan  
- Odds refresh async (cola) tras logs  
- Particionar `drink_logs` / `token_ledger` / `bets` por tiempo a medio plazo  
- RLS + RPCs; nunca service_role en cliente  

---

# 14. Decisiones fijadas v4

| Tema | Decisión |
|---|---|
| Log de bebidas | **Global**; fan-out a ligas |
| Tienda | **Global usuario**; solo cosméticos |
| Fichas | Virtuales; no money; no trade |
| Apuestas | Solo meta DrinkLeague de ligas propias |
| SuperAumentos | Vie/Sáb · máx 5/día |
| Juegos | Peaje, Rey, Duelo · baraja española |
| Cumpleaños | +300 pts 1×/año |
| Actividad | +10 pts si ≥5 días open/semana |
| Temporada | 2 ene → 2 ene |

---

# 15. Plan de migración desde v3 (app actual)

1. Añadir `drink_logs.user_centric` (nuevo schema) en paralelo.  
2. Backfill: cada log antiguo → 1 global + effects por su `league_id`.  
3. Cambiar UI Quick Log.  
4. Deprecar RPC `log_drinks(league_id, …)`.  
5. Activar wallet/shop/bets por fases B–C.  

---

*Documento base listo para Notion / Jira / GitHub Projects y para implementar en Supabase.*
