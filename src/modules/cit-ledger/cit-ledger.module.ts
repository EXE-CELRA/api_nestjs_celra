import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CitLedgerService } from './cit-ledger.service';
import { CitLedgerController } from './cit-ledger.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CitLedgerController],
  providers: [CitLedgerService],
  exports: [CitLedgerService],
})
export class CitLedgerModule {}
