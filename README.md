# SportBook Backend

API REST de **SportBook**, una aplicación web para gestionar reservas de canchas
deportivas dentro de un complejo (canchas, horarios, reservas, equipamiento,
eventos y pagos).

Trabajo Práctico de la cátedra **Desarrollo de Software** (UTN).

Este proyecto es independiente del frontend: se comunica con él únicamente a
través de esta API, en JSON. El frontend vive en su propio repositorio,
[SportBook-FrontEnd](https://github.com/juanifaccio/SportBook-FrontEnd).

## Cómo se instala SportBook

La aplicación son dos programas que corren al mismo tiempo, cada uno en su
terminal, más una base de datos:

```
Frontend (Angular)  ──HTTP/JSON──►  Backend (Express)  ──Prisma──►  MySQL
localhost:4200                      localhost:3000                  localhost:3306
```

El orden importa, porque cada pieza necesita la anterior:

1. Instalar los programas necesarios: Node.js, Git y MySQL ([Requisitos previos](#requisitos-previos)).
2. Instalar y levantar **este backend** ([Instalación paso a paso](#instalación-paso-a-paso)).
3. Instalar y levantar el **frontend**, siguiendo el
   [README de su repositorio](https://github.com/juanifaccio/SportBook-FrontEnd#readme).

Los comandos de esta guía son para **Windows** (PowerShell o el símbolo del
sistema). Donde cambian en macOS o Linux, se indica.

## Tecnologías

- [Node.js](https://nodejs.org) con módulos CommonJS
- [Express](https://expressjs.com) 5 como framework web
- [Prisma](https://www.prisma.io) 7 como ORM, con el adaptador
  [`@prisma/adapter-mariadb`](https://www.npmjs.com/package/@prisma/adapter-mariadb)
  para hablar el protocolo MySQL
- **MySQL 8** como base de datos (externa, no embebida)
- [bcryptjs](https://www.npmjs.com/package/bcryptjs) para hashear contraseñas
- [jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken) para los tokens de
  sesión (JWT)

## Requisitos previos

Tres programas, los tres obligatorios. Después de instalar cada uno, **cerrá la
terminal y abrí una nueva**: Windows actualiza el `PATH` recién en las terminales
nuevas, y hasta entonces los comandos no se reconocen.

### Node.js

Es el motor con el que corre el backend, y trae `npm`, con el que se instalan las
dependencias.

- Descargalo de <https://nodejs.org> eligiendo la versión **LTS (24.x)**. Es con la
  que se desarrolla el proyecto y sirve tanto para el backend como para el
  frontend.
- Este backend necesita como mínimo **Node.js 20.19** (lo exige Prisma 7, que
  admite `^20.19 || ^22.12 || >=24`). El frontend pide una versión más nueva, así
  que si ya tenés Node instalado, revisá también los requisitos de su README.

Verificá que quedó instalado (los dos tienen que responder un número de versión):

```bash
node --version
```

```bash
npm --version
```

### Git

Para descargar (clonar) el repositorio.

- Descargalo de <https://git-scm.com/downloads> y dejá las opciones que vienen
  por defecto en el instalador.

```bash
git --version
```

### MySQL 8

Es la base de datos. Tiene que haber un **servidor MySQL corriendo** en la
máquina (o accesible en la red).

1. Descargá el **MySQL Installer for Windows** de
   <https://dev.mysql.com/downloads/installer/> (el archivo más grande, el que no
   dice *web*) y en el instalador elegí **MySQL Server 8.x**. El tipo de
   instalación puede ser *Server only*.
2. Dejá el puerto por defecto, **3306**.
3. En *Accounts and Roles*, **anotá la contraseña que le ponés al usuario
   `root`**: va en la configuración del backend, más abajo.
4. En *Windows Service*, dejá tildado que MySQL **arranque como servicio** junto
   con Windows. Así está disponible cada vez que prendés la máquina y no hay que
   levantarlo a mano.

No hace falta crear la base de datos ni las tablas: de eso se encarga Prisma en
la instalación.

Para comprobar que el servidor está corriendo, en PowerShell:

```bash
Get-Service MySQL*
```

Tiene que aparecer con estado `Running`. Si dice `Stopped`, iniciá el servicio
desde la aplicación *Servicios* de Windows.

> **¿Sirve XAMPP, MariaDB o Docker?** El backend habla el protocolo de MySQL, así
> que en principio sí, pero el proyecto **está probado contra MySQL 8**. Si algo
> se comporta raro con otra cosa, probá primero con MySQL 8.

### Si PowerShell no deja ejecutar `npm`

En un Windows recién instalado es común que el primer `npm` responda algo como
*"No se puede cargar el archivo ...\npm.ps1 porque la ejecución de scripts está
deshabilitada en este sistema"*. Se resuelve una sola vez, habilitando los
scripts para tu usuario:

```bash
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

La alternativa es usar el **símbolo del sistema** (`cmd`) en lugar de
PowerShell, donde no pasa.

## Instalación paso a paso

### 1. Descargar el proyecto

Ubicate en la carpeta donde quieras guardar el proyecto, cloná el repositorio y
entrá a su carpeta:

```bash
git clone https://github.com/juanifaccio/SportBook-BackEnd.git
```

```bash
cd SportBook-BackEnd
```

Todos los comandos que siguen se corren **parado en esta carpeta**.

> Evitá carpetas sincronizadas con OneDrive o Google Drive (en Windows,
> *Documentos* y *Escritorio* suelen estarlo): se pelean con los miles de
> archivos de `node_modules` y la instalación se vuelve lenta o falla.

### 2. Instalar las dependencias

```bash
npm install
```

Tarda unos minutos la primera vez. Al terminar aparece la carpeta
`node_modules/` y queda generado el cliente de Prisma (el código con el que la
aplicación habla con la base).

### 3. Crear el archivo de configuración

Toda la configuración del backend sale de un archivo `.env` en la raíz del
proyecto. Ese archivo no viene en el repositorio porque tiene contraseñas, pero
sí viene una plantilla, `.env.example`. Copiala con el nombre `.env`:

```bash
copy .env.example .env
```

En macOS, Linux o Git Bash:

```bash
cp .env.example .env
```

> El archivo tiene que llamarse exactamente `.env`, sin nada antes ni después.
> Si lo creás o lo guardás con el Bloc de notas, fijate que no quede como
> `.env.txt`.

### 4. Completar la configuración

Abrí el `.env` con cualquier editor de texto y completá estos valores:

| Variable | Obligatoria | Qué es |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a MySQL, en formato `mysql://usuario:contrasena@host:puerto/base` |
| `JWT_SECRET` | Sí | Secreto con el que se firman las sesiones. Mínimo 32 caracteres |
| `ADMIN_EMAIL` | Sí, para el paso 6 | Email del administrador con el que vas a entrar a la aplicación |
| `ADMIN_CONTRASENA` | Sí, para el paso 6 | Su contraseña |
| `PORT` | No | Puerto en el que escucha la API. Si no está, se usa `3000` |
| `JWT_EXPIRACION` | No | Cuánto dura la sesión (`30m`, `8h`, `7d`). Si no está, 8 horas |

**`DATABASE_URL`**: reemplazá `usuario` y `contrasena` por los de tu MySQL. Si
seguiste los pasos de arriba, el usuario es `root` y la contraseña es la que
anotaste al instalarlo. El nombre de la base del final (`sportsbook`) **no tiene
que existir**: la crea el paso siguiente.

```
DATABASE_URL=mysql://root:tuContrasena@localhost:3306/sportsbook
```

> Si la contraseña de MySQL tiene alguno de los caracteres `@ : / # ? %`, hay
> que escribirlo codificado, porque si no rompe el formato de la URL: `@` se
> escribe `%40`, `:` es `%3A`, `/` es `%2F`, `#` es `%23`, `?` es `%3F` y `%` es
> `%25`. Por ejemplo, la contraseña `Pass@123` va como `Pass%40123`.

**`JWT_SECRET`**: el valor que trae la plantilla es un ejemplo y tiene que
reemplazarse. Generá uno aleatorio con este comando y pegalo en el archivo:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**`ADMIN_EMAIL` y `ADMIN_CONTRASENA`**: son el usuario y la contraseña con los que
vas a entrar a la aplicación la primera vez. Podés dejar los de la plantilla o
poner los tuyos, pero **decidilos ahora**: el paso 6 crea la cuenta con lo que
diga el archivo en ese momento.

Guardá el archivo. Si falta una variable o viene mal escrita, el servidor no
arranca y explica cuál es el problema.

### 5. Crear la base de datos

```bash
npm run prisma:migrate
```

Este comando crea la base de datos con todas sus tablas y carga los dos roles de
la aplicación (`ADMIN` y `CLIENTE`). El resto de las tablas quedan vacías.

Tiene que terminar con un mensaje del estilo *"Your database is now in sync with
your schema"*. Si en cambio da un error de conexión o de acceso, revisá
[Problemas frecuentes](#problemas-frecuentes).

> El usuario de MySQL del `DATABASE_URL` tiene que tener permiso para crear
> bases de datos: Prisma crea una base temporal para controlar las migraciones.
> `root` lo tiene.

### 6. Crear el administrador inicial

La aplicación pide iniciar sesión, y las cuentas nuevas las da de alta un
administrador: sin uno, a una base recién creada no se puede entrar. Este comando
crea el primero, con el `ADMIN_EMAIL` y el `ADMIN_CONTRASENA` del `.env`:

```bash
npm run seed
```

Tiene que responder `Administrador inicial creado: <tu email>`. Se puede correr
las veces que haga falta: si el email ya está registrado, avisa y no lo toca.

### 7. Levantar el servidor

```bash
npm start
```

Tiene que responder `Servidor ejecutándose en http://localhost:3000`.

**Dejá esta terminal abierta**: mientras el servidor corre, la terminal queda
ocupada, y si la cerrás, la aplicación deja de funcionar. Para apagarlo, `Ctrl+C`.

Para comprobar que anda, abrí <http://localhost:3000> en el navegador. Tiene que
mostrar:

```json
{"mensaje":"SportBook Backend funcionando"}
```

### 8. Seguir con el frontend

Con el backend corriendo, abrí **otra terminal** y seguí con el
[README del frontend](https://github.com/juanifaccio/SportBook-FrontEnd#readme).

## Las veces siguientes

Lo de arriba se hace una sola vez. Para volver a usar la aplicación otro día
alcanza con levantar el servidor desde la carpeta del proyecto (MySQL arranca
solo con Windows):

```bash
npm start
```

Si descargás cambios nuevos del repositorio (`git pull`), corré otra vez
`npm install` y, si entre los cambios hay carpetas nuevas en
`prisma/migrations/`, también `npm run prisma:migrate`.

## Problemas frecuentes

**`Falta la variable de entorno DATABASE_URL`** (o `JWT_SECRET`). No existe el
`.env` o le falta ese valor. Revisá los pasos 3 y 4, y que el archivo no se llame
`.env.txt`.

**`JWT_SECRET tiene que tener al menos 32 caracteres`.** Quedó un valor corto.
Generá uno con el comando del paso 4.

**`Can't reach database server`, `P1001` o `ECONNREFUSED`.** El servidor MySQL no
está corriendo, o el host o el puerto del `DATABASE_URL` no son los suyos.
Comprobá el servicio (ver [MySQL 8](#mysql-8)) y que el puerto sea `3306`.

**`Access denied for user`, `P1000` o `ER_ACCESS_DENIED_ERROR`.** El usuario o la
contraseña del `DATABASE_URL` no son los de tu MySQL. Si la contraseña tiene
caracteres especiales, revisá que estén codificados (paso 4).

**`Cannot find module '.prisma/client/default'`** o **`@prisma/client did not
initialize yet`.** Falta generar el cliente de Prisma. Se genera con:

```bash
npm run prisma:generate
```

**`Error: listen EADDRINUSE: address already in use :::3000`.** El puerto 3000 ya
está ocupado, casi siempre por otra terminal donde quedó el backend corriendo.
Cerrala, o cambiá el puerto en el `.env` (`PORT=3001`) teniendo en cuenta que
entonces hay que avisarle al frontend (ver su README).

**No puedo entrar a la aplicación: "Email o contraseña incorrectos".** Faltó el
paso 6, o estás usando datos distintos de los que tenía el `.env` cuando lo
corriste. Si cambiaste el `.env` después, el seed no pisa la cuenta ya creada:
poné otro `ADMIN_EMAIL` y corré `npm run seed` de nuevo.

**`mysql` o `mysqladmin` no se reconoce como comando.** No afecta al proyecto: el
backend se conecta solo y no necesita esos programas. Si los querés usar, agregá
`C:\Program Files\MySQL\MySQL Server 8.0\bin` al `Path` de Windows.

## Scripts disponibles

| Comando | Qué hace |
|---|---|
| `npm install` | Instala las dependencias y genera el cliente de Prisma |
| `npm run prisma:migrate` | Crea la base o le aplica las migraciones pendientes, y regenera el cliente |
| `npm run seed` | Crea el administrador inicial a partir del `.env` |
| `npm start` | Levanta el servidor en `http://localhost:3000` (o en el puerto de `PORT`) |
| `npm run dev` | Igual, pero reinicia solo ante cada cambio en el código |
| `npm run prisma:generate` | Regenera el cliente de Prisma (tras editar `schema.prisma`) |
| `npm run prisma:studio` | Abre Prisma Studio para ver y editar los datos en el navegador |

## Estructura del proyecto

El backend está organizado **en capas**: cada petición baja de las rutas al
controlador y del controlador a Prisma, sin saltear niveles.

```
.env.example          plantilla de configuración: copiar como .env
requests.http         peticiones de ejemplo para probar la API sin el frontend
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
  generated/prisma/   cliente generado por Prisma: no se edita ni se versiona
```

## API

Todos los recursos cuelgan de `/api`, y los cuerpos y las respuestas son JSON.
Salvo `POST /api/auth/login`, todos los endpoints piden la sesión iniciada.

| Recurso | URL | Qué es |
|---|---|---|
| Sesión | `/api/auth` | Inicio de sesión y perfil propio |
| Tipos de cancha | `/api/tipos-cancha` | Catálogo de tipos (fútbol 5, pádel...) |
| Tipos de evento | `/api/tipos-evento` | Catálogo de tipos (cumpleaños, torneo...) |
| Equipamiento | `/api/equipamientos` | Lo que el complejo alquila además de la cancha |
| Canchas | `/api/canchas` | Las canchas del complejo, filtrables por tipo |
| Horarios | `/api/horarios` | Los turnos de cada cancha |
| Roles | `/api/roles` | Los niveles de acceso (solo lectura) |
| Usuarios | `/api/usuarios` | Las cuentas de la aplicación |
| Reservas | `/api/reservas` | Reservar un turno, reprogramarlo y cancelarlo |
| Eventos | `/api/eventos` | Lo que se festeja o se juega en una reserva |
| Pagos | `/api/pagos` | Lo cobrado por cada reserva |

### Errores

Los errores salen **siempre** con la misma forma, en español:

```json
{ "mensaje": "Tipo de cancha no encontrado" }
```

| Código | Cuándo |
|---|---|
| `200 OK` | Listar, obtener, modificar o eliminar con éxito |
| `201 Created` | Alta con éxito |
| `400 Bad Request` | Faltan datos, o vienen con un formato o un id inválido |
| `401 Unauthorized` | Falta la sesión, venció o no es válida |
| `403 Forbidden` | La sesión sirve, pero ese usuario no puede hacer eso |
| `404 Not Found` | El recurso pedido no existe |
| `409 Conflict` | Choca con el estado actual: turno ya tomado, registro referenciado por otro, reserva ya cancelada |
| `500 Internal Server Error` | Error inesperado del servidor |

### Probar la API sin el frontend

El archivo `requests.http` tiene peticiones de ejemplo para todos los endpoints,
incluidos los casos de error. Se ejecutan desde VS Code con la extensión
[REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client),
o desde JetBrains con su cliente HTTP integrado.

## Estado del proyecto

Implementados de punta a punta: **TipoCancha**, **TipoEvento**, **Cancha**,
**Horario**, **Usuario**, **Evento**, **Pago** y **Equipamiento**, el catálogo
**Rol** de solo lectura, y los casos de uso de **reservar una cancha** (con
equipamiento), **gestionar reservas** (reprogramar y cancelar) y **registrar el
pago de una reserva**.
