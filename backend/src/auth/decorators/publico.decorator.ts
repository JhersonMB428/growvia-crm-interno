import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICO = 'esPublico';

/** Marca una ruta que no necesita sesión (login, salud…) */
export const Publico = () => SetMetadata(ES_PUBLICO, true);
