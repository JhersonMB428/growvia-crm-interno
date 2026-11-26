# Completar una base de empresas (herramienta aparte del CRM)

Convierte un Excel de empresas en la estructura que usa el CRM:

`RUC · RAZÓN SOCIAL · REPRESENTANTEL LEGAL SUNAT · DNI · TELEFONO · CORREO · DEPARTAMENTO · PROVINCIA · DISTRITO · CANTIDAD DE LÍNEAS · OPERADOR`

No guarda nada en el CRM: devuelve un Excel que luego se sube con **Bases → Cargar base**.

## Qué hace

| Paso | Fuente | Costo |
|---|---|---|
| 1. Busca el RUC por razón social (si la fila no lo trae) | Padrón reducido de SUNAT (se descarga) | Gratis |
| 2. Datos y ubicación, representante legal con DNI, teléfonos y correos declarados en SUNAT | apiconsulta.dev (`--sunat`) | 3 consultas por empresa |
| Cantidad de líneas y operador | No hay fuente automática: se mantienen si vienen en el archivo | — |

El Excel de salida tiene dos hojas:
- **Base CRM**: las 11 columnas del CRM, columnas de control (confianza del RUC, estado SUNAT, cargo, otros teléfonos, dirección) y las columnas originales del archivo. Las filas en amarillo hay que revisarlas.
- **Revisar RUC**: empresas cuyo RUC no se encontró o tiene varias opciones, con los candidatos de SUNAT.

## Uso en Cloud Shell

```bash
cd ~/crm/herramientas/completar-base
pip install --user openpyxl
# Sube el Excel con el botón "Cargar archivos" de Cloud Shell (queda en ~)

# Paso 1 (gratis): solo buscar los RUC
python3 completar_base.py ~/base.xlsx ~/base-completa.xlsx

# Paso 2: completar con SUNAT (pide el token sin mostrarlo)
read -s APICONSULTA_TOKEN && export APICONSULTA_TOKEN
python3 completar_base.py ~/base.xlsx ~/base-completa.xlsx --sunat --limite 30
unset APICONSULTA_TOKEN
```

- `--limite N`: consulta como máximo N empresas (para no gastar el plan).
- `--incluir-probables`: consulta también las de RUC "Probable" (por defecto solo las exactas).
- El padrón se guarda en `~/padron-sunat` y se vuelve a descargar si tiene más de 7 días.

Descarga el resultado con el botón "Descargar archivo" de Cloud Shell (`~/base-completa.xlsx`).
