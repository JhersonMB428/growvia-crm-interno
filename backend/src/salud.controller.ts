import { Controller, Get } from '@nestjs/common';
import { Publico } from './auth/decorators/publico.decorator';

@Controller('salud')
export class SaludController {
  @Publico()
  @Get()
  verificar() {
    return { estado: 'ok', servicio: 'growvia-crm-backend', fecha: new Date().toISOString() };
  }
}
