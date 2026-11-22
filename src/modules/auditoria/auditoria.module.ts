import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaInterceptor } from './auditoria.interceptor';
import { AuditoriaService } from './auditoria.service';

/** Global: o AuthService (login/logout/senha) e o interceptor usam o mesmo serviço */
@Global()
@Module({
  controllers: [AuditoriaController],
  providers: [AuditoriaService, { provide: APP_INTERCEPTOR, useClass: AuditoriaInterceptor }],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
