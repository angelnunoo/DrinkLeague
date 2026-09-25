# DrinkLeague — Documentación Funcional Completa

**Versión:** 2.0  
**Producto:** DrinkLeague (PWA Mobile-First)  
**Stack objetivo:** Supabase (Auth, PostgreSQL, Storage, RLS) + Next.js PWA  
**Audiencia:** Producto, Diseño, Ingeniería, Notion / Jira / GitHub Projects  
**Admin global:** `angel.nuunoo@gmail.com`  

---

## Índice

1. [Visión del producto](#1-visión-del-producto)
2. [Mecánicas core](#2-mecánicas-core)
3. [Sistema de temporadas](#3-sistema-de-temporadas)
4. [Rankings](#4-rankings)
5. [Récords históricos](#5-récords-históricos)
6. [Hall of Fame](#6-hall-of-fame)
7. [Sistema de rachas](#7-sistema-de-rachas)
8. [Feed de actividad](#8-feed-de-actividad)
9. [Sistema de niveles](#9-sistema-de-niveles)
10. [Sistema de desafíos](#10-sistema-de-desafíos)
11. [Logros / insignias](#11-logros--insignias)
12. [Estadísticas avanzadas](#12-estadísticas-avanzadas)
13. [Sistema antifraude](#13-sistema-antifraude)
14. [Fase 5 — Comunidad y eventos](#14-fase-5--comunidad-y-eventos)
15. [Priorización P0–P3](#15-priorización-p0p3)
16. [Roadmap por fases](#16-roadmap-por-fases)
17. [Implicaciones de datos (Supabase)](#17-implicaciones-de-datos-supabase)
18. [Epics y user stories (resumen Jira)](#18-epics-y-user-stories-resumen-jira)
19. [Riesgos](#19-riesgos)

---

## 1. Visión del producto

### Problema

Los grupos de amigos compiten informalmente al salir, pero no tienen reglas, histórico, rankings por categoría ni memoria de temporadas.

### Solución

DrinkLeague es una PWA de **ligas privadas** donde los usuarios registran bebidas en segundos, suman puntos, compiten en rankings (general + por bebida), desbloquean logros, completan retos y conservan un histórico permanente (récords, Hall of Fame, temporadas).

### Público

- Grupos de amigos 18+ que salen con frecuencia  
- Organizador del grupo (admin de liga)  
- Admin de plataforma (único email allowlisted)

### Diferenciadores

- Rankings **por categoría de bebida** + periodos múltiples  
- **Récords** y **Hall of Fame** persistentes entre temporadas  
- Gamificación densa (niveles, rachas, retos, reacciones) sin chat  
- Privacidad por liga + capa global opcional en Fase 5  

---

## 2. Mecánicas core

### Bebidas y puntos (catálogo fijo v1)

| Bebida | Código | Puntos |
|---|---|---|
| Tequifresa | `tequifresa` | 1 |
| Cerveza | `cerveza` | 3 |
| Jarra | `jarra` | 5 |
| Chupito | `chupito` | 7 |
| Copa | `copa` | 10 |

`puntos_registro = Σ (cantidad × puntos_unidad)`

### Registro rápido

- Objetivo UX: **&lt; 3 segundos** (liga activa + último local + taps)  
- Local **obligatorio**  
- Una liga por registro (MVP)  
- `consumed_at = now` en MVP (backdating controlado en P2)  
- Edición/borrado: ventana **15 minutos**  

### Roles

| Rol | Alcance |
|---|---|
| Usuario | Ligas, registros, perfil |
| Admin de liga | Invites, miembros, retos de liga, moderación ligera |
| Admin global | Solo `angel.nuunoo@gmail.com` — plataforma, suspensión, auditoría |

---

## 3. Sistema de temporadas

### Definición formal (v2)

| Campo | Valor |
|---|---|
| **Inicio** | 2 de enero, 00:00:00 (timezone de la liga) |
| **Fin** | 1 de enero siguiente, 23:59:59.999 (timezone de la liga) |
| **Nueva temporada** | Empieza el 2 de enero 00:00:00 |
| **`season_year`** | Año del **2 de enero de inicio** (ej. temporada 2027 = 2027-01-02 → 2028-01-01) |

**Nota de migración desde v1:** la spec v1 usaba fin exclusivo en 2 ene 00:00. Funcionalmente es equivalente: el 1 de enero pertenece a la temporada anterior; el 2 de enero abre la nueva.

### Histórico

- Cada liga conserva `seasons` cerradas con podio (1º/2º/3º), puntos y snapshots  
- Rankings de temporada se archivan al cierre (no se borran)  
- Récords y Hall of Fame **no se resetean**  

### Jobs al cierre (2 ene 00:05 TZ liga o job global)

1. Congelar ranking de temporada  
2. Escribir podio en Hall of Fame de liga  
3. Emitir eventos de feed + otorgar trofeos/logros de temporada  
4. Abrir nueva fila `seasons`  

---

## 4. Rankings

### 4.1 Ranking general

Clasificación por **puntos totales** en el periodo.

### 4.2 Rankings por categoría (“Reyes”)

| Ranking | Métrica |
|---|---|
| Rey de la Cerveza | Unidades de `cerveza` |
| Rey de las Jarras | Unidades de `jarra` |
| Rey de los Chupitos | Unidades de `chupito` |
| Rey de las Copas | Unidades de `copa` |
| Rey del Tequifresa | Unidades de `tequifresa` |

### 4.3 Periodos (todos los rankings)

| Periodo | Clave | Notas |
|---|---|---|
| Semanal | `week_start_date` (lunes TZ liga) | Reset semanal |
| Mensual | `month_start_date` | Reset mensual |
| Anual / Temporada | `season_year` | Según §3 |
| Histórica | all-time desde creación de liga | No se resetea |

### 4.4 UX Clasificación

Tabs de **periodo** × selector de **categoría**:

```
[ Semana | Mes | Temporada | Histórica ]
[ General | Cerveza | Jarra | Chupito | Copa | Tequifresa ]
```

### 4.5 Desempates (todos)

1. Más puntos / más unidades (según ranking)  
2. Más registros en el periodo  
3. `joined_at` más antiguo  
4. `user_id` estable  

### 4.6 Implementación recomendada (Supabase)

**Tablas agregadas** (no SUM en caliente):

- `rankings_general_{weekly|monthly|season|alltime}`  
- `rankings_drink_{weekly|monthly|season|alltime}` con columna `drink_code`  

O modelo unificado:

```text
rankings (
  league_id, period_type, period_key,
  category, -- 'general' | drink_code
  user_id, score, logs_count, updated_at
)
PK (league_id, period_type, period_key, category, user_id)
```

Actualización: UPSERT en RPC `log_drinks` (+Δ).  
Cron: cierre temporada + reconcile.

---

## 5. Récords históricos

Sección **Récords** dentro de cada liga. **Persisten entre temporadas.**

### Catálogo mínimo de récords

| Código | Nombre | Métrica | Scope |
|---|---|---|---|
| `night_points` | Más puntos en una noche | Max `points_total` de un `drink_log` | Liga |
| `day_cerveza` | Más cervezas en un día | Max unidades cerveza / día civil TZ | Liga |
| `day_chupito` | Más chupitos en un día | Idem chupito | Liga |
| `day_copa` | Más copas en un día | Idem copa | Liga |
| `day_jarra` | Más jarras en un día | Idem jarra | Liga |
| `day_tequifresa` | Más tequifresas en un día | Idem tequifresa | Liga |
| `rolling_24h_logs` | Más bebidas (unidades) en 24h | Max suma cantidades ventana 24h | Liga |
| `rolling_24h_points` | Más puntos en 24h | Max puntos ventana 24h | Liga |
| `streak_activity` | Mayor racha de actividad | Max días consecutivos con log | Liga |
| `venues_distinct` | Más locales visitados | Max locales distintos all-time | Liga |
| `season_points` | Temporada con más puntos | Max puntos de un user en una season | Liga |
| `achievements_count` | Usuario con más logros | Max logros desbloqueados (scope liga+global visibles) | Liga |

### Reglas

- Al superar un récord: actualizar holder, valor, `achieved_at`, `ref_id` (log/season)  
- Evento en feed: “X rompió el récord Y”  
- Empate: primer en alcanzarlo mantiene; opción “co-hold” en P2  
- Soft-delete de log: recalcular récord si el log era el holder  

### Datos

`league_records (league_id, record_code, user_id, value, achieved_at, meta jsonb)`  
PK `(league_id, record_code)`

---

## 6. Hall of Fame

Página permanente de campeones históricos.

### 6.1 Hall of Fame de liga

Por cada `season_year` cerrado:

| Puesto | Origen |
|---|---|
| 🥇 Campeón | #1 ranking general temporada |
| 🥈 Subcampeón | #2 |
| 🥉 Tercer puesto | #3 |

Opcional por temporada (P1+): Reyes de categoría de esa temporada.

### 6.2 Hall of Fame global (plataforma)

- Podio global por temporada agregando **solo ligas elegibles** (reglas anti-smurf P2)  
- O “Top ligas” / usuarios con más títulos de liga  
- Fase 5: Salón de leyendas global ampliado  

### UX

Lista cronológica descendente:

```
Temporada 2028
🥇 Ana · 2840 pts
🥈 Luis · 2710 pts
🥉 Marta · 2505 pts

Temporada 2027
...
```

### Datos

`hall_of_fame_entries (id, scope [league|global], league_id null, season_year, place, user_id, points, category default 'general', created_at)`  
UNIQUE `(scope, league_id, season_year, place, category)`

---

## 7. Sistema de rachas

### Tipos de racha

| Tipo | Definición | Reset |
|---|---|---|
| **Racha de actividad** | Días consecutivos (TZ user o liga) con ≥1 registro | Día sin log |
| **Racha semanal** | Semanas consecutivas con ≥1 registro | Semana vacía |
| **Racha mensual** | Meses consecutivos con ≥1 registro | Mes vacío |
| **Racha de retos** | Retos completados en semanas consecutivas | Semana sin reto completado |

### Estado por usuario (y opcional por liga)

- `current_streak`  
- `best_streak`  
- `last_activity_date` / `last_week_key` / `last_month_key`  

### Logros asociados (ejemplos)

| Código | Requisito |
|---|---|
| `streak_activity_7` | 7 días actividad |
| `streak_activity_30` | 30 días |
| `streak_weekly_4` | 4 semanas seguidas |
| `streak_monthly_3` | 3 meses seguidos |
| `streak_challenges_3` | 3 semanas con reto completado |

### UX

- Chip 🔥 en header Home/Perfil  
- Card “Mejor racha” en récords y stats  

---

## 8. Feed de actividad

### Tiempo real

- Fuente: `activity_feed`  
- Entrega: Supabase Realtime filtrado por `league_id` (P1); polling en P0  

### Tipos de evento (mínimo)

| event_type | Ejemplo copy |
|---|---|
| `drink_logged` | Ángel añadió 5 cervezas (+15 puntos) |
| `achievement_unlocked` | Pablo consiguió Maestro Cervecero |
| `rank_entered_top3` | David subió al Top 3 |
| `challenge_completed` | Sergio completó un reto |
| `record_broken` | Ana rompió “Más puntos en una noche” |
| `level_up` | Luis subió a nivel 10 — Veterano |
| `season_podium` | Campeón de temporada 2027 |
| `reaction` (derivado) | — |

### Reacciones rápidas (sin chat)

| Emoji | Código |
|---|---|
| 👍 | `thumbsup` |
| 🔥 | `fire` |
| 😂 | `laugh` |

Reglas:

- 1 reacción por tipo por usuario por evento (toggle)  
- Contadores en `activity_reactions` o jsonb agregado  
- Sin hilos, sin respuestas texto (P0–P2)  

### Privacidad

- Solo miembros activos de la liga  
- Sin emails en payload  

---

## 9. Sistema de niveles

### XP — fuentes

| Acción | XP base (propuesta) |
|---|---|
| Registrar bebidas | **1 XP por punto de bebida** |
| Conseguir logro | Según rareza: 25 / 50 / 100 / 200 / 400 |
| Completar reto | Definido en el reto (`reward_xp`) |
| Ganar clasificación | #1 semana 100 · #1 mes 250 · #1 temporada 1000; #2/#3 fracciones |

*(Ajustable por admin global en P2 sin pay-to-win.)*

### Curva y títulos

| Nivel | XP mín. acum. | Título |
|---|---|---|
| 1 | 0 | Novato |
| 5 | 350 | Habitual |
| 10 | 1800 | Veterano |
| 15 | ~5500 | Experto |
| 20 | ~17000 | Élite |
| 25 | ~52000 | Leyenda |
| 35 | … | Campeón |
| 50 | … | Mito |

Tabla completa en `level_definitions (level, xp_required, title, badge_path)`.  
Fórmula post-10: continuidad geométrica documentada en arquitectura (≈ `floor(1800 * 1.25^(n-10))` como base; títulos hitos en 5,10,25,50).

### UX

- Anillo/barra XP global  
- Toast al level-up + evento feed  
- Título visible junto al nombre en ranking  

---

## 10. Sistema de desafíos

### 10.1 Retos semanales

Ejemplos:

- Alcanzar **X puntos** en la semana  
- Consumir **X unidades** (total o de un tipo)  
- Visitar **X locales** distintos  

Duración: lunes–domingo TZ liga.  
Asignación: plantillas auto al inicio de semana + retos custom admin liga (P1).

### 10.2 Retos mensuales

- Objetivos acumulados del mes  
- Conseguir **N insignias** específicas o cualquier rareza  

### 10.3 Retos especiales (calendario)

| Evento | Ventana típica | Mechanic |
|---|---|---|
| Navidad | 20–26 dic | Multiplicador cosmético / meta temática |
| Halloween | 28–31 oct | Reto chupitos / locales “terror” |
| Verano | jul–ago | Torneo / meta de actividad |
| Fin de Año | 31 dic–1 ene | Reto de cierre temporada |

Recompensas: XP + logro exclusivo + (P3) insignia limitada.

### Datos

`challenges` · `challenge_progress` · plantillas `challenge_templates`

---

## 11. Logros / insignias

- Catálogo amplio (100 insignias por categorías: cerveza, chupitos, copas, tequifresa, locales, rachas, participación, retos, clasificaciones, eventos)  
- Rareza: Común → Legendaria  
- Scope: global / liga / evento  
- Storage: bucket `badges`  

Evaluación: reglas jsonb + jobs para ranking/podio.

---

## 12. Estadísticas avanzadas

### Métricas por usuario (global y por liga)

| Métrica | Descripción |
|---|---|
| Bebida favorita | Mayor unidades (o pts) en periodo |
| Local favorito | Más visitas |
| Día más activo | Dow con más pts/logs |
| Promedio semanal | pts / semanas activas |
| Promedio mensual | pts / meses activos |
| Evolución por temporada | Serie puntos por `season_year` |
| Comparativas | vs media de la liga; vs rival opcional |

### UX

Pantalla Estadísticas: period chips + hero score + barras por bebida + top locales + sparkline temporadas + bloque “vs liga”.

### Implementación

- Lecturas desde aggregates (`user_stats`, `league_member_stats`, rankings)  
- Series temporales: tabla `stats_daily (league_id, user_id, day, points, units jsonb)` P1  

---

## 13. Sistema antifraude

### Controles preventivos

| Control | Detalle |
|---|---|
| Límite por registro | Máx. 50 uds por tipo; máx. puntos por log (ej. 500) |
| Rate limit | Máx. N logs / hora / usuario (ej. 20) |
| Ventana edición | 15 min; fuera solo admin global |
| Solo `now` | Sin backdating en P0 |
| Invites | Rotación de código; rate-limit joins fallidos |

### Historial y auditoría

| Artefacto | Uso |
|---|---|
| `drink_log_revisions` | Snapshot antes/después de edits |
| `admin_audit_logs` | Acciones admin global |
| `moderation_audit_logs` | Acciones admin liga (kick, etc.) |

### Detección anómala (scoring)

Señales:

- Picos > P99 histórico del user  
- Muchos logs en &lt; 2 min  
- Siempre el mismo patrón máximo  
- Unirse a muchas ligas y top inmediato  

Salida: flag `users.risk_score` / cola `fraud_flags` para revisión.

### Reportes

- Miembro reporta registro o usuario (`reports`)  
- Motivos: inflación, ofensivo, spam  
- Admin liga: ocultar del feed / kick  
- Admin global: suspender, revertir puntos, ban  

### Principio

**No pay-to-win. No compra de puntos.** Fair play &gt; crecimiento tóxico.

---

## 14. Fase 5 — Comunidad y eventos

**Objetivo:** retención y crecimiento viral a largo plazo (P3).

| Feature | Descripción |
|---|---|
| Eventos temporales | Ventanas globales con branding |
| Torneos de verano | Formato brackets o ranking evento |
| Eventos Navidad / Halloween / Fin de Año | Retos + cosmetics |
| Logros exclusivos de evento | No obtenibles fuera de ventana |
| Rankings especiales de evento | Category=`event:{id}` |
| Insignias limitadas | Stock / tiempo |
| MVP de la semana / mes | Auto por algoritmo (pts + actividad) + trofeo |
| Salón de leyendas global | Hall of Fame + rachas históricas globales |
| Ranking mundial entre ligas | Score de liga (suma top N o media) |
| Votaciones | MVP community vote semanal (1 voto/user/liga) |
| Trofeos virtuales | Entidad `trophies` distinta de achievements |
| Perfil avanzado + vitrinas | Showcase trofeos / insignias / títulos |
| Stats históricas completas | Export + gráficos multi-año |
| Retos cooperativos de liga | Meta grupal (la liga entera aporta) |

---

## 15. Priorización P0–P3

### P0 — MVP imprescindible (lanzar)

- Auth + perfil básico + admin global allowlist  
- Ligas + invites código/enlace  
- Registro rápido + locales + puntos  
- Ranking **general** semanal / mensual / temporada  
- Feed básico (sin Realtime obligatorio; sin reacciones)  
- Niveles con XP por puntos de bebida + títulos hito  
- Temporadas 2 ene → 1 ene + histórico season básico  
- Antifraude básico (límites, rate limit, ventana 15 min, audit admin)  
- PWA instalable  

### P1 — Importante para crecimiento

- Rankings por categoría (Reyes) en 4 periodos incl. histórica  
- Reacciones 👍🔥😂 + Realtime feed  
- Récords de liga (catálogo mínimo)  
- Hall of Fame de liga al cierre de temporada  
- Rachas actividad + semanal (+ logros de racha)  
- Retos semanales automáticos  
- Stats avanzadas (favoritos, promedios, vs liga)  
- Reportes de usuarios  
- XP por logros y #1 semanal  

### P2 — Funcionalidades avanzadas

- Retos mensuales + especiales (Navidad, Halloween, Verano, Fin de Año)  
- Racha mensual + racha de retos  
- Hall of Fame global  
- `drink_log_revisions` + detección anómala + cola fraude  
- Backdating controlado  
- MVP semana/mes automático  
- Comparativas head-to-head  
- Co-admins de liga · push notifications  

### P3 — Comunidad y largo plazo (Fase 5)

- Todo §14 (eventos, torneos, ranking entre ligas, votaciones, trofeos, vitrinas, retos cooperativos, salón leyendas, insignias limitadas)  

---

## 16. Roadmap por fases

| Fase | Nombre | Contenido | Prioridad |
|---|---|---|---|
| **1** | MVP | P0 completo | P0 |
| **2** | Gamificación | Reyes, rachas, récords, retos semanales, reacciones | P1 |
| **3** | Social | Push, Realtime pulido, reportes UX, co-admins | P1–P2 |
| **4** | Premium / Pro ligas | Analytics organizador, export, cosméticos **sin pay-to-win** | P2 |
| **5** | Comunidad y eventos | §14 completo | P3 |

---

## 17. Implicaciones de datos (Supabase)

### Tablas nuevas / ampliadas (v2)

| Tabla | Propósito |
|---|---|
| `rankings` (unificada) o `rankings_*` | General + por bebida × periodos |
| `league_records` | Récords persistentes |
| `hall_of_fame_entries` | Podios liga/global |
| `user_streaks` | Rachas current/best |
| `activity_feed` | Eventos |
| `activity_reactions` | Reacciones |
| `level_definitions` | Títulos y umbrales |
| `challenges` / `challenge_progress` | Retos |
| `challenge_templates` | Plantillas semanales/especiales |
| `stats_daily` | Series para stats avanzadas |
| `drink_log_revisions` | Historial edits |
| `fraud_flags` | Cola antifraude |
| `reports` | Denuncias |
| `trophies` / `user_trophies` | Fase 5 |
| `events` / `event_scores` | Fase 5 |
| `league_votes` | Fase 5 |

### RPC críticas

- `log_drinks` → logs + rankings (general y drink) + stats + streaks + records check + feed + XP  
- `close_season(league_id, season_year)` → HoF + freeze  
- `add_reaction(event_id, type)`  
- `complete_challenge` / progress updaters  

### Storage

`avatars` · `league-images` · `badges` · (P3) `trophies`

---

## 18. Epics y user stories (resumen Jira)

### Epics v2

| ID | Epic | Prioridad |
|---|---|---|
| E01 | Autenticación y roles | P0 |
| E02 | Ligas e invitaciones | P0 |
| E03 | Registro de bebidas | P0 |
| E04 | Rankings general | P0 |
| E05 | Rankings por categoría (Reyes) | P1 |
| E06 | Temporadas e histórico | P0 |
| E07 | Feed + reacciones | P0 / P1 |
| E08 | Niveles y títulos | P0 |
| E09 | Logros | P0–P1 |
| E10 | Rachas | P1–P2 |
| E11 | Récords | P1 |
| E12 | Hall of Fame | P1–P2 |
| E13 | Desafíos | P1–P2 |
| E14 | Estadísticas avanzadas | P1 |
| E15 | Antifraude y moderación | P0–P2 |
| E16 | Comunidad y eventos (Fase 5) | P3 |

### Stories ejemplo (formato)

**E05-US01**  
Como miembro, quiero ver el ranking “Rey de la Cerveza” semanal para competir en mi categoría favorita.  
**AC:** Given liga con logs de cerveza, When abro Reyes → Cerveza → Semana, Then veo orden por unidades cerveza con desempates.

**E11-US01**  
Como miembro, quiero ver quién tiene el récord de más puntos en una noche.  
**AC:** Given un log de 80 pts que es máximo, When abro Récords, Then ese user aparece como holder con fecha.

**E07-US02**  
Como miembro, quiero reaccionar 🔥 a un evento del feed.  
**AC:** Given evento visible, When tap 🔥, Then contador +1; segundo tap quita mi reacción.

*(Importar a Jira: Epic → Story → AC Given/When/Then; labels `P0|P1|P2|P3`.)*

---

## 19. Riesgos

| Riesgo | Mitigación |
|---|---|
| Inflado de puntos | Límites, rate limit, reportes, admin |
| Complejidad de rankings (6×4) | Tabla unificada + UPSERT; UI con defaults General/Semana |
| Abuso de reacciones | Rate limit; sin chat reduce toxicidad |
| FOMO negativo / alcohol | Copy +18, sin incentivos monetarios por beber más |
| Jobs de temporada fallidos | Reconcile cron + cierre idempotente |
| Scope creep Fase 5 | Mantener P3 aislado hasta métricas P1 sanas |

---

## Decisiones de producto fijadas (v2)

| Tema | Decisión |
|---|---|
| Temporada | 2 ene → 1 ene siguiente (TZ liga) |
| Rankings categoría | 5 reyes + general × 4 periodos |
| Récords | Persistentes entre temporadas |
| HoF | Liga en P1; global en P2/P3 |
| Reacciones | 3 emojis; sin chat |
| XP | Puntos bebida + logros + retos + victorias ranking |
| Antifraude | Preventivo P0; detección/reportes P1–P2 |
| Fase 5 | Comunidad/eventos = P3 |

---

## Checklist de arranque (equipo)

- [ ] Importar Epics E01–E16 a Jira/GitHub Projects con labels Px  
- [ ] Migraciones Supabase v2: rankings unificados, records, HoF, streaks, reactions  
- [ ] Actualizar UI Clasificación (periodo × categoría)  
- [ ] Diseñar pantallas Récords + Hall of Fame  
- [ ] Definir plantillas de retos semanales Q1  
- [ ] Política +18 / consumo responsable en onboarding  

---

*Documento base de desarrollo DrinkLeague v2.0 — listo para Notion, Jira o GitHub Projects.*
