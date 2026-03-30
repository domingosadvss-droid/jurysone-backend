import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { PortalAuthGuard } from './guards/portal-auth.guard';
import { PrismaService } from '../../database/prisma.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [PortalController],
  providers: [PortalService, PrismaService, PortalAuthGuard],
  exports: [PortalService],
})
export class PortalModule {}
