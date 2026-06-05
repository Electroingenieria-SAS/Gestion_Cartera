-- =========================================================
-- FASE 3 — Base de datos de cartera
-- Ejecuta TODO este archivo en Supabase: SQL Editor -> New query -> pega -> Run
-- Modelo: cada subida diaria es una "carga" (foto del día). Se conservan
-- todas las cargas como histórico; la cartera "actual" es la más reciente.
-- =========================================================

-- 1. CARGAS: cada subida del Excel + sus indicadores ya calculados.
create table if not exists public.cargas (
  id                uuid primary key default gen_random_uuid(),
  fecha_carga       timestamptz not null default now(),
  nombre_archivo    text,
  usuario_id        uuid references auth.users(id),
  total_documentos  int default 0,
  cartera_total     numeric default 0,
  cartera_vigente   numeric default 0,
  cartera_vencida   numeric default 0,
  pct_vencida       numeric default 0,
  clientes_totales  int default 0,
  clientes_mora     int default 0,
  clientes_riesgo   int default 0
);

-- 2. CARTERA_DOCUMENTOS: cada fila del Excel, ligada a una carga.
create table if not exists public.cartera_documentos (
  id                bigint generated always as identity primary key,
  carga_id          uuid not null references public.cargas(id) on delete cascade,
  nit               text,
  nombre_cliente    text,
  ciudad            text,
  vendedor          text,
  nit_vendedor      text,
  tipo_docto        text,
  numero_docto      text,
  fecha_docto       text,
  fecha_vencimiento text,
  condicion_pago    text,
  cupo              numeric,
  valor_original    numeric,
  saldo             numeric,
  dias_vencidos     int,
  categoria         text
);
create index if not exists idx_docs_carga on public.cartera_documentos(carga_id);
create index if not exists idx_docs_nit   on public.cartera_documentos(nit);

-- 3. CLIENTES: maestro estable de clientes (para gestiones y acuerdos futuros).
create table if not exists public.clientes (
  nit             text primary key,
  nombre          text,
  ciudad          text,
  vendedor        text,
  actualizado_en  timestamptz default now()
);

-- 4. Seguridad (RLS): por ahora cualquier usuario que haya iniciado sesión
--    puede leer y cargar. Los permisos por rol los afinamos más adelante.
alter table public.cargas             enable row level security;
alter table public.cartera_documentos enable row level security;
alter table public.clientes           enable row level security;

drop policy if exists "cargas_auth" on public.cargas;
create policy "cargas_auth" on public.cargas
  for all to authenticated using (true) with check (true);

drop policy if exists "docs_auth" on public.cartera_documentos;
create policy "docs_auth" on public.cartera_documentos
  for all to authenticated using (true) with check (true);

drop policy if exists "clientes_auth" on public.clientes;
create policy "clientes_auth" on public.clientes
  for all to authenticated using (true) with check (true);
