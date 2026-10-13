import type { ICONOS } from '../../layout/menu';
import type { Usuario } from '../../sesion/tipos';

type Rol = Usuario['rol']['codigo'];

/** Un tema de la guía: qué es, cómo se hace paso a paso y un consejo */
export interface Tema {
  id: string;
  titulo: string;
  resumen: string;
  pasos: string[];
  consejo?: string;
  enlace?: { ruta: string; texto: string };
}

/** Una pantalla del recorrido de bienvenida */
export interface Diapositiva { icono: keyof typeof ICONOS; titulo: string; texto: string }

// ─────────────────────────── Para todos ───────────────────────────
export const GUIA_COMUN: Tema[] = [
  {
    id: 'ingreso', titulo: 'Entrar al CRM', resumen: 'Tu correo, tu contraseña y, en un equipo nuevo, un código que llega a tu correo.',
    pasos: [
      'Escribe tu correo de Growvia y tu contraseña.',
      'Si es la primera vez en esa computadora, te llega un código de 6 dígitos al correo. Escríbelo para entrar.',
      'Esa computadora queda como “equipo de confianza” por unos días: mientras tanto no te vuelve a pedir el código.',
      'Si te equivocas varias veces, el ingreso se bloquea un rato por seguridad.',
    ],
    consejo: 'Nunca compartas tu contraseña ni el código. Todo lo que se hace con tu usuario queda registrado a tu nombre.',
  },
  {
    id: 'celular', titulo: 'Usar el CRM desde el celular', resumen: 'Por seguridad, el CRM se usa en la computadora. Gerencia puede darte acceso desde el celular por unos días.',
    pasos: [
      'Si entras desde el celular, verás la pantalla para pedir acceso.',
      'Elige por cuántos días lo necesitas y envía la solicitud.',
      'Gerencia la aprueba o la rechaza. Te llega un aviso con la respuesta.',
      'Cuando vence el plazo, el celular sale del CRM solo. Puedes volver a pedirlo.',
    ],
  },
  {
    id: 'perfil', titulo: 'Tu perfil', resumen: 'Tu foto, tu contraseña, tus avisos y los equipos en los que entraste.',
    pasos: [
      'Abre “Perfil y ajustes” al final del menú.',
      'Contraseña: escribe la actual y la nueva (mínimo 10 caracteres, con letras y números). Al cambiarla, los demás equipos se cierran.',
      'Avisos: elige cuántos minutos antes de cada gestión agendada quieres el recordatorio y si quieres el resumen del día por correo.',
      'Foto: en “Mis datos” pulsa “Subir foto”. Se recorta en cuadrado sola y se ve en la barra de arriba.',
      'Equipos de confianza: si no reconoces alguno, quítalo.',
    ],
    enlace: { ruta: '/perfil', texto: 'Ir a mi perfil' },
  },
  {
    id: 'basico', titulo: 'Moverte por el CRM', resumen: 'Menú lateral, buscador, avisos y modo claro u oscuro.',
    pasos: [
      'El menú de la izquierda se abre al pasar el mouse. Con el primer botón lo dejas siempre abierto.',
      'El buscador de arriba encuentra cualquier empresa por RUC o razón social. Escribe al menos 3 letras o números.',
      'La campanita muestra tus avisos: gestiones del día, negociaciones en cierre, ventas ganadas y más.',
      'El sol y la luna cambian entre modo claro y oscuro.',
      'Si tu computadora va lenta, activa el “Modo ligero” en Perfil y ajustes → Apariencia.',
    ],
  },
  {
    id: 'datos', titulo: 'Cuidado de la información', resumen: 'La información de clientes se queda en el CRM.',
    pasos: [
      'Los contactos y la información comercial de cada empresa solo los ven el asesor a cargo, su supervisor, gerencia y back office.',
      'Nadie puede descargar ni exportar datos, salvo gerencia. Cada exportación queda registrada.',
      'Todas las acciones importantes quedan en la bitácora: quién, qué, cuándo y desde dónde.',
    ],
  },
];

