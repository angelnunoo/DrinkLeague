-- Seed drink types + starter achievements

insert into public.drink_types (code, name, points, sort_order) values
  ('tequifresa', 'Tequifresa', 1, 1),
  ('cerveza', 'Cerveza', 3, 2),
  ('jarra', 'Jarra', 5, 3),
  ('chupito', 'Chupito', 7, 4),
  ('copa', 'Copa', 10, 5)
on conflict (code) do update
set name = excluded.name,
    points = excluded.points,
    sort_order = excluded.sort_order,
    is_active = true;

insert into public.achievement_definitions (code, name, description, scope, rule, sort_order) values
  ('first_sip', 'Primer trago', 'Registra tu primera bebida', 'global', '{"metric":"total_logs","op":">=","value":1}'::jsonb, 1),
  ('beer_10', 'Amigo de la cebada', 'Acumula 10 cervezas', 'global', '{"metric":"drink_count","drink":"cerveza","op":">=","value":10}'::jsonb, 2),
  ('shot_night', 'Noche de chupitos', '5 o más chupitos en un solo registro', 'global', '{"metric":"single_log_drink","drink":"chupito","op":">=","value":5}'::jsonb, 3),
  ('venue_hopper', 'Trotamundos', 'Registra en 5 locales distintos', 'global', '{"metric":"distinct_venues","op":">=","value":5}'::jsonb, 4),
  ('tequifresa_fan', 'Tequifresa lover', 'Acumula 25 tequifresas', 'global', '{"metric":"drink_count","drink":"tequifresa","op":">=","value":25}'::jsonb, 5),
  ('century', 'Centenario', 'Suma 100 puntos en una semana en una liga', 'league', '{"metric":"weekly_points","op":">=","value":100}'::jsonb, 6),
  ('week_podium', 'Podio semanal', 'Termina top 3 en la clasificación semanal', 'league', '{"metric":"weekly_rank","op":"<=","value":3}'::jsonb, 7),
  ('poly_league', 'Multiligas', 'Sé miembro activo de 3 o más ligas', 'global', '{"metric":"active_leagues","op":">=","value":3}'::jsonb, 8)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    scope = excluded.scope,
    rule = excluded.rule,
    sort_order = excluded.sort_order,
    is_active = true;
