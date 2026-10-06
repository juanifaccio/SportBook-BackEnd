-- CreateTable
CREATE TABLE `ReservaEquipamiento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cantidad` INTEGER NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `reservaId` INTEGER NOT NULL,
    `equipamientoId` INTEGER NOT NULL,

    UNIQUE INDEX `ReservaEquipamiento_reservaId_equipamientoId_key`(`reservaId`, `equipamientoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ReservaEquipamiento` ADD CONSTRAINT `ReservaEquipamiento_reservaId_fkey` FOREIGN KEY (`reservaId`) REFERENCES `Reserva`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReservaEquipamiento` ADD CONSTRAINT `ReservaEquipamiento_equipamientoId_fkey` FOREIGN KEY (`equipamientoId`) REFERENCES `Equipamiento`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