// ─────────────────────────── Por rol ───────────────────────────
const ASESOR: Tema[] = [
  {
    id: 'inicio', titulo: 'Tu inicio', resumen: 'Lo primero que ves al entrar: tu día y tu avance.',
    pasos: [
      'Arriba ves tu avance de la meta del mes (cuenta cuando la venta se marca como ganada).',
      '“Agenda de hoy” son las gestiones que programaste para hoy.',
      '“Negociaciones abiertas” son las que todavía no cierras.',
    ],
    enlace: { ruta: '/inicio', texto: 'Ir a mi inicio' },
  },
  {
    id: 'empresas', titulo: 'Conseguir empresas', resumen: 'Toma empresas libres del repositorio o registra prospectos.',
    pasos: [
      'Repositorio: en “Mis empresas” abre la pestaña Repositorio. Las empresas libres se toman con un clic y quedan a tu cargo al instante.',
      'Nuevo prospecto: en “Mis empresas” pulsa “+ Nuevo prospecto”. Escribe el RUC: si ya existe, el CRM te avisa en rojo y te dice quién la tiene.',
      'Cada empresa tiene máximo 2 contactos (nombre, celular y correo).',
      'Las bases de empresas las cargan tu supervisor o gerencia: te llegan asignadas o al repositorio.',
    ],
    consejo: 'Si pasan muchos días sin registrar gestiones en una empresa (30 al inicio), vuelve sola al repositorio y otro asesor puede tomarla.',
    enlace: { ruta: '/empresas', texto: 'Ir a mis empresas' },
  },
  {
    id: 'gestiones', titulo: 'Registrar gestiones y agendar', resumen: 'Cada llamada, WhatsApp, correo o visita queda en la ficha de la empresa.',
    pasos: [
      'Entra a la ficha de la empresa y pulsa “Registrar gestión”.',
      'Elige el canal (llamada, WhatsApp, correo o visita) y el resultado.',
      'Si quedaste en volver a contactar, programa la próxima acción con fecha y hora: aparece en tu Agenda y te llega un recordatorio.',
      'Si no puedes cumplir una gestión agendada, reprográmala desde la Agenda.',
    ],
    enlace: { ruta: '/agenda', texto: 'Ir a mi agenda' },
  },
  {
    id: 'negociacion', titulo: 'Negociar una venta', resumen: 'Desde la ficha de la empresa abres la negociación con los servicios que ofreces.',
    pasos: [
      'En la ficha de la empresa pulsa “Nueva negociación”.',
      'Agrega cada servicio: línea nueva o portabilidad (con el operador de donde viene), con o sin equipo, cantidad y cargo sin IGV. El subtotal se calcula solo.',
      'La negociación empieza en la etapa “Negociación”. Registra cada conversación con el cliente como gestión: aparece en “Comentarios de la negociación”.',
      'Cuando el cliente acepta la oferta, pásala a “Cierre”. Todavía no es una venta ganada.',
      'Si el cliente no acepta, pulsa “Marcar como perdida” y elige el motivo.',
    ],
    consejo: 'Una empresa solo puede tener una negociación abierta a la vez. Todos los montos van sin IGV.',
    enlace: { ruta: '/negociaciones', texto: 'Ir a negociaciones' },
  },
  {
    id: 'ganar', titulo: 'Marcar la venta como ganada', resumen: 'Desde “Cierre”, cuando el expediente ya se envió a back office por correo.',
    pasos: [
      'Envía el expediente (contrato, DNI y, si hay portabilidad, la carta) a back office por correo. Los documentos no se suben al CRM.',
      'En la ficha de la negociación pulsa “Marcar como ganada” y confirma que el expediente ya se envió.',
      'La venta suma a tu meta en ese momento. Tu supervisor también puede marcarla como ganada.',
    ],
    enlace: { ruta: '/negociaciones', texto: 'Ir a negociaciones' },
  },
];

