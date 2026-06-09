-- =========================================================
-- FASE 7 — Seguridad por roles (RLS)
-- Ejecuta TODO este archivo en Supabase: SQL Editor -> New query -> pega -> Run
--
-- Reglas:
--   consulta   -> SOLO LEER (no carga, no edita, no registra)
--   auxiliar   -> leer + cargar + gestionar + crear acuerdos
--   supervisor -> igual que auxiliar (acceso completo)
-- =========================================================

-- Función que devuelve el rol del usuario actual.
create or replace function public.mi_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.profiles where id = auth.uid();
$$;

-- Helper: aplica las políticas a una tabla.
-- (No existe "macro" en SQL, así que lo hacemos tabla por tabla.)

-- ===== cargas =====
drop policy if exists "cargas_auth" on public.cargas;
drop policy if exists "cargas_sel" on public.cargas;
drop policy if exists "cargas_ins" on public.cargas;
drop policy if exists "cargas_upd" on public.cargas;
drop policy if exists "cargas_del" on public.cargas;
create policy "cargas_sel" on public.cargas for select to authenticated using (true);
create policy "cargas_ins" on public.cargas for insert to authenticated with check (public.mi_rol() in ('auxiliar','supervisor'));
create policy "cargas_upd" on public.cargas for update to authenticated using (public.mi_rol() in ('auxiliar','supervisor')) with check (public.mi_rol() in ('auxiliar','supervisor'));
create policy "cargas_del" on public.cargas for delete to authenticated using (public.mi_rol() in ('auxiliar','supervisor'));

-- ===== cartera_documentos =====
drop policy if exists "docs_auth" on public.cartera_documentos;
drop policy if exists "docs_sel" on public.cartera_documentos;
drop policy if exists "docs_ins" on public.cartera_documentos;
drop policy if exists "docs_upd" on public.cartera_documentos;
drop policy if exists "docs_del" on public.cartera_documentos;
create policy "docs_sel" on public.cartera_documentos for select to authenticated using (true);
create policy "docs_ins" on public.cartera_documentos for insert to authenticated with check (public.mi_rol() in ('auxiliar','supervisor'));
create policy "docs_upd" on public.cartera_documentos for update to authenticated using (public.mi_rol() in ('auxiliar','supervisor')) with check (public.mi_rol() in ('auxiliar','supervisor'));
create policy "docs_del" on public.cartera_documentos for delete to authenticated using (public.mi_rol() in ('auxiliar','supervisor'));

-- ===== clientes =====
drop policy if exists "clientes_auth" on public.clientes;
drop policy if exists "clientes_sel" on public.clientes;
drop policy if exists "clientes_ins" on public.clientes;
drop policy if exists "clientes_upd" on public.clientes;
drop policy if exists "clientes_del" on public.clientes;
create policy "clientes_sel" on public.clientes for select to authenticated using (true);
create policy "clientes_ins" on public.clientes for insert to authenticated with check (public.mi_rol() in ('auxiliar','supervisor'));
create policy "clientes_upd" on public.clientes for update to authenticated using (public.mi_rol() in ('auxiliar','supervisor')) with check (public.mi_rol() in ('auxiliar','supervisor'));
create policy "clientes_del" on public.clientes for delete to authenticated using (public.mi_rol() in ('auxiliar','supervisor'));

-- ===== gestiones =====
drop policy if exists "gestiones_auth" on public.gestiones;
drop policy if exists "gestiones_sel" on public.gestiones;
drop policy if exists "gestiones_ins" on public.gestiones;
drop policy if exists "gestiones_upd" on public.gestiones;
drop policy if exists "gestiones_del" on public.gestiones;
create policy "gestiones_sel" on public.gestiones for select to authenticated using (true);
create policy "gestiones_ins" on public.gestiones for insert to authenticated with check (public.mi_rol() in ('auxiliar','supervisor'));
create policy "gestiones_upd" on public.gestiones for update to authenticated using (public.mi_rol() in ('auxiliar','supervisor')) with check (public.mi_rol() in ('auxiliar','supervisor'));
create policy "gestiones_del" on public.gestiones for delete to authenticated using (public.mi_rol() in ('auxiliar','supervisor'));

-- ===== acuerdos_pago =====
drop policy if exists "acuerdos_auth" on public.acuerdos_pago;
drop policy if exists "acuerdos_sel" on public.acuerdos_pago;
drop policy if exists "acuerdos_ins" on public.acuerdos_pago;
drop policy if exists "acuerdos_upd" on public.acuerdos_pago;
drop policy if exists "acuerdos_del" on public.acuerdos_pago;
create policy "acuerdos_sel" on public.acuerdos_pago for select to authenticated using (true);
create policy "acuerdos_ins" on public.acuerdos_pago for insert to authenticated with check (public.mi_rol() in ('auxiliar','supervisor'));
create policy "acuerdos_upd" on public.acuerdos_pago for update to authenticated using (public.mi_rol() in ('auxiliar','supervisor')) with check (public.mi_rol() in ('auxiliar','supervisor'));
create policy "acuerdos_del" on public.acuerdos_pago for delete to authenticated using (public.mi_rol() in ('auxiliar','supervisor'));
