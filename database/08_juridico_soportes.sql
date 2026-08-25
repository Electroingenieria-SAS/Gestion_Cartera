-- =========================================================
-- MÓDULO JURÍDICO — Soportes del traslado + operaciones transaccionales
--
-- Requiere que YA existan en la base:
--   public.clientes (con la columna cobro_juridico boolean)
--   public.juridico_historial (id bigint, cliente_nit text, accion text,
--                              motivo text, usuario_id uuid, usuario_nombre text,
--                              creado_en timestamptz)
--   public.profiles  y  public.mi_rol()   (creados en 01 y 04)
--
-- Ejecuta TODO este archivo en Supabase: SQL Editor -> New query -> pega -> Run.
-- Es idempotente: se puede correr varias veces sin dañar datos.
-- =========================================================

-- 1. Tabla de soportes, ligada al EVENTO de envío (una fila de juridico_historial).
--    Cada traslado a jurídico conserva su propio paquete de sustento.
create table if not exists public.juridico_adjuntos (
  id             bigint generated always as identity primary key,
  historial_id   bigint not null references public.juridico_historial(id) on delete cascade,
  cliente_nit    text   not null,
  ruta           text   not null,          -- ruta interna en el bucket 'gestiones-adjuntos'
  nombre_archivo text   not null,
  tipo_mime      text,
  tamano         bigint,
  creado_en      timestamptz not null default now()
);
create index if not exists idx_jadj_historial on public.juridico_adjuntos(historial_id);
create index if not exists idx_jadj_nit       on public.juridico_adjuntos(cliente_nit);

-- 2. RLS: leer soportes -> auxiliar, supervisor y jurídico.
--    NO hay política de escritura directa: los soportes solo se insertan
--    desde enviar_a_juridico() (security definer), nunca desde el navegador.
alter table public.juridico_adjuntos enable row level security;

drop policy if exists "jadj_sel" on public.juridico_adjuntos;
create policy "jadj_sel" on public.juridico_adjuntos
  for select to authenticated
  using (public.mi_rol() in ('auxiliar','supervisor','juridico'));

-- 3. ENVIAR a jurídico (transaccional). Exige al menos 1 soporte.
--    El usuario se resuelve del token de sesión; el navegador NO lo envía.
--    p_adjuntos es un arreglo JSON: [{ ruta, nombre, tipo, tamano }, ...]
create or replace function public.enviar_a_juridico(
  p_nit      text,
  p_motivo   text,
  p_adjuntos jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol     text;
  v_nombre  text;
  v_hist_id bigint;
  v_item    jsonb;
begin
  -- Solo cartera envía a jurídico.
  v_rol := public.mi_rol();
  if v_rol is null or v_rol not in ('auxiliar','supervisor') then
    raise exception 'No autorizado para enviar a cobro jurídico.';
  end if;

  -- Los soportes son obligatorios (regla de negocio).
  if p_adjuntos is null
     or jsonb_typeof(p_adjuntos) <> 'array'
     or jsonb_array_length(p_adjuntos) < 1 then
    raise exception 'Debes adjuntar al menos un soporte.';
  end if;

  select nombre into v_nombre from public.profiles where id = auth.uid();

  update public.clientes set cobro_juridico = true where nit = p_nit;
  if not found then
    raise exception 'El cliente % no existe.', p_nit;
  end if;

  insert into public.juridico_historial (cliente_nit, accion, motivo, usuario_id, usuario_nombre)
  values (p_nit, 'Enviado', nullif(btrim(p_motivo), ''), auth.uid(), coalesce(v_nombre, 'Sistema'))
  returning id into v_hist_id;

  for v_item in select value from jsonb_array_elements(p_adjuntos)
  loop
    insert into public.juridico_adjuntos (historial_id, cliente_nit, ruta, nombre_archivo, tipo_mime, tamano)
    values (
      v_hist_id,
      p_nit,
      v_item->>'ruta',
      v_item->>'nombre',
      v_item->>'tipo',
      nullif(v_item->>'tamano', '')::bigint
    );
  end loop;

  return v_hist_id;
end;
$$;

-- 4. DEVOLVER de jurídico (transaccional) -> supervisor o jurídico.
create or replace function public.devolver_de_juridico(
  p_nit    text,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol    text;
  v_nombre text;
begin
  v_rol := public.mi_rol();
  if v_rol is null or v_rol not in ('supervisor','juridico') then
    raise exception 'No autorizado para devolver de cobro jurídico.';
  end if;

  select nombre into v_nombre from public.profiles where id = auth.uid();

  update public.clientes set cobro_juridico = false where nit = p_nit;
  if not found then
    raise exception 'El cliente % no existe.', p_nit;
  end if;

  insert into public.juridico_historial (cliente_nit, accion, motivo, usuario_id, usuario_nombre)
  values (p_nit, 'Devuelto', nullif(btrim(p_motivo), ''), auth.uid(), coalesce(v_nombre, 'Sistema'));
end;
$$;

-- 5. Permisos: solo usuarios autenticados pueden ejecutar; el rol se valida DENTRO.
revoke all on function public.enviar_a_juridico(text, text, jsonb) from public;
revoke all on function public.devolver_de_juridico(text, text)     from public;
grant execute on function public.enviar_a_juridico(text, text, jsonb) to authenticated;
grant execute on function public.devolver_de_juridico(text, text)     to authenticated;

-- =========================================================
-- OPCIONAL — Solo si el rol 'juridico' NO puede DESCARGAR los soportes.
-- Verifica primero las políticas actuales del bucket 'gestiones-adjuntos'
-- (Storage -> Policies). Si la lectura ya es para 'authenticated', NO ejecutes esto.
-- Este bloque permite SELECT sobre los objetos de ese bucket a cualquier
-- usuario autenticado (mismo criterio que las gestiones existentes).
-- =========================================================
-- drop policy if exists "adjuntos_sel_auth" on storage.objects;
-- create policy "adjuntos_sel_auth" on storage.objects
--   for select to authenticated
--   using (bucket_id = 'gestiones-adjuntos');
