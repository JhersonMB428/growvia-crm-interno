import { useEffect, useState } from 'react';
import { token } from '../api/cliente';
import './avatar.css';

/** Cada foto se descarga una sola vez (con el token) y se reutiliza en todas las pantallas */
const cache = new Map<string, Promise<string | null>>();
function urlFoto(id: string, version: number) {
  const clave = `${id}:${version}`;
  if (!cache.has(clave)) {
    cache.set(clave, fetch(`/api/usuarios/${id}/foto`, { headers: { Authorization: `Bearer ${token.leer() ?? ''}` } })
      .then((r) => (r.ok ? r.blob().then((b) => URL.createObjectURL(b)) : null))
      .catch(() => null));
  }
  return cache.get(clave)!;
}

interface Props { id: string; version?: number | null; nombres: string; apellidos: string; tam?: number; className?: string }

/** Foto de perfil; si no tiene, sus iniciales */
export function Avatar({ id, version, nombres, apellidos, tam = 40, className = '' }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!version) { setUrl(null); return; }
    let vigente = true;
    urlFoto(id, version).then((u) => { if (vigente) setUrl(u); });
    return () => { vigente = false; };
  }, [id, version]);

  const estilo = { width: tam, height: tam, fontSize: Math.round(tam * 0.36) };
  if (url) return <img className={`avatar avatar--foto ${className}`} src={url} alt="" style={estilo} />;
  return <span className={`avatar ${className}`} style={estilo} aria-hidden="true">{((nombres[0] ?? '') + (apellidos[0] ?? '')).toUpperCase()}</span>;
}