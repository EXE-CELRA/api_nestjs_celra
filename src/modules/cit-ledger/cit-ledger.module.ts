import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { CitLedgerService } from './cit-ledger.service';
import { CitLedgerController } from './cit-ledger.controller';

@Module({
  imports: [PrismaModule, AuthModule, SubscriptionModule],
  controllers: [CitLedgerController],
  providers: [CitLedgerService],
  exports: [CitLedgerService],
})
export class CitLedgerModule {}
