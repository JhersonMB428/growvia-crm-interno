import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Envío de correos.
 * - Si SMTP_HOST está configurado en el .env, envía de verdad (SMTP corporativo o Azure).
 * - Si no, muestra el correo en la consola del backend (modo desarrollo).
 */
@Injectable()
export class CorreoService {
  private readonly logger = new Logger('Correo');
  private readonly transporte: nodemailer.Transporter | null;
  private readonly remitente: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    this.remitente = config.get<string>('CORREO_REMITENTE') ?? 'Growvia CRM <no-responder@growvia.global>';
    this.transporte = host
      ? nodemailer.createTransport({
          host,
          port: Number(config.get('SMTP_PORT') ?? 587),
          secure: Number(config.get('SMTP_PORT') ?? 587) === 465,
          auth: { user: config.get<string>('SMTP_USER'), pass: config.get<string>('SMTP_PASS') },
        })
      : null;
  }

  async enviar(para: string, asunto: string, texto: string, html?: string): Promise<void> {
    if (!this.transporte) {
      this.logger.warn(`[MODO DESARROLLO] Correo a ${para} | ${asunto}\n${texto}`);
      return;
    }
    await this.transporte.sendMail({ from: this.remitente, to: para, subject: asunto, text: texto, html });
  }
}
