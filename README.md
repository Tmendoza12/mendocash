# MendoCash — Documentación técnica y funcional

> Última actualización: septiembre 2026. Este documento se mantiene alineado con el estado actual de la aplicación y debe actualizarse cada vez que se incorpore, modifique o elimine una funcionalidad, estructura de datos o regla de negocio.

---

## 1. Descripción general y objetivo

**MendoCash** es una aplicación web para la **gestión de finanzas personales y familiares**. Permite a una persona administrar de forma integral sus ingresos, gastos, cuentas, categorías, préstamos, deudas, presupuestos, gastos recurrentes y reportes desde un solo lugar, con una interfaz moderna, responsiva y accesible.

**Objetivo:** dar al usuario una visión clara y en tiempo real de su situación financiera (cuánto tiene, cuánto gasta, cuánto debe y cuánto le deben), con trazabilidad completa de las operaciones.

---

## 2. Arquitectura y estructura general del sistema

Arquitectura cliente-servidor de tres capas:

| Capa | Tecnología | Descripción |
|---|---|---|
| **Frontend** | React + Vite + Tailwind CSS + Recharts | SPA (Single Page Application) con enrutado por hash, modo claro/oscuro y diseño responsive. |
| **Backend** | Node.js + Express | API REST (`/api`) con autenticación JWT, RBAC, validación y auditoría. |
| **Base de datos** | PostgreSQL | Modelo relacional normalizado con ~22 tablas, claves primarias/foráneas e índices. |

El backend **sirve también el frontend compilado** (login en `index.html` y la app en `app.html`), de modo que todo corre en un único proceso/puerto.

### Estructura de directorios

```
finanzas/
├── backend/
│   └── src/
│       ├── config/       # conexión a BD, variables de entorno
│       ├── db/           # schema.sql, seed, migraciones
│       ├── controllers/  # lógica de cada módulo
│       ├── routes/       # rutas/endpoints
│       ├── middleware/   # auth, RBAC, errores, rate-limit
│       ├── services/     # balance, auditoría, exportación, alcance
│       └── utils/
├── frontend/
│   └── src/
│       ├── api/          # cliente HTTP
│       ├── components/   # layout, UI reutilizable
│       ├── context/      # auth, tema, toasts
│       ├── pages/        # vistas de cada módulo
│       └── utils/
└── render.yaml           # despliegue en Render
```

---

## 3. Módulos y funcionalidades

| Módulo | Funcionalidades |
|---|---|
| **Autenticación** | Login por correo/contraseña, login con Google, registro, recuperación de contraseña, cambio de contraseña, establecimiento de contraseña tras Google, perfil, cierre de sesión. |
| **Dashboard** | KPIs (saldo, ingresos, gastos, balance, patrimonio, deudas, pendientes), gráficas (ingresos vs gastos, evolución de saldo, gastos por categoría, distribución por cuenta, estado de préstamos), alertas, selector de período. |
| **Cuentas** | CRUD de cuentas (bancaria, ahorros, efectivo, billetera, tarjeta de crédito, etc.), saldo calculado automáticamente a partir de movimientos. |
| **Categorías y subcategorías** | CRUD, categorías globales y personales, desactivación en vez de borrado cuando hay movimientos. |
| **Ingresos** | Registro, edición, eliminación; asociación automática a la cuenta seleccionada y actualización de saldo. |
| **Gastos** | Registro, edición, eliminación, filtros avanzados, búsqueda, exportación (CSV/Excel/PDF); persona relacionada opcional y pago a persona con descuento automático de deuda/préstamo. |
| **Transferencias** | Movimiento de dinero entre cuentas propias (no cuenta como ingreso ni gasto). |
| **Movimientos** | Vista centralizada de todos los movimientos (ingresos, gastos, transferencias, pagos) con búsqueda, filtros, paginación y exportación. |
| **Préstamos** | Dinero prestado/recibido, cuotas, pagos con capital e interés, saldo pendiente automático. |
| **Personas** | Catálogo de personas relacionadas (identificación principal: **cédula**). |
| **Deudas** | Control de obligaciones (tarjeta, crédito, compra a cuotas, deuda personal) con pagos y vencimientos. |
| **Presupuestos** | Límite mensual por categoría, cálculo automático de gastado/disponible/porcentaje y alertas (70/90/100%). |
| **Gastos recurrentes** | Configuración (nombre, valor, frecuencia, próximo cobro) y generación de movimientos. |
| **Reportes** | Mensual, anual, de préstamos, de deudas y por categorías; exportables. |
| **Calendario** | Visualización de pagos, cuotas, vencimientos, recurrentes e ingresos esperados. |
| **Notificaciones** | Alertas (cuotas, deudas vencidas, presupuestos, saldo bajo, recurrentes) y preferencias por usuario. |
| **Usuarios, roles y permisos** | Administración de usuarios, RBAC con permisos independientes de roles. |
| **Auditoría** | Registro de acciones (usuario, módulo, registro, datos anteriores/nuevos, IP, fecha). |
| **Configuración** | Moneda, formato de fecha, zona horaria y restablecimiento a valores de fábrica. |

---

