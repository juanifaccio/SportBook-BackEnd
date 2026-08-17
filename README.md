# SportBook — Backend

API REST de **SportBook**, una aplicación web para gestionar reservas de canchas
deportivas dentro de un complejo (canchas, horarios, reservas, equipamiento,
eventos y pagos).

Trabajo Práctico de la cátedra **Desarrollo de Software** (UTN).

Este proyecto es independiente del frontend: se comunica con él únicamente a
través de esta API, en JSON. El frontend vive en su propio repositorio,
[SportBook-FrontEnd](https://github.com/juanifaccio/SportBook-FrontEnd).

## Tecnologías

- [Node.js](https://nodejs.org) 20+ con módulos CommonJS
- [Express](https://expressjs.com) 5 como framework web
- [Prisma](https://www.prisma.io) 7 como ORM, con el adaptador
  [`@prisma/adapter-mariadb`](https://www.npmjs.com/package/@prisma/adapter-mariadb)
  para hablar el protocolo MySQL
- **MySQL 8** como base de datos (externa, no embebida)
- [bcryptjs](https://www.npmjs.com/package/bcryptjs) para hashear contraseñas

## Requisitos previos

- **Node.js 20 o superior** y **npm 10 o superior**. Verificalo con:

  ```bash
  node --version
  ```

- Un **servidor MySQL 8 corriendo**, al que puedas conectarte. No hace falta
  crear la base ni las tablas a mano: de eso se encarga la migración de Prisma
  más abajo. Verificá que el servicio esté levantado con:

  ```bash
  mysqladmin --user=root --password status
  ```

## Instalación

Cloná el repositorio e instalá las dependencias:

```bash
npm install
```

## Configuración

Toda la configuración del backend sale de un archivo `.env` en la raíz del
proyecto. Hay una plantilla versionada, `.env.example`: copiala y completá los
valores con los de tu máquina.

```bash
cp .env.example .env
```

| Variable | Obligatoria | Qué es |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a MySQL, en formato `mysql://usuario:contrasena@host:puerto/base` |
| `PORT` | No | Puerto en el que escucha la API. Si no está, se usa `3000` |

`DATABASE_URL` es la **única** fuente de la conexión: la usan tanto el servidor
como el CLI de Prisma para las migraciones. No hay credenciales escritas en el
código.

El `.env` **no se versiona** (está en `.gitignore`), porque contiene
credenciales; el que sí se versiona es `.env.example`, que no las tiene.

Si falta una variable o viene mal escrita, el servidor no arranca y explica cuál
es el problema, en vez de fallar más tarde contra la base.

## Crear la base de datos

Con el `.env` listo, un solo comando crea la base, aplica todas las migraciones y
genera el cliente de Prisma:

```bash
npm run prisma:migrate
```

Esto deja las tablas creadas y siembra el catálogo de roles con `ADMIN` y
`CLIENTE`. El resto de las tablas quedan vacías: los datos se cargan desde el
frontend o con las peticiones de `requests.http`.

## Ejecución

Para levantar el servidor:

```bash
npm start
```

La API queda escuchando en `http://localhost:3000`, o en el puerto que hayas
puesto en `PORT`. Para comprobar que arrancó bien:

```bash
curl http://localhost:3000
```

Debería responder `{"mensaje":"SportBook Backend funcionando"}`.

## Scripts disponibles

| Comando | Qué hace |
|---|---|
| `npm start` | Levanta el servidor en `http://localhost:3000` (o en el puerto de `PORT`) |
| `npm run dev` | Igual, pero reinicia solo ante cada cambio en el código |
| `npm run prisma:migrate` | Crea y aplica las migraciones pendientes, y regenera el cliente |
| `npm run prisma:generate` | Regenera el cliente de Prisma (tras editar `schema.prisma`) |
| `npm run prisma:studio` | Abre Prisma Studio para inspeccionar los datos en el navegador |
| `npm test` | Todavía sin implementar (tarea #17 del backlog) |

## Estructura del proyecto

El backend está organizado **en capas**: cada petición baja de las rutas al
controlador y del controlador a Prisma, sin saltear niveles.

```
.env.example          plantilla de configuración: copiar como .env
prisma/
  schema.prisma       modelo de datos: única fuente de verdad del esquema
  migrations/         historial versionado de cambios de la base
src/
  app.js              punto de entrada: middlewares y montaje de cada recurso
  config/env.js       lee y valida las variables de ambiente
  config/prisma.js    instancia única de PrismaClient (acceso a la base)
  routes/             mapea verbo + URL a la función del controlador
  controllers/        valida la entrada, opera y arma la respuesta JSON
  generated/prisma/   cliente generado por Prisma — no se edita ni se versiona
```

## API

Todos los recursos cuelgan de `/api`. Los cuerpos y las respuestas son JSON.

### Tipos de cancha — `/api/tipos-cancha`

| Verbo | URL | Qué hace |
|---|---|---|
| `GET` | `/api/tipos-cancha` | Lista todos |
| `POST` | `/api/tipos-cancha` | Crea uno |
| `GET` | `/api/tipos-cancha/:id` | Obtiene uno |
| `PUT` | `/api/tipos-cancha/:id` | Modifica uno |
| `DELETE` | `/api/tipos-cancha/:id` | Elimina uno |

Cuerpo: `{ nombre, descripcion }`. El nombre es único.

### Tipos de evento — `/api/tipos-evento`

Los mismos cinco endpoints. Cuerpo: `{ nombre }`, único.

### Canchas — `/api/canchas`

Los mismos cinco endpoints. Cuerpo:
`{ nombre, precioPorHora, estado, tipoCanchaId }`, donde `estado` es
`DISPONIBLE` o `MANTENIMIENTO`. El listado incluye el tipo de cancha de cada
una.

### Horarios — `/api/horarios`

Son los turnos de una cancha. Los mismos cinco endpoints. Cuerpo:
`{ fecha, horaInicio, horaFin, canchaId }`, con la fecha como `"AAAA-MM-DD"` y
las horas como `"HH:mm"`. No se admiten turnos solapados en la misma cancha.

`GET /api/horarios` acepta filtros por query string, combinables:

| Filtro | Ejemplo |
|---|---|
| `canchaId` | `/api/horarios?canchaId=3` |
| `fecha` | `/api/horarios?fecha=2026-09-01` |
| `disponible` | `/api/horarios?disponible=true` |

### Roles — `/api/roles`

| Verbo | URL | Qué hace |
|---|---|---|
| `GET` | `/api/roles` | Lista los roles |

Es un **catálogo de solo lectura**: los roles se siembran por migración y son los
niveles de acceso del login. No tiene alta, baja ni modificación a propósito.

### Usuarios — `/api/usuarios`

Los mismos cinco endpoints. Cuerpo:
`{ nombre, email, contrasena, telefono, activo, rolId }`. El email es único y se
normaliza a minúsculas. La contraseña se guarda hasheada con bcrypt, **nunca
sale en las respuestas**, y al editar es opcional: si no se envía, se conserva la
guardada.

### Reservas — `/api/reservas`

No es un ABM: es el caso de uso central de la aplicación.

| Verbo | URL | Qué hace |
|---|---|---|
| `GET` | `/api/reservas` | Lista las reservas, de la más nueva a la más vieja |
| `POST` | `/api/reservas` | Reserva un turno libre |
| `GET` | `/api/reservas/:id` | Obtiene una |
| `PUT` | `/api/reservas/:id` | Reprograma a otro turno libre |
| `PUT` | `/api/reservas/:id/cancelar` | Cancela y libera el turno |

El alta recibe solo `{ horarioId, usuarioId }` y la reprogramación solo
`{ horarioId }`: la fecha, las horas, la cancha y el precio total se derivan del
turno en el servidor, no se aceptan del cliente.

`GET /api/reservas` acepta filtros por query string, combinables:

| Filtro | Ejemplo |
|---|---|
| `canchaId` | `/api/reservas?canchaId=3` |
| `usuarioId` | `/api/reservas?usuarioId=7` |
| `fecha` | `/api/reservas?fecha=2026-09-01` |
| `estado` | `/api/reservas?estado=CONFIRMADA` |

**No hay `DELETE` a propósito**: cancelar no es borrar. La reserva cancelada se
conserva como historial y su turno vuelve a la lista de libres.

### Códigos de respuesta

| Código | Cuándo |
|---|---|
| `200 OK` | Listar, obtener, modificar o eliminar con éxito |
| `201 Created` | Alta con éxito |
| `400 Bad Request` | Faltan datos, o vienen con un formato o un id inválido |
| `404 Not Found` | El recurso pedido no existe |
| `409 Conflict` | Choca con el estado actual: turno ya tomado, registro referenciado por otro, reserva ya cancelada |
| `500 Internal Server Error` | Error inesperado del servidor |

Los errores salen **siempre** con la misma forma, en español:

```json
{ "mensaje": "Tipo de cancha no encontrado" }
```

## Probar la API sin el frontend

El archivo `requests.http` de la raíz tiene peticiones de ejemplo para todos los
endpoints, incluidos los casos de error. Se ejecutan desde VS Code con la
extensión [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client),
o desde JetBrains con su cliente HTTP integrado.

## Estado del proyecto

Implementados de punta a punta: **TipoCancha**, **TipoEvento**, **Cancha**,
**Horario** y **Usuario**, el catálogo **Rol** de solo lectura, y los casos de
uso de **reservar una cancha** y **gestionar reservas** (reprogramar y cancelar).

El seguimiento de tareas y el detalle de lo que falta se llevan en el repositorio
de documentación del TP, en `docs/backlog.md`.
