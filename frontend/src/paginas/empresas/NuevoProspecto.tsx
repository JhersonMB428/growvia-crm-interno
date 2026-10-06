import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { empresasApi, type Contacto } from '../../api/empresas';
import { contactosCompletos, EditorContactos, limpiarContactos } from '../../componentes/EditorContactos';
import { SelectorUbigeo } from '../../componentes/SelectorUbigeo';
import { useDebounce } from '../../hooks/useDebounce';

type Revision = { estado: 'nada' | 'revisando' | 'libre' } | { estado: 'existe'; mensaje: string; empresaId: string; tomable: boolean };

export function NuevoProspecto() {
  const navegar = useNavigate();
  const [ruc, setRuc] = useState('');
  const [razon, setRazon] = useState('');
  const [distritoId, setDistritoId] = useState('');
  const [contactos, setContactos] = useState<Contacto[]>([{ nombre: '', celular: '', correo: '' }]);
  const [revision, setRevision] = useState<Revision>({ estado: 'nada' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const rucListo = useDebounce(ruc, 300);
  const rucValido = /^(10|20)\d{9}$/.test(ruc);

  // Apenas el RUC está completo, se revisa si ya existe en el CRM
  useEffect(() => {
    if (!/^(10|20)\d{9}$/.test(rucListo)) { setRevision({ estado: 'nada' }); return; }
    setRevision({ estado: 'revisando' });
    empresasApi.verificarRuc(rucListo)
      .then((r) => setRevision(r.existe
        ? { estado: 'existe', mensaje: r.mensaje ?? 'Este RUC ya existe', empresaId: r.empresa!.id, tomable: r.empresa!.libre }
        : { estado: 'libre' }))
      .catch(() => setRevision({ estado: 'nada' }));
  }, [rucListo]);

  const alCambiarDistrito = useCallback((id: string) => setDistritoId(id), []);
  const listo = rucValido && revision.estado === 'libre' && razon.trim().length >= 3 && !!distritoId && contactosCompletos(contactos);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(''); setGuardando(true);
    try {
      const creada = await empresasApi.crear({ ruc, razonSocial: razon.trim(), distritoId, contactos: limpiarContactos(contactos) });
      navegar(`/empresas/${creada.id}`, { state: { aviso: `${creada.razonSocial} se registró como prospecto en tu cartera.` } });
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="encabezado">
        <nav aria-label="Ruta" style={{ fontSize: 14 }}><Link to="/empresas" style={{ textDecoration: 'none' }}>Mis empresas</Link> <span style={{ color: 'var(--texto-tenue)' }}>/ Nuevo prospecto</span></nav>
        <h1>Nuevo prospecto</h1>
        <p>La empresa quedará a tu cargo. Si el RUC ya existe, te avisamos antes de guardar.</p>
      </div>

      <form onSubmit={guardar} className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 22 }} noValidate>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="h2">Empresa</h2>
          <div className="rejilla-2">
            <div className="campo">
              <label htmlFor="ruc" className="etiqueta">RUC</label>
              <input id="ruc" className="entrada numeros" inputMode="numeric" maxLength={11} placeholder="20XXXXXXXXX" autoFocus
                value={ruc} onChange={(e) => setRuc(e.target.value.replace(/\D/g, '').slice(0, 11))}
                aria-invalid={revision.estado === 'existe' || (ruc.length === 11 && !rucValido)} aria-describedby="ruc-ayuda" />
              <span id="ruc-ayuda" style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>
                {ruc.length === 11 && !rucValido ? 'Debe empezar con 10 o 20' :
                  revision.estado === 'revisando' ? 'Revisando…' :
                  revision.estado === 'libre' ? '✓ RUC disponible' : '11 dígitos, empieza con 10 o 20'}
              </span>
            </div>
            <div className="campo">
              <label htmlFor="razon" className="etiqueta">Razón social</label>
              <input id="razon" className="entrada" maxLength={200} placeholder="Ej. Transportes Andinos S.A.C." value={razon} onChange={(e) => setRazon(e.target.value)} />
            </div>
          </div>

          {revision.estado === 'existe' && (
            <div className="alerta" role="alert" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span><b>RUC repetido.</b> {revision.mensaje}</span>
              <Link to={`/empresas/${revision.empresaId}`} style={{ fontWeight: 700 }}>{revision.tomable ? 'Ver y tomarla' : 'Ver empresa'}</Link>
            </div>
          )}

          <SelectorUbigeo onCambio={alCambiarDistrito} />
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="h2">Contactos <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--texto-tenue)' }}>· máximo 2</span></h2>
          <EditorContactos contactos={contactos} onChange={setContactos} />
        </section>

        {error && <div className="alerta" role="alert">{error}</div>}
        <div className="fila-acciones">
          <Link to="/empresas" className="boton-secundario">Cancelar</Link>
          <button type="submit" className="boton" disabled={!listo || guardando}>{guardando ? 'Guardando…' : 'Guardar prospecto'}</button>
        </div>
      </form>
    </>
  );
}