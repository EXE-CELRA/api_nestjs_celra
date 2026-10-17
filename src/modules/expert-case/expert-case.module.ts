import { Module } from '@nestjs/common';
import { ExpertCaseService } from './expert-case.service';
import { ExpertCaseController } from './expert-case.controller';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [WalletModule, AuthModule],
  controllers: [ExpertCaseController],
  providers: [ExpertCaseService],
  exports: [ExpertCaseService],
})
export class ExpertCaseModule {}
