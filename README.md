# Gestión de Cartera 

Plataforma web SaaS para la gestión integral de cartera y cobranzas.
Reemplaza el uso de Excel por indicadores en tiempo real, un plan diario de
cobro priorizado, gestión de clientes, acuerdos de pago y alertas automáticas.

**Construido para Electroingeniería S.A.S. — Desarrollado por Juan Camilo Montoya**

---

## Tecnología

- **Next.js 14** (React) — interfaz web, desplegada en **Vercel**.
- **Supabase** (PostgreSQL + Auth + Storage) — base de datos y autenticación.
- **Resend** — envío de correos para las alertas (fase de alertas).

Todo sobre planes gratuitos.

---

## Cómo se despliega (resumen)

1. El código vive en este repositorio de **GitHub**.
2. **Vercel** está conectado al repositorio: cada vez que se sube un cambio a
   GitHub, Vercel publica la nueva versión automáticamente.
3. La base de datos y los usuarios viven en **Supabase**.

No necesitas instalar nada en tu computador para que funcione: Vercel se encarga
de instalar las dependencias y construir el proyecto.

---

## Variables de entorno

Las claves se configuran en Vercel (Settings → Environment Variables), nunca
dentro del código. El archivo `.env.example` lista las variables necesarias en
cada fase.

---

## Estado del proyecto

Construido por fases:

- [x] **Fase 1** — Base del proyecto + despliegue + identidad de marca.
- [x] **Fase 2** — Login y roles (Supabase Auth).
- [x] **Fase 3** — Base de datos + carga del archivo de Siesa.
- [x] **Fase 4** — Dashboard de indicadores (KPIs).
- [x] **Fase 5** — Plan diario priorizado + ficha y gestión de clientes.
- [x] **Fase 6** — Acuerdos de pago + alertas + correos.
- [ ] **Fase 7** — IA predictiva (probabilidad de pago).
