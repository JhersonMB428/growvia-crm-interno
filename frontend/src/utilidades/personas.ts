import type { Contacto, EmpresaDetalle, Medio } from '../api/empresas';

/** Qué es cada persona para la empresa */
export function etiquetaPersona(c: Contacto) {
  if (c.posicion === 1) return 'Representante legal';
  if (c.posicion === 2) return 'Otro contacto';
  return c.cargo || 'Persona de contacto';
}

export const telefonoLegible = (t: string) => (t.length === 9 && !t.includes('@') ? t.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : t);

/** Con quién y a qué número o correo es la gestión */
export interface Objetivo { contactoId: string; medio: string }

const ORDEN_ESTADO: Record<string, number> = { FUNCIONA: 0, SIN_PROBAR: 1, NO_CONTESTA: 2, EQUIVOCADO: 3, NO_EXISTE: 4 };

/** Por defecto: quien decide la compra (o el representante) y el número que mejor ha funcionado */
export function objetivoInicial(e: EmpresaDetalle): Objetivo {
  const personas = e.contactos ?? [];
  const persona = personas.find((c) => c.decisor) ?? personas.find((c) => c.posicion === 1) ?? personas[0];
  return { contactoId: persona?.id ?? '', medio: medioSugerido(e, persona) };
}

export function medioSugerido(e: EmpresaDetalle, persona?: Contacto) {
  if (persona?.celular) return persona.celular;
  const telefonos = (e.medios ?? []).filter((m) => m.tipo === 'TELEFONO').sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]);
  return telefonos.find((m) => m.estado === 'FUNCIONA' || m.estado === 'SIN_PROBAR')?.valor ?? telefonos[0]?.valor ?? '';
}

const TEXTO_ESTADO: Record<string, string> = {
  FUNCIONA: 'funciona', SIN_PROBAR: 'sin probar', NO_CONTESTA: 'no contesta', EQUIVOCADO: 'equivocado', NO_EXISTE: 'no existe',
};

/** Números y correos para elegir: primero los de la persona, luego los de la empresa (los que funcionan arriba) */
export function opcionesMedio(personas: Contacto[], medios: Medio[], contactoId: string) {
  const persona = personas.find((c) => c.id === contactoId);
  const opciones: { valor: string; texto: string }[] = [];
  const agregar = (valor: string | null | undefined, texto: string) => {
    if (valor && !opciones.some((o) => o.valor === valor)) opciones.push({ valor, texto });
  };
  const estadoDe = (v: string) => medios.find((m) => m.valor === v)?.estado;
  if (persona?.celular) agregar(persona.celular, `${telefonoLegible(persona.celular)} · de ${persona.nombre.split(' ')[0]}${estadoDe(persona.celular) ? ` · ${TEXTO_ESTADO[estadoDe(persona.celular)!]}` : ''}`);
  [...medios].sort((a, b) => (a.tipo === b.tipo ? ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] : a.tipo === 'TELEFONO' ? -1 : 1))
    .forEach((m) => agregar(m.valor, `${telefonoLegible(m.valor)} · ${TEXTO_ESTADO[m.estado]}`));
  if (persona?.correo) agregar(persona.correo, `${persona.correo} · de ${persona.nombre.split(' ')[0]}`);
  return opciones;
}
