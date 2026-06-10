-- =========================================================
-- MÓDULO DE AUDITORÍA
-- Ejecuta TODO este archivo en Supabase: SQL Editor -> New query -> pega -> Run
--
-- Registra automáticamente quién hizo qué y cuándo, sin tocar la app:
--   * Cargó cartera
--   * Registró una gestión
--   * Creó o actualizó un acuerdo de pago
-- Solo los SUPERVISORES pueden ver el registro.
-- =========================================================

-- 1. Tabla de auditoría.
create table if not exists public.auditoria (
  id              bigint generated always as identity primary key,
  fecha           timestamptz not null default now(),
  usuario_id      uuid,
  usuario_nombre  text,
  accion          text,
  detalle         text,
  tabla           text
);
create index if not exists idx_aud_fecha on public.auditoria(fecha desc);

-- 2. Función que registra el evento (toma el usuario actual de la sesión).
create or replace function public.fn_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_accion text;
  v_detalle text;
begin
  select nombre into v_nombre from public.profiles where id = auth.uid();

  if TG_TABLE_NAME = 'cargas' then
    v_accion := 'Cargó cartera';
    v_detalle := coalesce(NEW.nombre_archivo, 'archivo') || ' · ' || coalesce(NEW.total_documentos::text, '0') || ' documentos';
  elsif TG_TABLE_NAME = 'gestiones' then
    v_accion := 'Registró gestión';
    v_detalle := 'Cliente ' || coalesce(NEW.cliente_nit, '') || ' · ' || coalesce(NEW.tipo, '') || ' / ' || coalesce(NEW.resultado, '');
  elsif TG_TABLE_NAME = 'acuerdos_pago' then
    if TG_OP = 'INSERT' then
      v_accion := 'Creó acuerdo de pago';
      v_detalle := 'Cliente ' || coalesce(NEW.cliente_nit, '') || ' · ' || coalesce(NEW.valor_comprometido::text, '0');
    else
      v_accion := 'Actualizó acuerdo';
      v_detalle := 'Cliente ' || coalesce(NEW.cliente_nit, '') || ' · estado: ' || coalesce(NEW.estado, '');
    end if;
  else
    v_accion := TG_OP;
    v_detalle := TG_TABLE_NAME;
  end if;

  insert into public.auditoria (usuario_id, usuario_nombre, accion, detalle, tabla)
  values (auth.uid(), coalesce(v_nombre, 'Sistema'), v_accion, v_detalle, TG_TABLE_NAME);

  return NEW;
end;
$$;

-- 3. Disparadores en las acciones importantes.
drop trigger if exists trg_aud_cargas on public.cargas;
create trigger trg_aud_cargas after insert on public.cargas
  for each row execute function public.fn_auditoria();

drop trigger if exists trg_aud_gestiones on public.gestiones;
create trigger trg_aud_gestiones after insert on public.gestiones
  for each row execute function public.fn_auditoria();

drop trigger if exists trg_aud_acuerdos on public.acuerdos_pago;
create trigger trg_aud_acuerdos after insert or update on public.acuerdos_pago
  for each row execute function public.fn_auditoria();

-- 4. Seguridad: SOLO los supervisores pueden leer la auditoría.
alter table public.auditoria enable row level security;
drop policy if exists "auditoria_sel" on public.auditoria;
create policy "auditoria_sel" on public.auditoria
  for select to authenticated using (public.mi_rol() = 'supervisor');
