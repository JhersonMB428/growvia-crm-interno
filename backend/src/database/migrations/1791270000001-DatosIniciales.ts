import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Datos iniciales: roles, permisos (matriz acordada el 05/10), parámetros,
 * los 2 equipos y 1 usuario de prueba por rol.
 * Contraseña temporal de los usuarios de prueba: Growvia2026!
 */
export class DatosIniciales1791270000001 implements MigrationInterface {
  name = 'DatosIniciales1791270000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- ===== Roles =====
      INSERT INTO roles (codigo, nombre) VALUES
        ('ASESOR',     'Asesor'),
        ('SUPERVISOR', 'Supervisor'),
        ('GERENTE',    'Gerente de ventas'),
        ('BACKOFFICE', 'Back office'),
        ('ADMIN',      'Administrador del sistema');

      -- ===== Permisos =====
      INSERT INTO permisos (codigo, modulo, descripcion) VALUES
        ('REPOSITORIO_VER',       'empresas',   'Ver el repositorio (datos generales)'),
        ('EMPRESA_TOMAR',         'empresas',   'Tomar una empresa libre del repositorio'),
        ('PROSPECTO_CREAR',       'empresas',   'Crear prospecto'),
        ('BASE_CARGAR',           'empresas',   'Cargar bases de empresas'),
        ('BASE_APROBAR',          'empresas',   'Aprobar cargas de los asesores'),
        ('INFO_COMERCIAL_VER',    'empresas',   'Ver contactos e información comercial (según alcance)'),
        ('DATOS_EXPORTAR',        'seguridad',  'Exportar o descargar datos (regla fija: solo gerencia)'),
        ('NEGOCIACION_GESTIONAR', 'ventas',     'Crear negociaciones y moverlas de etapa'),
        ('VENTA_APROBAR',         'ventas',     'Aprobar u observar ventas de su equipo (paso 1)'),
        ('VENTA_REVISAR',         'ventas',     'Revisar, observar o detener ventas (paso 2)'),
        ('VENTA_VALIDAR',         'ventas',     'Validar ventas y registrar posventa (paso 3)'),
        ('MONTOS_VER',            'ventas',     'Ver montos y comparativas'),
        ('USUARIO_CREAR',         'usuarios',   'Crear cuentas de usuario'),
        ('EQUIPO_ARMAR',          'usuarios',   'Armar su equipo (asignar asesores)'),
        ('EMPRESA_REASIGNAR',     'usuarios',   'Reasignar empresas'),
        ('ACCESO_MOVIL_APROBAR',  'usuarios',   'Aprobar o revocar acceso desde celular'),
        ('META_DEFINIR',          'metas',      'Definir metas mensuales'),
        ('REPORTE_VER',           'reportes',   'Ver reportes (según alcance)'),
        ('SISTEMA_CONFIGURAR',    'sistema',    'Configurar plazos, pasos de validación, planes y operadores'),
        ('ROLES_EDITAR',          'sistema',    'Editar roles y permisos');

      -- ===== Matriz rol → permisos =====
      INSERT INTO rol_permisos (rol_id, permiso_id)
      SELECT r.id, p.id
      FROM (VALUES
        ('ASESOR','REPOSITORIO_VER'), ('ASESOR','EMPRESA_TOMAR'), ('ASESOR','PROSPECTO_CREAR'),
        ('ASESOR','BASE_CARGAR'), ('ASESOR','INFO_COMERCIAL_VER'), ('ASESOR','NEGOCIACION_GESTIONAR'),

        ('SUPERVISOR','REPOSITORIO_VER'), ('SUPERVISOR','EMPRESA_TOMAR'), ('SUPERVISOR','PROSPECTO_CREAR'),
        ('SUPERVISOR','BASE_CARGAR'), ('SUPERVISOR','BASE_APROBAR'), ('SUPERVISOR','INFO_COMERCIAL_VER'),
        ('SUPERVISOR','VENTA_APROBAR'), ('SUPERVISOR','MONTOS_VER'), ('SUPERVISOR','EQUIPO_ARMAR'),
        ('SUPERVISOR','META_DEFINIR'), ('SUPERVISOR','REPORTE_VER'),

        ('GERENTE','REPOSITORIO_VER'), ('GERENTE','BASE_CARGAR'), ('GERENTE','BASE_APROBAR'),
        ('GERENTE','INFO_COMERCIAL_VER'), ('GERENTE','DATOS_EXPORTAR'), ('GERENTE','VENTA_REVISAR'),
        ('GERENTE','MONTOS_VER'), ('GERENTE','EMPRESA_REASIGNAR'), ('GERENTE','ACCESO_MOVIL_APROBAR'),
        ('GERENTE','META_DEFINIR'), ('GERENTE','REPORTE_VER'),

        ('BACKOFFICE','REPOSITORIO_VER'), ('BACKOFFICE','INFO_COMERCIAL_VER'), ('BACKOFFICE','VENTA_VALIDAR'),
        ('BACKOFFICE','MONTOS_VER'), ('BACKOFFICE','USUARIO_CREAR'), ('BACKOFFICE','REPORTE_VER'),

        ('ADMIN','REPOSITORIO_VER'), ('ADMIN','INFO_COMERCIAL_VER'), ('ADMIN','USUARIO_CREAR'),
        ('ADMIN','EQUIPO_ARMAR'), ('ADMIN','EMPRESA_REASIGNAR'), ('ADMIN','REPORTE_VER'),
        ('ADMIN','SISTEMA_CONFIGURAR'), ('ADMIN','ROLES_EDITAR')
      ) AS m(rol, permiso)
      JOIN roles r ON r.codigo = m.rol
      JOIN permisos p ON p.codigo = m.permiso;

