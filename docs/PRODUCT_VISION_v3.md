# DrinkLeague — Visión de Plataforma v3.0

**Producto:** PWA social-competitiva de ligas privadas  
**Sensación:** Fortnite × Clash of Clans × Strava × Duolingo × red social  
**Prioridad #1 UX:** registrar consumición en &lt; 3 segundos  

---

## Principios no negociables

1. **Registro libre:** email + password, **sin verificación de correo**, acceso inmediato.  
2. **Superadmin único:** `angel.nuunoo@gmail.com` (mismo login; rol `superadmin`).  
3. **Ligas privadas** como unidad social principal.  
4. **Gamificación constante:** siempre hay algo que desbloquear, mejorar o consultar.  
5. **Sin pay-to-win** (cosméticos sí; puntos no).  

---

## Cinco pilares

| # | Pilar | Núcleo |
|---|---|---|
| 1 | **Ligas** | Crear/unir, capitán/miembro, rankings, temporada 2 ene→2 ene |
| 2 | **Social** | Amigos, química, feed, rivalidades, perfiles |
| 3 | **Estadísticas** | Personales, liga, históricos, récords, comparativas |
| 4 | **Competición** | Desafíos, guerras, divisiones, torneos, HoF |
| 5 | **Progresión** | XP, niveles, rangos, títulos, insignias, pase 100 niveles |

---

## Roadmap de ejecución (realista)

### Fase A — Cimientos (ahora)
- Auth sin confirmación email (config Supabase)  
- Superadmin `angel.nuunoo@gmail.com`  
- Home = **Quick Log**  
- Friend code + solicitudes de amistad (DB + UI básica)  
- Química (modelo + job semanal stub)  
- Navegación: Inicio · Social · Liga · Rank · Yo  

### Fase B — Competición social
- Desafíos 1v1 / multiformato  
- Rivalidades permanentes  
- Feed social enriquecido + reacciones  
- Stats personales avanzadas + comparativa amigos  

### Fase C — Guerras de ligas
- Matchmaking semanal  
- MVP, trofeos, divisiones  
- Hall of Fame de guerras  

### Fase D — Progresión AAA
- Pase de batalla 100 niveles + misiones  
- Cosméticos (avatares, marcos, banners)  
- Logros secretos / eventos  

### Fase E — Escala / torneos
- Torneos mensuales eliminatorios  
- Ranking mundial entre ligas  
- Analítica superadmin global  

---

## Temporada

- **Inicio:** 2 enero 00:00 (TZ liga)  
- **Fin:** instante anterior al 2 enero siguiente  
- Rankings: semanal · mensual · anual · histórica  

## Bebidas (puntos)

| Bebida | Pts |
|---|---|
| Tequifresa | 1 |
| Cerveza | 3 |
| Jarra | 5 |
| Chupito | 7 |
| Copa | 10 |

---

## Química (amistad)

| Nivel | Nombre |
|---|---|
| 0 | Desconocidos |
| 1 | Compañeros |
| 2 | Amigos |
| 3 | Grandes amigos |
| 4 | Hermanos de barra |
| 5 | Leyendas inseparables |

**Decay:** si no hay actividad relacionada lunes→lunes → −química.

---

## Guerras

- Semanales, 7 días, suma de puntos de miembros  
- Divisiones: Bronce → Leyenda  
- MVP = mayor aportación  

## Pase de batalla

- 100 niveles / temporada  
- XP desde puntos + misiones  
- Recompensas cosméticas  

---

## Priorización backlog

| Prioridad | Scope |
|---|---|
| **P0** | Auth sin verify, Quick Log home, ligas, rankings base, friend codes |
| **P1** | Amigos UI, feed social, stats+, desafíos 1v1, química |
| **P2** | Guerras semanales, divisiones, rivalidades, perfil avanzado |
| **P3** | Battle pass, torneos, HoF global, cosméticos masivos |

*Este documento sustituye el alcance “MVP simple” como norte de producto; la entrega se hace por fases A→E.*
