import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Parametro } from './parametro.entity';

/**
 * Lee los parámetros configurables (tabla parametros).
 * Guarda los valores 60 segundos en memoria para no consultar la BD en cada pedido.
 */
@Injectable()
export class ParametrosService {
  private cache = new Map<string, { valor: string; hasta: number }>();

  constructor(@InjectRepository(Parametro) private readonly repo: Repository<Parametro>) {}

  async texto(clave: string, porDefecto: string): Promise<string> {
    const enCache = this.cache.get(clave);
    if (enCache && enCache.hasta > Date.now()) return enCache.valor;
    const fila = await this.repo.findOne({ where: { clave } });
    const valor = fila?.valor ?? porDefecto;
    this.cache.set(clave, { valor, hasta: Date.now() + 60_000 });
    return valor;
  }
    /** Al editar un parámetro, el valor nuevo se usa de inmediato */
  limpiar(clave: string) {
    this.cache.delete(clave);
  }
  async numero(clave: string, porDefecto: number): Promise<number> {
    const n = Number(await this.texto(clave, String(porDefecto)));
    return Number.isFinite(n) ? n : porDefecto;
  }
}
