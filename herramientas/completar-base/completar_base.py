#!/usr/bin/env python3
"""
Completar una base de empresas con la estructura del CRM (Ann):
RUC · RAZÓN SOCIAL · REPRESENTANTEL LEGAL SUNAT · DNI · TELEFONO · CORREO · DEPARTAMENTO · PROVINCIA · DISTRITO ·
CANTIDAD DE LÍNEAS · OPERADOR

Pasos:
  1. Si la fila no trae RUC, lo busca por la razón social en el padrón reducido de SUNAT (gratis, se descarga).
  2. Con el RUC consulta apiconsulta.dev (3 consultas por empresa): datos y ubicación, representante legal con DNI,
     y teléfonos/correos declarados ante SUNAT.
  3. Genera un Excel listo para "Cargar base" en el CRM, más una hoja "Revisar" con los RUC dudosos.

No guarda nada en el CRM. El token de apiconsulta se lee de la variable APICONSULTA_TOKEN (nunca se escribe en archivos).

Uso (Cloud Shell):
  pip install --user openpyxl
  python3 completar_base.py entrada.xlsx salida.xlsx              # solo busca RUC (no gasta consultas)
  read -s APICONSULTA_TOKEN && export APICONSULTA_TOKEN
  python3 completar_base.py entrada.xlsx salida.xlsx --sunat --limite 30   # completa hasta 30 empresas
"""
import argparse, io, json, os, re, sys, time, unicodedata, urllib.request, urllib.error, zipfile
from collections import defaultdict

PADRON_URL = 'http://www2.sunat.gob.pe/padron_reducido_ruc.zip'
API = os.environ.get('APICONSULTA_URL', 'https://api.apiconsulta.dev').rstrip('/')
COLUMNAS_CRM = ['RUC', 'RAZÓN SOCIAL', 'REPRESENTANTEL LEGAL SUNAT', 'DNI', 'TELEFONO', 'CORREO',
                'DEPARTAMENTO', 'PROVINCIA', 'DISTRITO', 'CANTIDAD DE LÍNEAS', 'OPERADOR']
PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