      -- ===== Parámetros =====
      INSERT INTO parametros (clave, valor, descripcion) VALUES
        ('dias_liberacion_inactividad',  '30',    'Días sin gestión para que una empresa vuelva al repositorio'),
        ('dias_aviso_liberacion',        '3',     'Días de anticipación para avisar que una empresa volverá al repositorio'),
        ('limite_toma_repositorio',      '0',     'Empresas que un asesor puede tomar del repositorio (0 = sin límite)'),
        ('max_correcciones_venta',       '3',     'Veces que una venta observada se puede corregir'),
        ('dias_max_acceso_movil',        '30',    'Plazo máximo que gerencia puede aprobar para usar el celular'),
        ('hora_resumen_diario',          '08:00', 'Hora del aviso con las gestiones del día'),
        ('minutos_recordatorio_defecto', '30',    'Minutos antes de cada gestión para el recordatorio'),
        ('dias_dispositivo_confiable',   '7',     'Días que un equipo queda verificado antes de volver a pedir código'),
        ('minutos_validez_codigo',       '10',    'Minutos de vigencia del código enviado al correo'),
        ('max_intentos_codigo',          '5',     'Intentos permitidos para ingresar el código');

      -- ===== Usuarios de prueba (contraseña temporal: Growvia2026!) =====
      INSERT INTO usuarios (nombres, apellidos, email, password_hash, rol_id)
      SELECT u.nombres, u.apellidos, u.email,
             '$2b$10$BRljbSOZFqR1pvrdsRoz.e0pU3RKnaNd9lk7m7cs1KEmfk.H.e22a', r.id
      FROM (VALUES
        ('María',  'Ríos',     'mrios@growvia.global',    'ASESOR'),
        ('Carlos', 'Mendoza',  'cmendoza@growvia.global', 'SUPERVISOR'),
        ('Lucía',  'Herrera',  'lherrera@growvia.global', 'GERENTE'),
        ('Rosa',   'Paredes',  'rparedes@growvia.global', 'BACKOFFICE'),
        ('Admin',  'Sistemas', 'admin@growvia.global',    'ADMIN')
      ) AS u(nombres, apellidos, email, rol)
      JOIN roles r ON r.codigo = u.rol;

      -- ===== Equipos =====
      INSERT INTO equipos (nombre, supervisor_id)
      VALUES ('Equipo 1', (SELECT id FROM usuarios WHERE email = 'cmendoza@growvia.global')),
             ('Equipo 2', NULL);

      UPDATE usuarios SET equipo_id = (SELECT id FROM equipos WHERE nombre = 'Equipo 1')
      WHERE email IN ('mrios@growvia.global', 'cmendoza@growvia.global');
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE usuarios SET equipo_id = NULL;
      DELETE FROM equipos;
      DELETE FROM usuarios WHERE email IN ('mrios@growvia.global','cmendoza@growvia.global',
        'lherrera@growvia.global','rparedes@growvia.global','admin@growvia.global');
      DELETE FROM parametros;
      DELETE FROM rol_permisos;
      DELETE FROM permisos;
      DELETE FROM roles;
    `);
  }
}
