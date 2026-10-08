import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

/**
 * Dónde se guardan los archivos del CRM (expedientes de venta).
 *  - Producción: Azure Blob Storage, si existe AZURE_STORAGE_CONNECTION_STRING (contenedor privado).
 *  - Desarrollo: una carpeta del disco (ALMACEN_DIR, por defecto backend/almacen). Esa carpeta NO se sube a git.
 * Los archivos nunca se sirven directo: siempre pasan por el backend, que revisa permisos.
 */
@Injectable()
export class AlmacenamientoService implements OnModuleInit {
  private readonly log = new Logger('Almacenamiento');
  private contenedor: ContainerClient | null = null;
  private carpeta = '';

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const conexion = this.config.get<string>('AZURE_STORAGE_CONNECTION_STRING');
    if (conexion) {
      const nombre = this.config.get<string>('AZURE_STORAGE_CONTAINER') || 'expedientes';
      this.contenedor = BlobServiceClient.fromConnectionString(conexion).getContainerClient(nombre);
      await this.contenedor.createIfNotExists(); // sin acceso público
      this.log.log(`Archivos en Azure Blob (contenedor "${nombre}")`);
    } else {
      this.carpeta = resolve(this.config.get<string>('ALMACEN_DIR') || 'almacen');
      await mkdir(this.carpeta, { recursive: true });
      this.log.log(`Archivos en disco: ${this.carpeta}`);
    }
  }

  async guardar(clave: string, datos: Buffer, mime: string) {
    if (this.contenedor) {
      await this.contenedor.getBlockBlobClient(clave).uploadData(datos, { blobHTTPHeaders: { blobContentType: mime } });
      return;
    }
    const ruta = this.ruta(clave);
    await mkdir(dirname(ruta), { recursive: true });
    await writeFile(ruta, datos);
  }

  async leer(clave: string): Promise<Buffer> {
    if (this.contenedor) return this.contenedor.getBlockBlobClient(clave).downloadToBuffer();
    return readFile(this.ruta(clave));
  }

  /** Evita que una clave como "../../.env" salga de la carpeta */
  private ruta(clave: string) {
    const ruta = resolve(this.carpeta, clave);
    if (!ruta.startsWith(this.carpeta + sep)) throw new Error('Clave de archivo no válida');
    return ruta;
  }
}