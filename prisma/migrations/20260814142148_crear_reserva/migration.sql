-- CreateTable
CREATE TABLE `Reserva` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fecha` DATE NOT NULL,
    `horaInicio` VARCHAR(5) NOT NULL,
    `horaFin` VARCHAR(5) NOT NULL,
    `estado` ENUM('PENDIENTE', 'CONFIRMADA', 'CANCELADA') NOT NULL,
    `precioTotal` DECIMAL(10, 2) NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `canchaId` INTEGER NOT NULL,
    `horarioId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Reserva` ADD CONSTRAINT `Reserva_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reserva` ADD CONSTRAINT `Reserva_canchaId_fkey` FOREIGN KEY (`canchaId`) REFERENCES `Cancha`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reserva` ADD CONSTRAINT `Reserva_horarioId_fkey` FOREIGN KEY (`horarioId`) REFERENCES `Horario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
