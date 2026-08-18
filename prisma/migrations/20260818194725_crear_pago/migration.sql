-- CreateTable
CREATE TABLE `Pago` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `monto` DECIMAL(10, 2) NOT NULL,
    `fecha` DATE NOT NULL,
    `metodo` ENUM('EFECTIVO', 'TARJETA', 'TRANSFERENCIA') NOT NULL,
    `estado` ENUM('REGISTRADO', 'ANULADO') NOT NULL,
    `reservaId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Pago` ADD CONSTRAINT `Pago_reservaId_fkey` FOREIGN KEY (`reservaId`) REFERENCES `Reserva`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
