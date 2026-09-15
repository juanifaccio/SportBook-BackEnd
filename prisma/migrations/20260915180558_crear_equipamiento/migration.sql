-- CreateTable
CREATE TABLE `Equipamiento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `descripcion` VARCHAR(191) NOT NULL,
    `precio` DECIMAL(10, 2) NOT NULL,
    `stock` INTEGER NOT NULL,

    UNIQUE INDEX `Equipamiento_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
