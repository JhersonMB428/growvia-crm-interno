import type { Usuario } from '../sesion/tipos';

type Rol = Usuario['rol']['codigo'];

export interface ItemMenu {
  ruta: string;
  etiqueta: string;
  icono: keyof typeof ICONOS;
}

/** Trazos de los íconos (24×24) */
export const ICONOS = {
  inicio: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  empresas: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1',
  negociaciones: 'M3 4h18l-7 8v6l-4 2v-8z',
  agenda: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  base: 'M12 3v12M7 8l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  validar: 'M9 12l2 2 4-4M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18',
  equipo: 'M9 4.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7M2.5 20c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.2.6 3.5 2.9 3.5 6',
  metas: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18M12 7a5 5 0 1 1 0 10a5 5 0 1 1 0-10M12 11a1 1 0 1 1 0 2a1 1 0 1 1 0-2',
  reportes: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  admin: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  usuarios: 'M9 4.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7M2.5 20c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6M19 8v6M16 11h6',
  celular: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2',
  perfil: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5a2 2 0 1 1 0 4a2 2 0 1 1 0-4M10 15a2 2 0 1 1 0 4a2 2 0 1 1 0-4',
  salir: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  fijar: 'M4 4v16M10 7l5 5-5 5M15 12H8',
  buscar: 'M11 4a7 7 0 1 1 0 14a7 7 0 1 1 0-14M20 20l-3.5-3.5',
  campana: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  sol: 'M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  luna: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  exportar: 'M12 3v12M7 10l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  bitacora: 'M9 3h6v3H9zM7 4.5H5V21h14V4.5h-2M8.5 11h7M8.5 15h7M8.5 19h4',
  renovar: 'M20 11a8 8 0 0 0-14.9-4M4 3v4h4M4 13a8 8 0 0 0 14.9 4M20 21v-4h-4',
  embudo: 'M3 4h18M6 9h12M9 14h6M11 19h2',
  ayuda: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01',
} as const;

const I = (ruta: string, etiqueta: string, icono: ItemMenu['icono']): ItemMenu => ({ ruta, etiqueta, icono });

/** Menú lateral de cada rol (según la matriz acordada en la reunión del 05/10) */
export const MENU_POR_ROL: Record<Rol, ItemMenu[]> = {
  ASESOR: [
    I('/inicio', 'Inicio', 'inicio'),
    I('/empresas', 'Mis empresas', 'empresas'),
    I('/negociaciones', 'Negociaciones', 'negociaciones'),
    I('/renovaciones', 'Renovaciones', 'renovar'),
    I('/agenda', 'Agenda', 'agenda'),
    I('/bases', 'Cargar base', 'base'),
  ],
  SUPERVISOR: [
    I('/equipo', 'Mi equipo', 'equipo'),
    I('/aprobaciones', 'Aprobaciones', 'validar'),
    I('/embudo', 'Embudo y pérdidas', 'embudo'),
    I('/metas', 'Metas', 'metas'),
    I('/repositorio', 'Empresas', 'empresas'),
    I('/negociaciones', 'Negociaciones', 'negociaciones'),
    I('/renovaciones', 'Renovaciones', 'renovar'),
    I('/bases', 'Cargar base', 'base'),
  ],
  GERENTE: [
    I('/reportes', 'Reportes', 'reportes'),
    I('/embudo', 'Embudo y pérdidas', 'embudo'),
    I('/revision', 'Revisión de ventas', 'validar'),
    I('/metas', 'Metas', 'metas'),
    I('/repositorio', 'Empresas', 'empresas'),
    I('/negociaciones', 'Negociaciones', 'negociaciones'),
    I('/renovaciones', 'Renovaciones', 'renovar'),
    I('/bases', 'Cargar base', 'base'),
    I('/exportar', 'Exportar', 'exportar'),
    I('/bitacora', 'Bitácora', 'bitacora'),
    I('/accesos-celular', 'Acceso celular', 'celular'),
  ],
  BACKOFFICE: [
    I('/resumen', 'Resumen', 'inicio'),
    I('/validacion', 'Validar ventas', 'validar'),
    I('/repositorio', 'Empresas', 'empresas'),
    I('/usuarios', 'Usuarios', 'usuarios'),
  ],
  ADMIN: [
    I('/usuarios', 'Administración', 'admin'),
    I('/repositorio', 'Empresas', 'empresas'),
    I('/bitacora', 'Bitácora', 'bitacora'),
  ],
};

/** Pantalla de inicio de cada rol (a donde va después del login) */
export const INICIO_POR_ROL: Record<Rol, string> = {
  ASESOR: '/inicio',
  SUPERVISOR: '/equipo',
  GERENTE: '/reportes',
  BACKOFFICE: '/resumen',
  ADMIN: '/usuarios',
};