const SUPERVISOR: Tema[] = [
  {
    id: 'equipo', titulo: 'Tu equipo', resumen: 'Cómo va cada asesor y qué necesita tu atención.',
    pasos: [
      'En “Mi equipo” ves el avance del equipo contra la meta y el ranking de asesores.',
      '“Requieren atención” muestra lo que conviene revisar hoy.',
    ],
    enlace: { ruta: '/equipo', texto: 'Ir a mi equipo' },
  },
  {
    id: 'cierre-sup', titulo: 'Ventas en cierre', resumen: 'Negociaciones de tu equipo en las que el cliente ya aceptó.',
    pasos: [
      'En “Mi equipo”, “Requieren atención” te dice cuántas negociaciones están en cierre. También te llega un aviso.',
      'Cuando el expediente ya se envió a back office por correo, el asesor o tú la marcan como ganada desde la ficha de la negociación.',
      'En “Cambios de asesor” ves qué empresas de tu equipo pasaron de un asesor a otro.',
    ],
    enlace: { ruta: '/negociaciones', texto: 'Ir a negociaciones' },
  },
  {
    id: 'metas', titulo: 'Metas', resumen: 'Define la meta mensual de líneas de cada asesor.',
    pasos: ['En “Metas” elige el mes y escribe la meta de cada asesor.', 'El avance se mide con las ventas ganadas en el mes.'],
    enlace: { ruta: '/metas', texto: 'Ir a metas' },
  },
  {
    id: 'bases-sup', titulo: 'Bases de empresas', resumen: 'Sube bases de empresas para tu equipo.',
    pasos: [
      'En “Cargar base” sube un Excel con la plantilla y elige si las empresas van al repositorio o a un asesor de tu equipo.',
      'Revisa los errores que encuentra el CRM y aprueba la carga: recién ahí se guardan las empresas.',
    ],
    enlace: { ruta: '/bases', texto: 'Ir a bases' },
  },
  {
    id: 'embudo-sup', titulo: 'Embudo y pérdidas', resumen: 'En qué etapa se caen las negociaciones de tu equipo y por qué se pierden.',
    pasos: [
      'Elige el periodo y, si quieres, un asesor.',
      'Revisa la tasa de cierre, el ciclo de venta y los motivos de pérdida.',
      'Las negociaciones estancadas (sin movimiento hace más de 14 días) son las primeras que conviene revisar con cada asesor.',
    ],
    enlace: { ruta: '/embudo', texto: 'Ir al embudo' },
  },
];

const GERENTE: Tema[] = [
  {
    id: 'reportes', titulo: 'Reportes', resumen: 'El resumen general del mes: líneas activas, cargo fijo, metas, distritos, equipos y operadores.',
    pasos: ['Elige el mes con las flechas.', 'La venta cuenta en el mes en que se marca como ganada. Todos los montos son sin IGV.'],
    enlace: { ruta: '/reportes', texto: 'Ir a reportes' },
  },
  {
    id: 'embudo-ger', titulo: 'Embudo y pérdidas', resumen: 'Conversión por etapa, ciclo de venta, motivos de pérdida y negociaciones estancadas.',
    pasos: ['Filtra por periodo, equipo y asesor.', 'Usa “Por asesor” para ver quién convierte mejor y por qué pierde cada uno.'],
    enlace: { ruta: '/embudo', texto: 'Ir al embudo' },
  },
  {
    id: 'metas-ger', titulo: 'Metas', resumen: 'Define la meta de cada equipo y de cada asesor.',
    pasos: ['En “Metas” elige el mes y escribe las metas.'],
    enlace: { ruta: '/metas', texto: 'Ir a metas' },
  },
  {
    id: 'exportar', titulo: 'Exportar a Excel', resumen: 'Solo gerencia puede exportar. Cada descarga queda en la bitácora.',
    pasos: [
      'En “Exportar” elige el reporte: ventas, negociaciones, gestiones, metas o cartera.',
      'Elige el periodo (máximo 12 meses) y descarga.',
      'La cartera puede incluir contactos: úsalo solo cuando sea necesario.',
    ],
    enlace: { ruta: '/exportar', texto: 'Ir a exportar' },
  },
  {
    id: 'celular-ger', titulo: 'Acceso desde celular', resumen: 'Aprueba, rechaza o retira el acceso de alguien desde su celular.',
    pasos: [
      'En “Acceso celular” ves las solicitudes pendientes.',
      'Aprueba con fecha de fin (máximo 30 días) o rechaza con un motivo.',
      'Puedes retirar un acceso en cualquier momento o dar uno sin que lo pidan.',
    ],
    enlace: { ruta: '/accesos-celular', texto: 'Ir a acceso celular' },
  },
  {
    id: 'bitacora', titulo: 'Bitácora', resumen: 'Quién hizo qué, cuándo y desde dónde. No se puede modificar ni borrar.',
    pasos: ['Filtra por tipo de acción, usuario y fechas.', 'Las acciones sensibles (exportar, contraseñas incorrectas) se resaltan.'],
    enlace: { ruta: '/bitacora', texto: 'Ir a la bitácora' },
  },
  {
    id: 'reasignar', titulo: 'Reasignar empresas', resumen: 'Pasa una empresa de un asesor a otro.',
    pasos: ['Entra a la ficha de la empresa y pulsa “Reasignar”.', 'Elige el asesor y confirma. La negociación abierta, si hay, pasa con la empresa al nuevo asesor.'],
  },
];

