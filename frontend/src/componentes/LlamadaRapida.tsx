import { useEffect, useState } from 'react';
import { ErrorApi } from '../api/cliente';
import { empresasApi, fechaHoraPlazo, plazo, type EmpresaDetalle } from '../api/empresas';
import { gestionesApi, type GestionRegistrada, type ResultadoGestion } from '../api/gestiones';
import './llamada.css';

interface Props {
  empresa: EmpresaDetalle;
  /** "Interesado" y "Volver a llamar" necesitan comentario y fecha: se completan en el formulario de gestiones */
  onPreseleccion: (r: ResultadoGestion) => void;
  onRegistrada: (g: GestionRegistrada) => void;
  onMantenida: (retencionHasta: string) => void;
  onLiberada: () => void;
}

/**
 * Arriba de la ficha, para el asesor a cargo: el resultado de la llamada con un clic,
 * cuánto falta para que la empresa vuelva al repositorio, "Mantener 24 h más" y "Liberar".
 */
export function LlamadaRapida({ empresa, onPreseleccion, onRegistrada, onMantenida, onLiberada }: Props) {
  const [ocupado, setOcupado] = useState<'' | 'NO_CONTESTA' | 'RECHAZA' | 'mantener' | 'liberar'>('');
  const [confirmar, setConfirmar] = useState<'' | 'RECHAZA' | 'liberar'>('');
  const [error, setError] = useState('');
  // Refresca la cuenta regresiva cada minuto
  const [, setTic] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTic((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const p = plazo(empresa.retencionHasta);

  async function rapida(resultado: 'NO_CONTESTA' | 'RECHAZA') {
    setOcupado(resultado); setError(''); setConfirmar('');
    try { onRegistrada(await gestionesApi.crear({ clienteId: empresa.id, canal: 'LLAMADA', resultado })); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo registrar la llamada'); }
    finally { setOcupado(''); }
  }

  async function mantener() {
    setOcupado('mantener'); setError('');
    try { onMantenida((await empresasApi.mantener(empresa.id)).retencionHasta); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo mantener la empresa'); }
    finally { setOcupado(''); }
  }

  async function liberar() {
    setOcupado('liberar'); setError(''); setConfirmar('');
    try { await empresasApi.liberar(empresa.id); onLiberada(); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo liberar la empresa'); setOcupado(''); }
  }

  return (
    <section className="panel vidrio llamada" aria-labelledby="llamada-titulo">
      <div className="llamada__cabecera">
        <div>
          <h2 id="llamada-titulo" className="h2">¿Cómo te fue con la llamada?</h2>
          <p className="llamada__ayuda">Un clic registra el resultado. Para interesado o volver a llamar, completa el comentario y la fecha abajo.</p>
        </div>
        {p && empresa.retencionHasta && (
          <div className={`plazo plazo--${p.nivel}`} role="status">
            <b>{p.texto}</b>
            <span>hasta el {fechaHoraPlazo(empresa.retencionHasta)}</span>
          </div>
        )}
      </div>

      <div className="llamada__botones">
        <button type="button" className="llamada__opcion" disabled={!!ocupado} onClick={() => rapida('NO_CONTESTA')}>
          <span className="llamada__icono" aria-hidden>✆</span>
          <b>{ocupado === 'NO_CONTESTA' ? 'Registrando…' : 'No contestó'}</b>
          <small>Se registra al instante</small>
        </button>
        <button type="button" className="llamada__opcion llamada__opcion--buena" disabled={!!ocupado} onClick={() => onPreseleccion('INTERESADO')}>
          <span className="llamada__icono" aria-hidden>✓</span>
          <b>Contestó · interesado</b>
          <small>Agenda el siguiente paso</small>
        </button>
        <button type="button" className="llamada__opcion" disabled={!!ocupado} onClick={() => onPreseleccion('VOLVER_A_LLAMAR')}>
          <span className="llamada__icono" aria-hidden>↻</span>
          <b>Contestó · volver a llamar</b>
          <small>Elige cuándo</small>
        </button>
        <button type="button" className="llamada__opcion llamada__opcion--mala" disabled={!!ocupado}
          aria-expanded={confirmar === 'RECHAZA'} onClick={() => setConfirmar(confirmar === 'RECHAZA' ? '' : 'RECHAZA')}>
          <span className="llamada__icono" aria-hidden>✕</span>
          <b>{ocupado === 'RECHAZA' ? 'Registrando…' : 'Contestó · no interesado'}</b>
          <small>La empresa se libera</small>
        </button>
      </div>

      {confirmar === 'RECHAZA' && (
        <div className="llamada__confirmar" role="alertdialog" aria-label="Confirmar no interesado">
          <span>La empresa vuelve al repositorio y nadie podrá tomarla por un tiempo, para no volver a llamarla. ¿Confirmas?</span>
          <div className="fila-acciones">
            <button type="button" className="boton-secundario" onClick={() => setConfirmar('')}>Cancelar</button>
            <button type="button" className="boton" onClick={() => rapida('RECHAZA')}>Sí, no está interesado</button>
          </div>
        </div>
      )}
      {confirmar === 'liberar' && (
        <div className="llamada__confirmar" role="alertdialog" aria-label="Confirmar liberar">
          <span>La empresa vuelve al repositorio y cualquier asesor podrá tomarla. Si tiene una negociación abierta, se cierra como perdida.</span>
          <div className="fila-acciones">
            <button type="button" className="boton-secundario" onClick={() => setConfirmar('')}>Cancelar</button>
            <button type="button" className="boton" onClick={liberar}>{ocupado === 'liberar' ? 'Liberando…' : 'Sí, liberar'}</button>
          </div>
        </div>
      )}
      {error && <div className="alerta" role="alert">{error}</div>}

      {empresa.retencionHasta && (
        <div className="llamada__pie">
          <span>Si no registras una gestión antes del plazo, la empresa vuelve sola al repositorio.</span>
          <div className="fila-acciones">
            <button type="button" className="boton-secundario" disabled={!!ocupado || empresa.prorrogada}
              title={empresa.prorrogada ? 'Ya usaste las 24 h extra: registra una gestión para renovar el plazo' : undefined}
              onClick={mantener}>
              {ocupado === 'mantener' ? 'Guardando…' : empresa.prorrogada ? '24 h extra ya usadas' : 'Mantener 24 h más'}
            </button>
            <button type="button" className="boton-texto" disabled={!!ocupado} onClick={() => setConfirmar(confirmar === 'liberar' ? '' : 'liberar')}>
              Liberar empresa
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
