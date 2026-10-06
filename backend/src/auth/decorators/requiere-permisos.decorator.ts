import { SetMetadata } from '@nestjs/common';

export const PERMISOS_REQUERIDOS = 'permisosRequeridos';

/** Ej.: @RequierePermisos('VENTA_APROBAR') — el usuario debe tener todos los permisos indicados */
export const RequierePermisos = (...permisos: string[]) => SetMetadata(PERMISOS_REQUERIDOS, permisos);
