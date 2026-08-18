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
- [jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken) para los tokens de
  sesión (JWT)
- [`node:test`](https://nodejs.org/api/test.html), el runner que trae Node, para
  los tests, con [supertest](https://www.npmjs.com/package/supertest) para
  pedirle a la API por HTTP

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
| `JWT_SECRET` | Sí | Secreto con el que se firman los tokens de sesión. Mínimo 32 caracteres |
| `PORT` | No | Puerto en el que escucha la API. Si no está, se usa `3000` |
| `JWT_EXPIRACION` | No | Cuánto dura la sesión (`30m`, `8h`, `7d`). Si no está, 8 horas |
| `ADMIN_EMAIL` | Solo el seed | Email del administrador inicial que crea `npm run seed` |
| `ADMIN_CONTRASENA` | Solo el seed | Su contraseña |

`DATABASE_URL` es la **única** fuente de la conexión: la usan tanto el servidor
como el CLI de Prisma para las migraciones. No hay credenciales escritas en el
código.

`JWT_SECRET` no tiene valor por defecto a propósito: uno escrito en el código
sería público —está en el repositorio— y cualquiera podría firmarse un token de
administrador. Generá el tuyo con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

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
`CLIENTE`. El resto de las tablas quedan vacías.

## Crear el administrador inicial

La API pide iniciar sesión, y las cuentas las da de alta un administrador: sin
uno, a una base recién migrada no se puede entrar. Este comando crea el primero,
con el email y la contraseña que pusiste en `ADMIN_EMAIL` y `ADMIN_CONTRASENA`:

```bash
npm run seed
```

Se puede correr las veces que haga falta: si el email ya está registrado, no lo
toca. A partir de ahí, el resto de los usuarios se cargan desde el frontend o con
las peticiones de `requests.http`.

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

## Tests

Hay dos suites, con el runner que trae Node (`node:test`). Se separan porque
necesitan cosas distintas: una corre en cualquier lado y la otra necesita una
base de datos.

### Unitarios

Cubren las reglas del negocio y las validaciones: el cálculo del precio de una
reserva, si un turno ya empezó, los formatos de fecha y hora, la validación de
cada formulario, la lectura de las variables de ambiente y el middleware de
sesión. No tocan la base ni levantan el servidor, así que no hace falta
configurar nada:

```bash
npm test
```

### Integración

Le pegan por HTTP a la API entera —rutas, middlewares, controladores y Prisma
contra MySQL— para comprobar lo que solo se ve al juntar las piezas: que sin
token no se entra a ningún lado, que un cliente no llega a la reserva de otro,
que dos personas no pueden quedarse con el mismo turno, y que cancelar lo
devuelve a la lista de libres.

Necesitan **una base aparte de la de desarrollo**, porque vacían todas las tablas
antes de cada suite. Se configura una sola vez:

```bash
cp .env.test.example .env.test
```

Completá el `DATABASE_URL` de ese archivo con las credenciales de tu MySQL y un
nombre de base **terminado en `_test`** (por ejemplo `sportsbook_test`). Ese
sufijo no es una convención decorativa: `npm run test:preparar` y los propios
tests se niegan a correr si la base no lo tiene, para que un archivo mal
configurado no se lleve puestos tus datos de desarrollo.

Después, crear la base y aplicarle las migraciones:

```bash
npm run test:preparar
```

Y ya se pueden correr:

```bash
npm run test:integracion
```

`npm run test:preparar` hay que repetirlo cada vez que se agregue una migración
nueva. Para correr las dos suites de una: `npm run test:todo`.

> Si alguna vez matás una corrida a la fuerza (`kill -9`, cerrar la terminal de
> golpe), MySQL conserva abiertas las conexiones del proceso muerto junto con los
> locks que tuvieran, y la corrida siguiente se queda esperándolos. Se resuelve
> solo en un rato, o cerrando esas conexiones a mano. Cortando con `Ctrl+C` no
> pasa: el proceso alcanza a cerrarlas.

## Scripts disponibles

| Comando | Qué hace |
|---|---|
| `npm start` | Levanta el servidor en `http://localhost:3000` (o en el puerto de `PORT`) |
| `npm run dev` | Igual, pero reinicia solo ante cada cambio en el código |
| `npm run prisma:migrate` | Crea y aplica las migraciones pendientes, y regenera el cliente |
| `npm run prisma:generate` | Regenera el cliente de Prisma (tras editar `schema.prisma`) |
| `npm run prisma:studio` | Abre Prisma Studio para inspeccionar los datos en el navegador |
| `npm run seed` | Crea el administrador inicial a partir del `.env` |
| `npm test` | Corre los tests unitarios (no necesita base de datos) |
| `npm run test:preparar` | Crea la base de pruebas y le aplica las migraciones |
| `npm run test:integracion` | Corre los tests de integración contra la base de pruebas |
| `npm run test:todo` | Corre las dos suites, una después de la otra |

## Estructura del proyecto

El backend está organizado **en capas**: cada petición baja de las rutas al
controlador y del controlador a Prisma, sin saltear niveles.

```
.env.example          plantilla de configuración: copiar como .env
.env.test.example     plantilla de los tests de integración: copiar como .env.test
prisma/
  schema.prisma       modelo de datos: única fuente de verdad del esquema
  migrations/         historial versionado de cambios de la base
  seed.js             crea el administrador inicial
src/
  server.js           punto de entrada: pone la aplicación a escuchar
  app.js              arma la aplicación: middlewares y montaje de cada recurso
  config/env.js       lee y valida las variables de ambiente
  config/prisma.js    instancia única de PrismaClient (acceso a la base)
  config/roles.js     nombres de los niveles de acceso (ADMIN, CLIENTE)
  middlewares/        se ejecutan antes del controlador: sesión y permisos
  routes/             mapea verbo + URL a la función del controlador
  controllers/        valida la entrada, opera y arma la respuesta JSON
  generated/prisma/   cliente generado por Prisma — no se edita ni se versiona
tests/
  unitarios/          reglas de negocio y validaciones, sin base ni servidor
  integracion/        peticiones HTTP contra la API entera y la base real
  apoyo/              ambiente de los tests, datos sembrados y dobles de Express
```

## API

Todos los recursos cuelgan de `/api`. Los cuerpos y las respuestas son JSON.

### Autenticación — `/api/auth`

| Verbo | URL | Qué hace |
|---|---|---|
| `POST` | `/api/auth/login` | Valida email y contraseña y devuelve el token |
| `GET` | `/api/auth/yo` | Devuelve el usuario de la sesión en curso |

`POST /api/auth/login` recibe `{ email, contrasena }` y responde
`{ token, usuario }`. **Es el único endpoint público**: todos los demás piden el
token en la cabecera `Authorization`.

```
Authorization: Bearer <token>
```

El token es un JWT firmado con `JWT_SECRET` que vence según `JWT_EXPIRACION`. No
hay endpoint de logout: como el servidor no guarda las sesiones, cerrar sesión es
que el cliente descarte el token.

En cada petición el usuario se vuelve a leer de la base en lugar de confiar en lo
que dice el token: así, dar de baja o cambiarle el rol a alguien tiene efecto en
el momento y no cuando le venza la sesión.

### Niveles de acceso

Los dos roles del catálogo `Rol` son los niveles de acceso:

| | `ADMIN` | `CLIENTE` |
|---|---|---|
| Tipos de cancha, tipos de evento, canchas, horarios | Todo | Solo consultar |
| Usuarios y roles | Todo | Nada |
| Reservas | Todas | Solo las suyas |

Un `CLIENTE` consulta canchas y turnos porque los necesita para reservar, pero no
los administra. Sus reservas son suyas: el listado le devuelve solamente las
propias —aunque filtre por `?usuarioId=` de otro—, y pedir, reprogramar o
cancelar una ajena responde `403`. Al reservar, el dueño sale de la sesión y no
del cuerpo del pedido.

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

Los mismos cinco endpoints. Cuerpo: `{ nombre }`, único. No se puede eliminar un
tipo que ya tiene eventos cargados (`409`).

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
Solo lo consultan los administradores, que son quienes asignan el rol al dar de
alta un usuario.

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

El alta recibe solo `{ horarioId }` y la reprogramación también: la fecha, las
horas, la cancha y el precio total se derivan del turno en el servidor, no se
aceptan del cliente. El dueño de la reserva sale de la sesión; un `ADMIN` puede
agregar `usuarioId` para reservar a nombre de otro desde el mostrador, y para él
ese campo es obligatorio.

`GET /api/reservas` acepta filtros por query string, combinables:

| Filtro | Ejemplo |
|---|---|
| `canchaId` | `/api/reservas?canchaId=3` |
| `usuarioId` | `/api/reservas?usuarioId=7` |
| `fecha` | `/api/reservas?fecha=2026-09-01` |
| `estado` | `/api/reservas?estado=CONFIRMADA` |

**No hay `DELETE` a propósito**: cancelar no es borrar. La reserva cancelada se
conserva como historial y su turno vuelve a la lista de libres.

Cada reserva viaja con su `evento` incluido, o `null` si no tiene.

### Eventos — `/api/eventos`

Lo que se festeja o se juega en una reserva: un cumpleaños, un torneo, un partido
de la liga. Es opcional y **una reserva tiene a lo sumo uno**.

| Verbo | URL | Qué hace |
|---|---|---|
| `GET` | `/api/eventos` | Lista los eventos, del día más nuevo al más viejo |
| `POST` | `/api/eventos` | Le carga el evento a una reserva |
| `GET` | `/api/eventos/:id` | Obtiene uno |
| `PUT` | `/api/eventos/:id` | Modifica uno |
| `DELETE` | `/api/eventos/:id` | Elimina uno |

Cuerpo del alta: `{ descripcion, cantidadPersonas, tipoEventoId, reservaId }`. La
cantidad de personas tiene que ser un entero mayor a cero. El `PUT` recibe los
mismos campos **menos `reservaId`**: mover un evento de una reserva a otra no es
una operación del negocio, así que si viene se ignora.

`GET /api/eventos` acepta el filtro `reservaId`
(`/api/eventos?reservaId=4`). Cada evento viaja con su tipo y con la reserva
entera —cancha, tipo de cancha y usuario— para poder identificarla en el listado.

Los permisos son los de las reservas: un `ADMIN` los ve y los gestiona todos, y un
`CLIENTE` solo los de sus propias reservas (`403` si intenta con la de otro). Una
reserva **cancelada** no admite cargarle ni editarle el evento (`409`); borrarlo sí
se permite, porque es limpiar un dato que ya no aplica.

### Códigos de respuesta

| Código | Cuándo |
|---|---|
| `200 OK` | Listar, obtener, modificar o eliminar con éxito |
| `201 Created` | Alta con éxito |
| `400 Bad Request` | Faltan datos, o vienen con un formato o un id inválido |
| `401 Unauthorized` | La sesión no sirve: falta el token, venció, no es válido o la cuenta está dada de baja |
| `403 Forbidden` | La sesión sirve, pero ese usuario no puede hacer eso |
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
**Horario**, **Usuario** y **Evento**, el catálogo **Rol** de solo lectura, y los
casos de uso de **reservar una cancha** y **gestionar reservas** (reprogramar y
cancelar).

Todo eso está cubierto por tests: los unitarios sobre las reglas del negocio y
las validaciones, y los de integración sobre la API completa contra una base de
MySQL, incluidos los niveles de acceso y las reglas de quién puede tocar la
reserva de quién.

El seguimiento de tareas y el detalle de lo que falta se llevan en el repositorio
de documentación del TP, en `docs/backlog.md`.