const BACKOFFICE: Tema[] = [
  {
    id: 'ventas-bo', titulo: 'Ventas', resumen: 'Las ventas ganadas, para cruzarlas con los expedientes que llegan por correo.',
    pasos: [
      'En “Ventas” ves las ventas ganadas del mes (y puedes revisar las negociaciones en curso).',
      'Elige una venta para ver sus servicios, si van con equipo y el subtotal sin IGV.',
      'Los expedientes llegan por correo; el CRM no guarda documentos.',
    ],
    enlace: { ruta: '/negociaciones', texto: 'Ir a ventas' },
  },
  {
    id: 'empresas-bo', titulo: 'Mantener la base de clientes', resumen: 'Corrige razón social, ubicación y contactos.',
    pasos: ['Entra a la ficha de la empresa y usa “Corregir datos” o “Editar” en contactos.'],
  },
  {
    id: 'usuarios-bo', titulo: 'Crear usuarios', resumen: 'Crea cuentas de asesores y supervisores.',
    pasos: [
      'En “Usuarios” pulsa “Nuevo usuario”, completa los datos y elige rol y equipo.',
      'El CRM genera una contraseña temporal, la muestra y la envía por correo. Al entrar, la persona debe cambiarla.',
      'Para quien deja la empresa, usa “Desactivar” y elige a quién pasan sus empresas.',
    ],
    enlace: { ruta: '/usuarios', texto: 'Ir a usuarios' },
  },
];

const ADMIN: Tema[] = [
  {
    id: 'usuarios-adm', titulo: 'Usuarios y equipos', resumen: 'Crea, edita y desactiva usuarios; arma los equipos y su supervisor.',
    pasos: [
      'Usuarios: crea la cuenta con su rol y equipo. Se envía una contraseña temporal por correo.',
      'Si cambias el rol o el equipo de alguien, tendrá que volver a iniciar sesión.',
      'Equipos: crea equipos y asigna un supervisor (un supervisor dirige un solo equipo).',
    ],
    enlace: { ruta: '/usuarios', texto: 'Ir a administración' },
  },
  {
    id: 'sistema', titulo: 'Planes, operadores y parámetros', resumen: 'Ajusta el CRM sin tocar código.',
    pasos: [
      'Planes y operadores: agrega, edita o desactiva. Las ventas anteriores conservan sus datos.',
      'Parámetros: días para liberar empresas, avisos y más. Cada cambio queda en la bitácora.',
    ],
  },
  {
    id: 'bitacora-adm', titulo: 'Bitácora', resumen: 'Revisa ingresos, accesos denegados y cambios de administración.',
    pasos: ['Filtra por tipo de acción, usuario y fechas.'],
    enlace: { ruta: '/bitacora', texto: 'Ir a la bitácora' },
  },
];

export const GUIA_POR_ROL: Record<Rol, Tema[]> = { ASESOR, SUPERVISOR, GERENTE, BACKOFFICE, ADMIN };

