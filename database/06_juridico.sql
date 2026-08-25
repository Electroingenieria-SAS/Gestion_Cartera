-- =========================================================
-- FASE 8 — Cobro jurídico
-- Documenta objetos que hoy existen en producción pero no
-- estaban versionados: la marca de cobro jurídico en clientes
-- y el historial de movimientos jurídicos.
-- =========================================================

-- 1. Marca de cobro jurídico en clientes.
alter table public.clientes
  add column if not exists cobro_juridico boolean not null default false;

-- 2. Historial de movimientos jurídicos (envío / devolución).
create table if not exists public.juridico_historial (
  id              bigint generated always as identity primary key,
  cliente_nit     text not null,
  accion          text not null,
  motivo          text,
  usuario_id      uuid,
  usuario_nombre  text,
  creado_en       timestamptz not null default now()
);
create index if not exists idx_jh_cliente on public.juridico_historial(cliente_nit);

-- 3. Seguridad (RLS): leer autenticados; insertar solo roles de gestión.
--    Sin políticas de update/delete => historial inmutable.
alter table public.juridico_historial enable row level security;

drop policy if exists "jh_sel" on public.juridico_historial;
create policy "jh_sel" on public.juridico_historial
  for select to authenticated using (true);

drop policy if exists "jh_ins" on public.juridico_historial;
create policy "jh_ins" on public.juridico_historial
  for insert to authenticated
  with check (public.mi_rol() in ('auxiliar','supervisor','juridico'));
