/** "TRANSPORTES ANDINOS" → "Transportes Andinos" */
export const nombrePropio = (t: string) => t.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

/** Estado y condición de SUNAT como llegan en la base ("ACTIVO", "HABIDO") → "Activo · Habido" */
export const textoSunat = (estado?: string | null, condicion?: string | null) =>
  [estado, condicion].filter(Boolean).map((t) => nombrePropio(t!)).join(' · ');
