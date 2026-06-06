-- =========================================================
-- FASE 5 — Gestiones y acuerdos de pago
-- Ejecuta TODO este archivo en Supabase: SQL Editor -> New query -> pega -> Run
-- =========================================================

-- 1. Datos de contacto del cliente (no vienen de Siesa; se llenan a mano).
alter table public.clientes add column if not exists telefono text;
alter table public.clientes add column if not exists correo text;

-- 2. GESTIONES: cada contacto con el cliente (llamada, correo, visita, etc.).
create table if not exists public.gestiones (
  id              bigint generated always as identity primary key,
  cliente_nit     text not null,
  fecha           timestamptz not null default now(),
  tipo            text not null,
  resultado       text not null,
  observacion     text not null,
  usuario_id      uuid references auth.users(id),
  usuario_nombre  text
);
create index if not exists idx_gest_nit on public.gestiones(cliente_nit);

-- 3. ACUERDOS_PAGO: compromisos de pago registrados en una gestión.
create table if not exists public.acuerdos_pago (
  id                  bigint generated always as identity primary key,
  cliente_nit         text not null,
  gestion_id          bigint references public.gestiones(id) on delete set null,
  fecha_compromiso    date not null,
  valor_comprometido  numeric not null default 0,
  estado              text not null default 'Pendiente',
  creado_en           timestamptz not null default now()
);
create index if not exists idx_acu_nit on public.acuerdos_pago(cliente_nit);

-- 4. Seguridad (RLS): cualquier usuario con sesión puede leer y registrar.
alter table public.gestiones     enable row level security;
alter table public.acuerdos_pago enable row level security;

drop policy if exists "gestiones_auth" on public.gestiones;
create policy "gestiones_auth" on public.gestiones
  for all to authenticated using (true) with check (true);

drop policy if exists "acuerdos_auth" on public.acuerdos_pago;
create policy "acuerdos_auth" on public.acuerdos_pago
  for all to authenticated using (true) with check (true);
