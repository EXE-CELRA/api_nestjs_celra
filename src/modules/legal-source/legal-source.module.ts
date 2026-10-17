import { Module } from '@nestjs/common';
import { LegalSourceService } from './legal-source.service';
import { LegalSourceController } from './legal-source.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [LegalSourceController],
  providers: [LegalSourceService],
  exports: [LegalSourceService],
})
export class LegalSourceModule {}