# ───────────────────────── Normalizar nombres ─────────────────────────
FORMAS = [
    (r'\bSOCIEDAD ANONIMA CERRADA\b', 'SAC'), (r'\bSOCIEDAD ANONIMA ABIERTA\b', 'SAA'), (r'\bSOCIEDAD ANONIMA\b', 'SA'),
    (r'\bSOCIEDAD COMERCIAL DE RESPONSABILIDAD LIMITADA\b', 'SRL'), (r'\bEMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA\b', 'EIRL'),
    (r'\bS\s*A\s*C\b', 'SAC'), (r'\bS\s*A\s*A\b', 'SAA'), (r'\bS\s*R\s*L\b', 'SRL'), (r'\bE\s*I\s*R\s*L\b', 'EIRL'), (r'\bS\s*A\b', 'SA'),
    (r'\bS CIVIL DE R L\b', 'SCRL'), (r'\bSOCIEDAD CIVIL DE RESPONSABILIDAD LIMITADA\b', 'SCRL'),
]
COMUNES = {'SAC', 'SA', 'SAA', 'SRL', 'EIRL', 'SCRL', 'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'E', 'EN', 'PERU', 'DEL', 'SEDE'}


def normal(texto):
    t = unicodedata.normalize('NFD', str(texto or '')).encode('ascii', 'ignore').decode().upper()
    t = t.replace('&', ' Y ').replace('.', '').replace("'", '').replace('´', '').replace('`', '')
    t = re.sub(r'[^A-Z0-9 ]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    for patron, cambio in FORMAS:
        t = re.sub(patron, cambio, t)
    return re.sub(r'\s+', ' ', t).strip()


def claves(nombre):
    """Palabras que identifican a la empresa (sin forma societaria ni artículos)"""
    return {p for p in normal(nombre).split() if p not in COMUNES and len(p) > 1}


def ruc_valido(ruc):
    if not re.fullmatch(r'(10|15|16|17|20)\d{9}', ruc or ''):
        return False
    resto = 11 - sum(p * int(d) for p, d in zip(PESOS, ruc)) % 11
    return {10: 0, 11: 1}.get(resto, resto) == int(ruc[10])


# ───────────────────────── Leer la base de entrada ─────────────────────────
ALIAS = {
    'ruc': ['RUC'],
    'razon': ['RAZON SOCIAL', 'CLIENTE FINAL', 'CLIENTE', 'EMPRESA', 'NOMBRE'],
    'contacto': ['REPRESENTANTEL LEGAL SUNAT', 'REPRESENTANTE LEGAL SUNAT', 'REPRESENTANTE LEGAL', 'CONTACTO PRESUNTO', 'CONTACTO'],
    'telefono': ['TELEFONO', 'CELULAR'], 'correo': ['CORREO', 'EMAIL'],
    'lineas': ['CANTIDAD DE LINEAS', 'LINEAS'], 'operador': ['OPERADOR', 'OPERADOR ACTUAL'],
}


def leer(ruta):
    import openpyxl
    hoja = openpyxl.load_workbook(ruta, data_only=True).active
    filas = list(hoja.iter_rows(values_only=True))
    enc = [normal(h) for h in filas[0]]
    mapa = {}
    for campo, alias in ALIAS.items():
        for a in alias:
            if a in enc:
                mapa[campo] = enc.index(a)
                break
    if 'razon' not in mapa and 'ruc' not in mapa:
        sys.exit('El archivo necesita una columna RUC o RAZÓN SOCIAL / CLIENTE FINAL')
    salida = []
    for n, f in enumerate(filas[1:], start=2):
        if not any(f):
            continue
        dato = {c: (str(f[i]).strip() if f[i] is not None else '') for c, i in mapa.items()}
        dato['ruc'] = re.sub(r'\D', '', dato.get('ruc', ''))
        # Las demás columnas del archivo se conservan al final del Excel de salida
        dato['_extra'] = {filas[0][i]: f[i] for i in range(len(f)) if i not in mapa.values() and filas[0][i]}
        dato['_fila'] = n
        salida.append(dato)
    return salida


# ───────────────────────── Paso 1: RUC por razón social ─────────────────────────
def descargar_padron(carpeta):
    os.makedirs(carpeta, exist_ok=True)
    zip_ruta = os.path.join(carpeta, 'padron_reducido_ruc.zip')
    if not os.path.exists(zip_ruta) or time.time() - os.path.getmtime(zip_ruta) > 7 * 86400:
        print('Descargando el padrón reducido de SUNAT (unos 300 MB, tarda unos minutos)…')
        urllib.request.urlretrieve(PADRON_URL, zip_ruta + '.tmp')
        os.replace(zip_ruta + '.tmp', zip_ruta)
    return zip_ruta


def buscar_rucs(empresas, zip_ruta):
    """Recorre el padrón una vez y junta candidatos para cada razón social sin RUC"""
    pendientes = [e for e in empresas if not e['ruc'] and e.get('razon')]
    if not pendientes:
        return
    exactos = {normal(e['razon']): e for e in pendientes}
    # Cada empresa se indexa por su palabra más larga; un candidato debe contener todas sus palabras clave
    por_palabra = defaultdict(list)
    for e in pendientes:
        e['_claves'] = claves(e['razon'])
        e['_candidatos'] = []
        if e['_claves']:
            por_palabra[max(e['_claves'], key=len)].append(e)
    print(f'Buscando el RUC de {len(pendientes)} empresas en el padrón…')
    with zipfile.ZipFile(zip_ruta) as z:
        nombre_txt = next(n for n in z.namelist() if n.lower().endswith('.txt'))
        with z.open(nombre_txt) as crudo:
            for i, linea in enumerate(io.TextIOWrapper(crudo, encoding='latin-1', errors='replace')):
                if i == 0:
                    continue
                partes = linea.rstrip('\n').split('|')
                if len(partes) < 5:
                    continue
                ruc, razon, estado, condicion, ubigeo = partes[0], partes[1], partes[2], partes[3], partes[4]
                n = normal(razon)
                cand = {'ruc': ruc, 'razon': razon.strip(), 'estado': estado.strip(), 'condicion': condicion.strip(), 'ubigeo': ubigeo.strip()}
                if n in exactos:
                    exactos[n]['_candidatos'].append({**cand, 'exacto': True})
                palabras = set(n.split())
                for p in palabras & por_palabra.keys():
                    for e in por_palabra[p]:
                        if e['_claves'] <= palabras and n not in exactos:
                            e['_candidatos'].append({**cand, 'exacto': False, 'sobra': len(palabras - e['_claves'] - COMUNES)})
                if i % 2_000_000 == 0:
                    print(f'  … {i:,} contribuyentes revisados')
    for e in pendientes:
        elegir_ruc(e)


def elegir_ruc(e):
    """Elige el RUC más probable: coincidencia exacta y activa primero; si hay dudas, se marca para revisar"""
    c = e.get('_candidatos', [])
    activos = lambda xs: [x for x in xs if x['estado'] == 'ACTIVO'] or xs
    exactos = activos([x for x in c if x['exacto']])
    if len(exactos) == 1:
        e['ruc'], e['_confianza'] = exactos[0]['ruc'], 'Exacto'
        return
    if len(exactos) > 1:
        juridicas = [x for x in exactos if x['ruc'].startswith('20')]
        if len(juridicas) == 1:
            e['ruc'], e['_confianza'] = juridicas[0]['ruc'], 'Exacto'
            return
        e['_confianza'], e['_opciones'] = 'Revisar: varios con el mismo nombre', exactos[:5]
        return
    parecidos = sorted(activos([x for x in c if not x['exacto']]), key=lambda x: (x['sobra'], not x['ruc'].startswith('20')))
    if len(parecidos) == 1 or (parecidos and parecidos[0]['sobra'] <= 1 and (len(parecidos) == 1 or parecidos[1]['sobra'] > parecidos[0]['sobra'])):
        e['ruc'], e['_confianza'] = parecidos[0]['ruc'], 'Probable (revisar el nombre)'
        e['_opciones'] = parecidos[:3]
        return
    e['_confianza'] = 'Revisar: varios parecidos' if parecidos else 'No encontrado en SUNAT'
    e['_opciones'] = parecidos[:5]


# ───────────────────────── Paso 2: datos de SUNAT por RUC ─────────────────────────
def api(ruta, ruc, token):
    pedido = urllib.request.Request(API + ruta, data=json.dumps({'ruc': ruc}).encode(), method='POST',
                                    headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(pedido, timeout=20) as r:
            cuerpo = json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as err:
        if err.code in (401, 403):
            sys.exit('apiconsulta rechazó el token: revisa APICONSULTA_TOKEN')
        if err.code == 429:
            sys.exit('Se acabaron las consultas del plan de apiconsulta')
        return None
    except Exception:
        return None
    return cuerpo.get('data') if cuerpo.get('success', True) else None


def texto(v):
    return '' if v is None or isinstance(v, (dict, list)) else re.sub(r'\s+', ' ', str(v)).strip()


def completar(e, token):
    """3 consultas: empresa, representantes y contacto. Solo llena lo que está vacío."""
    d = api('/ruc', e['ruc'], token)
    d = d[0] if isinstance(d, list) and d else d if isinstance(d, dict) else {}
    u = d.get('ubigeo') if isinstance(d.get('ubigeo'), dict) else {}
    e['razon_sunat'] = texto(d.get('nombre_o_razon_social') or d.get('razon_social'))
    e['estado'] = ' · '.join(x for x in [texto(d.get('estado')), texto(d.get('condicion'))] if x)
    e['departamento'] = texto(d.get('departamento') or u.get('departamento'))
    e['provincia'] = texto(d.get('provincia') or u.get('provincia'))
    e['distrito'] = texto(d.get('distrito') or u.get('distrito'))
    e['direccion'] = texto(d.get('direccion'))

    reps = api('/ruc-representantes', e['ruc'], token)
    reps = reps if isinstance(reps, list) else next((v for v in (reps or {}).values() if isinstance(v, list)), []) if isinstance(reps, dict) else []
    def prioridad(r):
        cargo = texto(r.get('cargo')).upper()
        return (0 if 'GERENTE GENERAL' in cargo else 1 if 'GERENTE' in cargo else 2 if re.search('TITULAR|PRESIDENTE|ADMINISTRADOR', cargo) else 3)
    reps = sorted([r for r in reps if isinstance(r, dict) and texto(r.get('nombre'))], key=prioridad)
    if reps:
        r = reps[0]
        e['representante'] = texto(r.get('nombre')).title()
        doc = re.sub(r'\D', '', texto(r.get('numero_de_documento') or r.get('documento')))
        e['dni'] = doc if len(doc) == 8 else ''
        e['cargo'] = texto(r.get('cargo')).title()

    c = api('/ruc-contacto', e['ruc'], token) or {}
    tels = [re.sub(r'\D', '', texto(t)) for t in (c.get('telefonos') or [])] if isinstance(c, dict) else []
    tels = [t[-9:] for t in tels if len(t) >= 9 and t[-9] in '90'] + [t for t in tels if 6 <= len(t) < 9]
    correos = [texto(x).lower() for x in (c.get('correos') or [])] if isinstance(c, dict) else []
    e['telefono_sunat'] = tels[0] if tels else ''
    e['telefonos_otros'] = ', '.join(tels[1:4])
    e['correo_sunat'] = correos[0] if correos else ''


# ───────────────────────── Paso 3: Excel de salida ─────────────────────────
def guardar(empresas, ruta):
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    libro = openpyxl.Workbook()
    hoja = libro.active
    hoja.title = 'Base CRM'
    extras = []
    for e in empresas:
        for k in e['_extra']:
            if k not in extras:
                extras.append(k)
    control = ['CONFIANZA DEL RUC', 'ESTADO SUNAT', 'CARGO DEL REPRESENTANTE', 'OTROS TELÉFONOS', 'DIRECCIÓN', 'NOMBRE EN EL ARCHIVO']
    hoja.append(COLUMNAS_CRM + control + [str(x).upper() for x in extras])
    for e in empresas:
        hoja.append([
            e.get('ruc', ''), e.get('razon_sunat') or e.get('razon', ''), e.get('representante') or e.get('contacto', ''),
            e.get('dni', ''), e.get('telefono') or e.get('telefono_sunat', ''), e.get('correo') or e.get('correo_sunat', ''),
            e.get('departamento', '').title(), e.get('provincia', '').title(), e.get('distrito', '').title(),
            e.get('lineas', ''), e.get('operador', ''),
            e.get('_confianza', 'Del archivo' if e.get('ruc') else ''), e.get('estado', ''), e.get('cargo', ''),
            e.get('telefonos_otros', ''), e.get('direccion', ''), e.get('razon', ''),
        ] + [e['_extra'].get(x) for x in extras])
    verde = PatternFill('solid', fgColor='013936')
    for celda in hoja[1]:
        celda.font, celda.fill = Font(bold=True, color='FFFFFF'), verde
        celda.alignment = Alignment(wrap_text=True, vertical='center')
    for i, ancho in enumerate([13, 42, 34, 11, 12, 30, 14, 14, 18, 10, 12, 26, 18, 22, 22, 40, 42], start=1):
        hoja.column_dimensions[openpyxl.utils.get_column_letter(i)].width = ancho
    for fila in hoja.iter_rows(min_row=2):
        for c in (fila[0], fila[3], fila[4]):
            c.number_format = '@'
        if str(fila[11].value).startswith(('Revisar', 'No encontrado', 'Probable')):
            for c in fila[:12]:
                c.fill = PatternFill('solid', fgColor='FFF2CC')
    hoja.freeze_panes = 'C2'

    rev = libro.create_sheet('Revisar RUC')
    rev.append(['FILA', 'NOMBRE EN EL ARCHIVO', 'SITUACIÓN', 'RUC PROPUESTO', 'OPCIONES EN SUNAT (RUC · NOMBRE · ESTADO)'])
    for e in empresas:
        if str(e.get('_confianza', '')).startswith(('Revisar', 'No encontrado', 'Probable')):
            ops = ' | '.join(f"{o['ruc']} · {o['razon']} · {o['estado']}" for o in e.get('_opciones', []))
            rev.append([e['_fila'], e.get('razon', ''), e['_confianza'], e.get('ruc', ''), ops])
    for celda in rev[1]:
        celda.font, celda.fill = Font(bold=True, color='FFFFFF'), verde
    for col, ancho in zip('ABCDE', [7, 48, 30, 14, 120]):
        rev.column_dimensions[col].width = ancho
    libro.save(ruta)


def main():
    p = argparse.ArgumentParser(description='Completa una base de empresas con la estructura del CRM')
    p.add_argument('entrada'); p.add_argument('salida')
    p.add_argument('--sunat', action='store_true', help='Consultar apiconsulta (3 consultas por empresa)')
    p.add_argument('--limite', type=int, default=0, help='Máximo de empresas a consultar en apiconsulta (0 = todas)')
    p.add_argument('--incluir-probables', action='store_true', help='Consultar también las de RUC "Probable" (por defecto solo las exactas)')
    p.add_argument('--padron', default=os.path.expanduser('~/padron-sunat'), help='Carpeta donde guardar el padrón descargado')
    p.add_argument('--padron-zip', help='Usar un padrón ya descargado (.zip)')
    a = p.parse_args()

    empresas = leer(a.entrada)
    print(f'{len(empresas)} empresas leídas de {a.entrada}')
    for e in empresas:
        if e['ruc'] and not ruc_valido(e['ruc']):
            e['_confianza'] = 'Revisar: el RUC del archivo no es válido'
    if any(not e['ruc'] and e.get('razon') for e in empresas):
        buscar_rucs(empresas, a.padron_zip or descargar_padron(a.padron))

    if a.sunat:
        token = os.environ.get('APICONSULTA_TOKEN')
        if not token:
            sys.exit('Falta el token: ejecuta  read -s APICONSULTA_TOKEN && export APICONSULTA_TOKEN')
        # Solo las que tienen un RUC confiable; las dudosas se completan después de revisarlas
        dudosos = ('Revisar', 'No encontrado') + (() if a.incluir_probables else ('Probable',))
        listas = [e for e in empresas if e['ruc'] and ruc_valido(e['ruc']) and not str(e.get('_confianza', '')).startswith(dudosos)]
        if a.limite:
            listas = listas[:a.limite]
        print(f'Consultando SUNAT para {len(listas)} empresas ({len(listas) * 3} consultas de apiconsulta)…')
        for i, e in enumerate(listas, start=1):
            completar(e, token)
            print(f'  {i}/{len(listas)} {e["ruc"]} {e.get("razon_sunat") or e.get("razon")}')
            time.sleep(0.2)

    guardar(empresas, a.salida)
    conteo = defaultdict(int)
    for e in empresas:
        conteo[str(e.get('_confianza', 'Del archivo'))] += 1
    print(f'\nListo: {a.salida}')
    for k, v in sorted(conteo.items(), key=lambda x: -x[1]):
        print(f'  {v:4d}  {k}')


if __name__ == '__main__':
    main()
