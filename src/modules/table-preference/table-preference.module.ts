import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TablePreferenceController } from './table-preference.controller';
import { TablePreferenceService } from './table-preference.service';

@Module({
  imports: [AuthModule],
  controllers: [TablePreferenceController],
  providers: [TablePreferenceService],
  exports: [TablePreferenceService],
})
export class TablePreferenceModule {}
