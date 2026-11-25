import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { empresasApi, type Contacto } from '../../api/empresas';
import { EditorContactos, limpiarContactos, problemasContactos } from '../../componentes/EditorContactos';
import { SelectorUbigeo } from '../../componentes/SelectorUbigeo';
import { useDebounce } from '../../hooks/useDebounce';
import { AyudaCampo, Faltantes } from '../../componentes/Faltantes';
import { problemaRuc } from '../../utilidades/validacion';
import { nombrePropio, sunatApi, type DatosSunat, type Representante } from '../../api/sunat';
import { PanelSunat } from '../../componentes/PanelSunat';

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
  const errRuc = problemaRuc(ruc);
  const rucValido = !errRuc;
  const [intentado, setIntentado] = useState(false);
  const [sunatActivo, setSunatActivo] = useState(false);
  const [sunat, setSunat] = useState<DatosSunat | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [ubigeoInicial, setUbigeoInicial] = useState<{ id: string | null; n: number }>({ id: null, n: 0 });
  useEffect(() => { sunatApi.activo().then(setSunatActivo); }, []);

  async function traerSunat() {
    setConsultando(true); setError('');
    try {
      const d = await sunatApi.consultar(ruc);
      setSunat(d);
      if (d.razonSocial) setRazon(d.razonSocial);
      if (d.distritoId) setUbigeoInicial((u) => ({ id: d.distritoId, n: u.n + 1 }));
      // Un solo representante: se completa directo; si hay varios, la ejecutiva elige
      if (d.representantes.length === 1) usarRepresentante(d.representantes[0]);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo consultar SUNAT');
    } finally {
      setConsultando(false);
    }
  }
  function usarRepresentante(r: Representante) {
    setContactos((cs) => [{ ...cs[0], nombre: nombrePropio(r.nombre), dni: r.dni ?? '' }, ...cs.slice(1)]);
  }

  // Apenas el RUC está completo, se revisa si ya existe en el CRM
  useEffect(() => {
    if (problemaRuc(rucListo)) { setRevision({ estado: 'nada' }); return; }
    setRevision({ estado: 'revisando' });
    empresasApi.verificarRuc(rucListo)
      .then((r) => setRevision(r.existe
        ? { estado: 'existe', mensaje: r.mensaje ?? 'Este RUC ya existe', empresaId: r.empresa!.id, tomable: r.empresa!.libre }
        : { estado: 'libre' }))
      .catch(() => setRevision({ estado: 'nada' }));
  }, [rucListo]);

  const alCambiarDistrito = useCallback((id: string) => setDistritoId(id), []);
  const faltantes = [
    ...(errRuc ? [`RUC: ${errRuc}`] : revision.estado === 'existe' ? ['RUC: ya está registrado en el CRM'] : revision.estado === 'revisando' ? ['RUC: espera a que terminemos de revisarlo'] : []),
    ...(razon.trim().length < 3 ? [razon.trim() ? 'Razón social: escribe al menos 3 letras' : 'Escribe la razón social'] : []),
    ...(!distritoId ? ['Elige departamento, provincia y distrito'] : []),
    // Sin teléfono se puede guardar: la empresa queda marcada con "Falta: teléfono"
    ...problemasContactos(contactos, true),
  ];
  const listo = faltantes.length === 0 && revision.estado === 'libre';

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setIntentado(true);
    if (!listo) return;
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
          <span className="leyenda-obligatorio">Campos obligatorios</span>
          <div className="rejilla-2">
            <div className="campo">
              <label htmlFor="ruc" className="etiqueta obligatorio">RUC</label>
              <input id="ruc" className="entrada numeros" inputMode="numeric" maxLength={11} placeholder="20XXXXXXXXX" autoFocus
                value={ruc} onChange={(e) => { setRuc(e.target.value.replace(/\D/g, '').slice(0, 11)); setSunat(null); }}
                aria-invalid={revision.estado === 'existe' || ((ruc.length === 11 || (intentado && !!ruc) || /^[^12]|^1[^0]|^2[^0]/.test(ruc)) && !rucValido)} aria-describedby="ruc-ayuda" />
              <AyudaCampo id="ruc-ayuda"
                problema={(ruc.length === 11 || intentado || /^[^12]|^1[^0]|^2[^0]/.test(ruc)) && errRuc ? errRuc : ''}
                ayuda={revision.estado === 'revisando' ? 'Revisando…' : revision.estado === 'libre' ? '✓ RUC válido y disponible' : '11 dígitos, empieza con 10 o 20'} />
            </div>
            <div className="campo">
              <label htmlFor="razon" className="etiqueta obligatorio">Razón social</label>
              <input id="razon" className="entrada" maxLength={200} placeholder="Ej. Transportes Andinos S.A.C." value={razon} onChange={(e) => setRazon(e.target.value)}
                aria-invalid={intentado && razon.trim().length < 3} aria-describedby="razon-ayuda" />
              <AyudaCampo id="razon-ayuda" problema={intentado && razon.trim().length < 3 ? 'Escribe la razón social (como figura en SUNAT)' : ''} />
            </div>
          </div>

          {revision.estado === 'libre' && sunatActivo && !sunat && (
            <div className="fila-acciones" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="boton-secundario" onClick={traerSunat} disabled={consultando}>{consultando ? 'Consultando SUNAT…' : 'Traer datos de SUNAT'}</button>
              <span className="tenue" style={{ fontSize: 13 }}>Completa la razón social, la ubicación y el representante legal.</span>
            </div>
          )}
          {sunat && (
            <PanelSunat datos={sunat} onUsar={usarRepresentante} />
          )}
          {revision.estado === 'existe' && (
            <div className="alerta" role="alert" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span><b>RUC repetido.</b> {revision.mensaje}</span>
              <Link to={`/empresas/${revision.empresaId}`} style={{ fontWeight: 700 }}>{revision.tomable ? 'Ver y tomarla' : 'Ver empresa'}</Link>
            </div>
          )}

          <SelectorUbigeo key={ubigeoInicial.n} inicial={ubigeoInicial.id} onCambio={alCambiarDistrito} />
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="h2">Contactos <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--texto-tenue)' }}>· máximo 2</span></h2>
          <EditorContactos contactos={contactos} onChange={setContactos} mostrarErrores={intentado} telefonoRepOpcional />
        </section>

        {intentado && <Faltantes items={faltantes} />}
        {error && <div className="alerta" role="alert">{error}</div>}
        <div className="fila-acciones">
          <Link to="/empresas" className="boton-secundario">Cancelar</Link>
          <button type="submit" className="boton" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar prospecto'}</button>
        </div>
      </form>
    </>
  );
}