## 4. Base de datos (tablas y relaciones)

### Tablas principales

| Tabla | Descripción | Relaciones |
|---|---|---|
| `users` | Usuarios (nombre, email, contraseña con hash, teléfono, avatar, activo, `password_set`, último acceso). | `user_roles`, `sessions` |
| `roles` | Roles (Administrador, Usuario, Supervisor). | `role_permissions`, `user_roles` |
| `permissions` | Permisos individuales (`gastos.ver`, `usuarios.crear`, etc.). | `role_permissions` |
| `role_permissions` | Asignación rol → permisos. | — |
| `user_roles` | Asignación usuario → roles. | — |
| `sessions` | Sesiones activas (token, IP, expiración, revocación). | `users` |
| `accounts` | Cuentas financieras (tipo, banco, saldo inicial y actual, moneda, sobregiro). | `users` |
| `categories` | Categorías (globales o por usuario; tipo ingreso/gasto). | `subcategories`, `users` |
| `subcategories` | Subcategorías. | `categories` |
| `income` | Ingresos (cuenta, categoría, fecha, valor, método, tipo). | `accounts`, `categories` |
| `expenses` | Gastos (cuenta, categoría/subcategoría, valor, método, comercio, **persona relacionada**, **es pago a persona**). | `accounts`, `categories`, `people` |
| `transfers` | Transferencias entre cuentas (origen, destino, grupo). | `accounts` |
| `people` | Personas relacionadas con préstamos (**cédula**, teléfono, relación). | `users` |
| `loans` | Préstamos (tipo prestado/recibido, valor, interés, cuotas, estado). | `people`, `users` |
| `loan_payments` | Pagos/abonos de préstamos (capital, interés, cuenta). | `loans` |
| `debts` | Deudas (acreedor, concepto, valor, cuotas, estado, **persona relacionada**). | `users`, `people` |
| `debt_payments` | Pagos de deudas. | `debts` |
| `budgets` | Presupuestos mensuales por categoría. | `categories`, `users` |
| `recurring_expenses` | Gastos recurrentes (frecuencia, próximo cobro). | `users`, `categories`, `accounts` |
| `notifications` / `notification_preferences` | Notificaciones y preferencias. | `users` |
| `audit_logs` | Registro de auditoría (JSON de datos anterior/nuevo). | `users` |
| `settings` | Configuración clave-valor (moneda, formato, zona horaria). | — |

### Relaciones entre entidades

- Un **usuario** tiene muchos `roles` (N:M vía `user_roles`); un **rol** tiene muchos `permissions` (N:M vía `role_permissions`).
- Un **usuario** tiene muchas `accounts`, `categories`, `income`, `expenses`, `loans`, `debts`, `people`, `budgets`, `recurring_expenses`, `notifications` (aislamiento de datos por `user_id`).
- Una **cuenta** es referenciada por `income`, `expenses` y `transfers` (origen/destino).
- Una **categoría** tiene muchas `subcategories`; `income`/`expenses` referencian `categories`/`subcategories`.
- Una **persona** tiene muchos `loans`; los `expenses` y `debts` pueden vincularse a una `persona`.
- Un **préstamo** tiene muchos `loan_payments`; una **deuda** tiene muchos `debt_payments`.

---

## 5. Requerimientos funcionales

- Registro e inicio de sesión (correo/contraseña y Google).
- Recuperación y restablecimiento de contraseña.
- Establecimiento de contraseña tras el primer login con Google.
- Sesión persistente (no se cierra automáticamente).
- CRUD de usuarios, roles y permisos (RBAC).
- CRUD de cuentas, categorías/subcategorías, ingresos, gastos, transferencias, personas, préstamos, deudas, presupuestos y recurrentes.
- Cálculo automático de saldos, balances, pendientes y patrimonio (Activos − Pasivos).
- Dashboard con KPIs, gráficas y alertas; selector de período.
- Reportes exportables (CSV/Excel/PDF).
- Registro de pagos y abonos con actualización automática del saldo.
- Registro de un gasto como "pago a una persona" con descuento automático de su deuda/préstamo.
- Notificaciones y preferencias.
- Auditoría de operaciones.
- Configuración con restablecimiento a valores de fábrica.
- Menú con secciones colapsables.
- Formato monetario consistente (separador de miles, decimales y símbolo).

---

## 6. Requerimientos no funcionales

- **Seguridad:** contraseñas con hash (bcrypt), JWT, protección SQL Injection (consultas parametrizadas), CORS/helmet, rate limiting en login, validación frontend y backend.
- **Rendimiento:** consultas paginadas, índices en columnas frecuentes.
- **Disponibilidad:** arquitectura de un solo proceso (fácil despliegue).
- **Usabilidad/accesibilidad:** diseño responsive (escritorio, tablet, móvil), respeto del *safe-area* de iOS (Dynamic Island), navegación por teclado (skip-link), etiquetas ARIA y gráficas legibles.
- **Escalabilidad:** separación de capas, componentes reutilizables, sin duplicación de lógica de negocio.
- **Mantenibilidad:** documentación actualizada de forma continua.

---

## 7. Reglas de negocio

