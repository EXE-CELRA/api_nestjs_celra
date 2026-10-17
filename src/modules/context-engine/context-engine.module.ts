import { Module } from '@nestjs/common';
import { ContextEngineService } from './context-engine.service';
import { ContextEngineController } from './context-engine.controller';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [AuthModule, WalletModule],
  controllers: [ContextEngineController],
  providers: [ContextEngineService],
  exports: [ContextEngineService],
})
export class ContextEngineModule {}

