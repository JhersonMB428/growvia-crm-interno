import { Controller, Get } from '@nestjs/common';

@Controller('salud')
export class SaludController {
  @Get()
  verificar() {
    return { estado: 'ok', servicio: 'growvia-crm-backend', fecha: new Date().toISOString() };
  }
}