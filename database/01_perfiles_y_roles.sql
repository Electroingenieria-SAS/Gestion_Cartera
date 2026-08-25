-- =========================================================
-- FASE 2 — Usuarios, perfiles y roles
-- Ejecuta TODO este archivo en Supabase: SQL Editor -> New query -> pega -> Run
-- =========================================================

-- 1. Tabla de perfiles (datos de cada usuario + su rol).
--    Se conecta con la tabla de usuarios interna de Supabase (auth.users).
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,
  rol         text not null default 'consulta'
              check (rol in ('auxiliar', 'supervisor', 'consulta', 'juridico')),
  creado_en   timestamptz not null default now()
);

-- 2. Seguridad a nivel de fila (RLS): cada usuario solo puede leer SU perfil.
alter table public.profiles enable row level security;

drop policy if exists "leer_propio_perfil" on public.profiles;
create policy "leer_propio_perfil"
  on public.profiles for select
  using (auth.uid() = id);

-- 3. Cuando creas un usuario nuevo (desde Authentication -> Users),
--    se crea AUTOMÁTICAMENTE su perfil con rol 'consulta'.
--    Luego tú editas su nombre y rol en el Table Editor.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nombre, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    'consulta'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
