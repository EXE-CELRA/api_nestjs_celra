import { Module } from '@nestjs/common';
import { ContextEngineService } from './context-engine.service';
import { ContextEngineController } from './context-engine.controller';
import { ComplianceFlowService } from './compliance-flow.service';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [AuthModule, WalletModule],
  controllers: [ContextEngineController],
  providers: [ContextEngineService, ComplianceFlowService],
  exports: [ContextEngineService, ComplianceFlowService],
})
export class ContextEngineModule {}
