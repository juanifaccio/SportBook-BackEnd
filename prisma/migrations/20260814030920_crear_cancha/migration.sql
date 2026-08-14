-- CreateTable
CREATE TABLE `Cancha` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `precioPorHora` DECIMAL(10, 2) NOT NULL,
    `estado` ENUM('DISPONIBLE', 'MANTENIMIENTO') NOT NULL,
    `tipoCanchaId` INTEGER NOT NULL,

    UNIQUE INDEX `Cancha_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Cancha` ADD CONSTRAINT `Cancha_tipoCanchaId_fkey` FOREIGN KEY (`tipoCanchaId`) REFERENCES `TipoCancha`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
