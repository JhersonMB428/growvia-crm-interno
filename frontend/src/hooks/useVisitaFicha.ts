import { useEffect } from 'react';
import { empresasApi } from '../api/empresas';

/**
 * Mide cuánto tiempo el asesor a cargo tiene abierta la ficha de la empresa.
 * Manda un pulso cada 20 s mientras la pestaña está visible; el servidor suma el tiempo.
 * Si la pestaña está oculta no se manda nada, así ese tiempo no cuenta.
 */
export function useVisitaFicha(empresaId: string, activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    let visita: string | null = null;
    let cancelado = false;
    const pulso = () => {
      if (visita && document.visibilityState === 'visible') empresasApi.pulsoVisita(visita).catch(() => undefined);
    };
    empresasApi.iniciarVisita(empresaId).then((r) => { if (!cancelado) visita = r.id; }).catch(() => undefined);
    const t = window.setInterval(pulso, 20_000);
    // Al volver a la pestaña, el siguiente pulso no cuenta el tiempo oculto (el servidor pone un tope de 40 s)
    return () => { cancelado = true; window.clearInterval(t); pulso(); };
  }, [empresaId, activo]);
}
