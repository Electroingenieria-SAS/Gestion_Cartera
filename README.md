# Gestión de Cartera

Plataforma web para la gestión integral de cartera y cobranzas. Reemplaza el
trabajo manual en Excel por indicadores en tiempo real, un plan diario de cobro
priorizado, gestión de clientes, acuerdos de pago, cobro jurídico y alertas por
correo.

**Construido para Electroingeniería S.A.S. — Desarrollado por Juan Camilo Montoya**

---

## Tecnología

- **Next.js 14** (React) — interfaz web, desplegada en **Vercel**.
- **Supabase** (PostgreSQL + Auth) — base de datos, autenticación y seguridad por
  filas (RLS).
- **Nodemailer** sobre **SMTP (Office 365)** — envío de los correos de alertas y
  reportes.
- **SheetJS / ExcelJS** — lectura del Excel de Siesa y exportación de reportes.
- **jsPDF**, **Recharts** — generación de PDF e indicadores visuales.

Todo el flujo corre sobre planes gratuitos / de la empresa, sin servidores
propios que administrar.

---

## Módulos

| Módulo | Qué hace |
| --- | --- |
| **Cargar archivo de Siesa** | Sube el Excel diario de cartera y lo procesa. |
| **Seguimiento en Cartera** (dashboard) | Indicadores y análisis de la cartera. |
| **Plan diario** | Clientes ordenados por prioridad de cobro. |
| **Cartera** | Detalle de facturas. |
| **Clientes** | Listado de clientes de la cartera actual. |
| **Ficha de cliente** | Detalle, gestiones y traslado a cobro jurídico. |
| **Acuerdos de pago** | Seguimiento a los compromisos. |
| **Alertas** | Lo que requiere atención hoy. |
| **Gestión masiva** | Registrar una gestión a varios clientes a la vez. |
| **Cobro jurídico** | Clientes trasladados a cobranza jurídica. |
| **Predicción de pago** | Probabilidad de pago y riesgo por cliente. |
| **Pronóstico de recaudo** | Estimación de recaudo de la semana. |
| **Trazabilidad** | Historial de gestiones y actividad del equipo. |

---

## Roles de usuario

El acceso se controla por rol, y las reglas se aplican tanto en la interfaz como
en la base de datos (RLS), no solo en el front:

- **auxiliar** — gestiona la cartera del día a día (cargar, registrar gestiones,
  acuerdos, enviar correos).
- **supervisor** — todo lo del auxiliar, más acceso a la trazabilidad.
- **consulta** — solo lectura.
- **juridico** — bandeja de solo lectura con los clientes en cobro jurídico.

---

## Seguridad

- Autenticación con Supabase Auth. Ningún dato es accesible sin sesión válida.
- **Row Level Security (RLS)** en todas las tablas: la base de datos es la línea
  real de defensa. La `anon key` solo puede hacer lo que las políticas permiten.
- Los endpoints de correo (`app/api/enviar-*`) validan la sesión y el rol del
  usuario antes de ejecutarse.
- Las tablas de auditoría e historial jurídico son inmutables desde la app (sin
  políticas de modificación/borrado).
- Todas las claves viven en variables de entorno, nunca en el código.

---

## Despliegue

1. El código vive en este repositorio de **GitHub**.
2. **Vercel** está conectado al repositorio: cada cambio subido a GitHub se
   publica automáticamente. Si el build falla, la versión anterior sigue activa.
3. La base de datos y los usuarios viven en **Supabase**.

No hace falta instalar nada en el computador: Vercel instala las dependencias y
construye el proyecto.

---

## Variables de entorno

Se configuran en **Vercel → Settings → Environment Variables**, nunca dentro del
código. Se agrupan en:

- **Supabase:** URL del proyecto y llaves de acceso.
- **SMTP:** usuario y contraseña de la cuenta de correo saliente.
- **Correos destino:** direcciones a las que se envían alertas y reportes.

El archivo `.env.example` lista las variables necesarias como referencia.

---

## Base de datos

Los scripts SQL versionados están en la carpeta `database/` (perfiles y roles,
cartera, gestiones, seguridad/RLS, auditoría y cobro jurídico). Sirven para
recrear la estructura de la base desde cero.
