/**
 * Diseño de los correos del CRM con la marca Growvia.
 * HTML con tablas y estilos en línea: es lo único que respetan Outlook, Gmail y los celulares.
 * Colores de la guía de marca: verde #013936, lima #C7E196, crema #F7EFD1.
 */

export interface DatosCorreo {
  /** Texto corto que se ve en la bandeja antes de abrir el correo */
  resumen: string;
  titulo: string;
  /** "Hola María:" */
  saludo?: string;
  parrafos?: string[];
  /** Dato grande al centro: código, contraseña temporal… */
  destacado?: { etiqueta: string; valor: string; nota?: string };
  /** Lista de filas (por ejemplo, las gestiones del día) */
  lista?: { principal: string; detalle?: string }[];
  boton?: { texto: string; url: string };
  /** Recuadro de seguridad al final */
  aviso?: string;
}

const VERDE = '#013936';
const LIMA = '#C7E196';
const CREMA = '#F7EFD1';
const TEXTO = '#1d2b29';
const SUAVE = '#5b6b68';
const FUENTE = `'Darker Grotesque', 'Segoe UI', Arial, sans-serif`;
const FUENTE_TITULO = `Alata, 'Segoe UI', Arial, sans-serif`;

/** Evita que un nombre o razón social con < o & rompa el correo */
export const escapar = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Dirección pública del CRM (para el logo y los botones) */
export const urlCrm = () => (process.env.FRONTEND_URL ?? 'https://crm.growvia.global').replace(/\/$/, '');

export function plantillaCorreo(d: DatosCorreo): string {
  const base = urlCrm();
  const parrafos = (d.parrafos ?? [])
    .map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:${TEXTO}">${p}</p>`).join('');

  const destacado = d.destacado ? `
    <tr><td style="padding:6px 32px 18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREMA};border-radius:16px">
        <tr><td align="center" style="padding:22px 16px">
          <div style="font-family:${FUENTE};font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${SUAVE}">${d.destacado.etiqueta}</div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:36px;font-weight:700;letter-spacing:10px;color:${VERDE};padding:10px 0 4px">${d.destacado.valor}</div>
          ${d.destacado.nota ? `<div style="font-family:${FUENTE};font-size:14px;color:${SUAVE}">${d.destacado.nota}</div>` : ''}
        </td></tr>
      </table>
    </td></tr>` : '';

  const lista = d.lista?.length ? `
    <tr><td style="padding:0 32px 18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${d.lista.map((l) => `
        <tr><td style="padding:12px 16px;border-left:4px solid ${LIMA};background:#f6f8f3;border-radius:8px">
          <div style="font-family:${FUENTE};font-size:16px;font-weight:700;color:${TEXTO}">${l.principal}</div>
          ${l.detalle ? `<div style="font-family:${FUENTE};font-size:14px;color:${SUAVE};padding-top:2px">${l.detalle}</div>` : ''}
        </td></tr><tr><td style="height:8px;line-height:8px;font-size:0">&nbsp;</td></tr>`).join('')}
      </table>
    </td></tr>` : '';

  const boton = d.boton ? `
    <tr><td align="center" style="padding:4px 32px 24px">
      <a href="${d.boton.url}" style="display:inline-block;background:${VERDE};color:${LIMA};font-family:${FUENTE};font-size:16px;font-weight:700;text-decoration:none;padding:14px 30px;border-radius:999px">${d.boton.texto}</a>
    </td></tr>` : '';

  const aviso = d.aviso ? `
    <tr><td style="padding:0 32px 26px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3e8dc;border-radius:12px">
        <tr><td style="padding:12px 16px;font-family:${FUENTE};font-size:14px;line-height:1.5;color:${SUAVE}">🔒 ${d.aviso}</td></tr>
      </table>
    </td></tr>` : '';

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${d.titulo}</title></head>
<body style="margin:0;padding:0;background:#eef1ea">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${d.resumen}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1ea">
  <tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:22px;overflow:hidden">
      <tr><td style="background:${VERDE};padding:26px 32px 22px">
        <img src="${base}/img/logo-growvia-correo.png" width="150" alt="Growvia" style="display:block;border:0;width:150px;height:auto;color:${LIMA};font-family:${FUENTE_TITULO};font-size:26px">
      </td></tr>
      <tr><td style="background:${VERDE};padding:0 32px 26px">
        <div style="font-family:${FUENTE_TITULO};font-size:24px;line-height:1.25;color:${CREMA}">${d.titulo}</div>
      </td></tr>
      <tr><td style="height:6px;line-height:6px;font-size:0;background:${LIMA}">&nbsp;</td></tr>
      <tr><td style="padding:28px 32px 6px;font-family:${FUENTE}">
        ${d.saludo ? `<p style="margin:0 0 14px;font-size:17px;font-weight:700;color:${TEXTO}">${d.saludo}</p>` : ''}
        ${parrafos}
      </td></tr>
      ${destacado}${lista}${boton}${aviso}
      <tr><td style="background:#f6f8f3;padding:18px 32px;font-family:${FUENTE};font-size:13px;line-height:1.5;color:${SUAVE}">
        CRM interno de Growvia · <a href="${base}" style="color:${VERDE};font-weight:700;text-decoration:none">${base.replace(/^https?:\/\//, '')}</a><br>
        Este es un correo automático: no respondas a este mensaje.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