1. **Saldo de cuenta** = saldo inicial + ingresos − gastos + transferencias entrantes − salientes + cobros de préstamos − pagos de préstamos − pagos de deudas. Se recalcula tras cada operación.
2. **Balance mensual** = ingresos − gastos.
3. **Patrimonio neto** = Activos − Pasivos (activos = saldos + dinero por cobrar; pasivos = préstamos por pagar + deudas).
4. **Saldo pendiente de préstamo** = valor − pagos de capital. Un pago no puede superar el pendiente.
5. **Transferencias** no son ingresos ni gastos; restan de origen y suman a destino, con identificador de grupo.
6. **Presupuestos:** alertas al 70%, 90% y 100% de uso.
7. **Categorías con movimientos** no se eliminan (se desactivan).
8. **Cuentas con movimientos** no se eliminan (se desactivan).
9. **Usuarios** solo acceden a sus propios datos, salvo que tengan permisos de alcance global (`datos.globales.*`).
10. **Pago a persona:** al registrar un gasto como pago a una persona, se descuenta del saldo pendiente de su préstamo (recibido) o deuda activa. Al eliminar el gasto, se revierte el descuento.
11. **Personas:** la identificación principal es la **cédula**.
12. **Cuentas:** no requieren saldo inicial; el saldo se calcula a partir de los movimientos.

---

## 8. Roles y permisos

| Rol | Alcance |
|---|---|
| **Administrador** | Acceso total: gestión de usuarios, roles, permisos, categorías globales, configuración y auditoría. |
| **Usuario** | Gestión de sus propios datos (cuentas, ingresos, gastos, préstamos, deudas, presupuestos, recurrentes, reportes) y categorías personales. |
| **Supervisor** | Solo lectura de la información financiera (no modifica configuraciones críticas). |

Los permisos son independientes de los roles (ej.: `usuarios.ver`, `usuarios.crear`, `gastos.ver`, `gastos.crear`, `prestamos.editar`, `reportes.ver`, `configuracion.editar`, `auditoria.ver`, `datos.globales.ver`, etc.).

---

## 9. Autenticación y gestión de sesiones

1. **Login** (correo/contraseña): verificación de hash (bcrypt) → se crea una `session` y se emite un JWT firmado con el `id` de usuario y de sesión.
2. **Login con Google:** se verifica el ID token con Google (`google-auth-library`); si el correo no existe, se crea el usuario con `password_set = FALSE` y se le pide establecer contraseña al primer ingreso.
3. **Sesión persistente:** el JWT y la sesión expiran a **10 años** (no hay cierre automático); solo se cierra cuando el usuario elige "Cerrar sesión" (revocación de la sesión).
4. **Middleware de autenticación:** valida el JWT y que la sesión no esté revocada ni expirada; carga los permisos del usuario.
5. **Recuperación de contraseña:** se genera un token de un solo uso (expira en 1 hora) y se restablece la contraseña.

---

## 10. Flujos principales

1. **Inicio de sesión** → página de login → (correo/contraseña o Google) → dashboard.
2. **Primer login con Google** → se solicita establecer una contraseña → queda habilitado el ingreso con contraseña.
3. **Registro de gasto** → se selecciona cuenta/categoría/valor → se actualiza el saldo de la cuenta.
4. **Pago a una persona** → se registra el gasto con persona y "es pago" → se descuenta del préstamo/deuda → se actualiza su estado.
5. **Registro de ingreso** → se asocia a la cuenta → se actualiza el saldo.
6. **Pago de préstamo** → se registra cuota (capital + interés) → se actualiza el saldo pendiente y el estado.
7. **Reportes** → se elige período → se visualiza/exporta.

---

## 11. Cambios y mejoras implementadas

- Arquitectura cliente-servidor con backend que sirve el frontend (un solo proceso).
- Autenticación con Google y establecimiento de contraseña posterior.
- Sesión persistente (sin cierre automático).
- Cédula como identificación de personas.
- Persona relacionada opcional en gastos y deudas, con descuento automático de saldos.
- Cuentas sin saldo inicial obligatorio.
- Menú con secciones colapsables.
- Rediseño visual (paleta teal/verde, tipografías Inter + Cormorant Garamond, degradados, tarjetas KPI).
- Mejoras de accesibilidad (safe-area iOS/Dynamic Island, skip-link, ARIA, gráficas horizontales legibles).
- Formato monetario con separador de miles en formularios.
- Restablecimiento de configuración a valores de fábrica.
- Migraciones automáticas e idempotentes de base de datos.

---

## 12. Instalación y despliegue

**Local:**
```bash
# Backend (crea la BD, aplica migraciones y datos de prueba)
cd backend && npm install && node src/server.js

# Frontend (compila a frontend/dist)
cd frontend && npm install && npm run build
```
Abre `http://localhost:4000`.

**Despliegue (Render + Neon):** el archivo `render.yaml` define el servicio; la variable `DATABASE_URL` se configura con la cadena de conexión de Neon.

**Credenciales de prueba:**
- `admin@mendocash.com / Admin123*`
- `juan@mendocash.com / Usuario123*`
- `maria@mendocash.com / Usuario123*`