// ─────────────────────────── Recorrido de bienvenida ───────────────────────────
const FINAL: Diapositiva = {
  icono: 'ayuda', titulo: '¿Dudas? Aquí está la guía',
  texto: 'En “Ayuda”, al final del menú, encuentras cómo hacer cada cosa paso a paso. Puedes volver a ver este recorrido cuando quieras.',
};
const BUSCADOR: Diapositiva = {
  icono: 'campana', titulo: 'Buscador y avisos',
  texto: 'Arriba puedes buscar cualquier empresa por RUC o razón social. La campanita te avisa lo importante: gestiones del día, negociaciones en cierre y ventas ganadas.',
};

export const RECORRIDO_POR_ROL: Record<Rol, Diapositiva[]> = {
  ASESOR: [
    { icono: 'inicio', titulo: 'Bienvenido/a al CRM de Growvia', texto: 'Aquí vas a llevar tus empresas, gestiones y ventas. En tu inicio ves tu agenda del día y cómo vas con tu meta.' },
    { icono: 'empresas', titulo: 'Tus empresas', texto: 'Toma empresas libres del repositorio o registra tus prospectos. Registra cada gestión: si una empresa pasa muchos días sin gestión, vuelve al repositorio.' },
    { icono: 'negociaciones', titulo: 'Negocia y cierra', texto: 'Abre la negociación desde la ficha de la empresa con sus servicios (sin IGV). Cuando el cliente acepte, pásala a “Cierre”.' },
    { icono: 'validar', titulo: 'Venta ganada', texto: 'Envía el expediente a back office por correo y, desde “Cierre”, márcala como ganada. En ese momento suma a tu meta.' },
    BUSCADOR, FINAL,
  ],
  SUPERVISOR: [
    { icono: 'equipo', titulo: 'Bienvenido/a, supervisor', texto: 'En “Mi equipo” ves el avance de tus asesores contra la meta y lo que necesita tu atención hoy.' },
    { icono: 'validar', titulo: 'Ventas en cierre', texto: 'Te avisamos cuando un asesor pasa una negociación a cierre. Con el expediente ya enviado por correo, tú o el asesor la marcan como ganada.' },
    { icono: 'metas', titulo: 'Metas y bases', texto: 'Define la meta mensual de cada asesor y carga las bases de empresas de tu equipo.' },
    { icono: 'embudo', titulo: 'Embudo y pérdidas', texto: 'Mira en qué etapa se caen las negociaciones de tu equipo, por qué se pierden y cuáles están estancadas.' },
    BUSCADOR, FINAL,
  ],
  GERENTE: [
    { icono: 'reportes', titulo: 'Bienvenido/a, gerencia', texto: 'En “Reportes” tienes el resumen del mes: líneas activas, cargo fijo, metas, distritos y equipos.' },
    { icono: 'embudo', titulo: 'Embudo y pérdidas', texto: 'Conversión de negociación a cierre y a venta, motivos de pérdida y negociaciones estancadas.' },
    { icono: 'exportar', titulo: 'Solo tú exportas', texto: 'Eres el único rol que puede exportar a Excel. Cada descarga queda registrada en la bitácora.' },
    { icono: 'celular', titulo: 'Acceso desde celular', texto: 'Por seguridad el CRM se usa en computadora. Tú apruebas el acceso desde celular, con fecha de fin.' },
    BUSCADOR, FINAL,
  ],
  BACKOFFICE: [
    { icono: 'negociaciones', titulo: 'Bienvenido/a, back office', texto: 'En “Ventas” ves las ventas ganadas, con sus servicios y si van con equipo. Los expedientes te llegan por correo.' },
    { icono: 'usuarios', titulo: 'Usuarios y empresas', texto: 'Crea las cuentas de asesores y supervisores, y mantén al día los datos de las empresas.' },
    BUSCADOR, FINAL,
  ],
  ADMIN: [
    { icono: 'admin', titulo: 'Bienvenido/a, administración', texto: 'Desde “Administración” manejas usuarios, equipos, planes, operadores y parámetros del CRM.' },
    { icono: 'bitacora', titulo: 'Bitácora', texto: 'Revisa ingresos, accesos denegados y cada cambio de configuración.' },
    FINAL,
  ],
};