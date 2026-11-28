import { Module } from '@nestjs/common';
import { EvidenceDocumentService } from './evidence-document.service';
import { EvidenceVaultService } from './evidence-vault.service';
import { EvidenceDocumentController } from './evidence-document.controller';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [AuthModule, SubscriptionModule],
  controllers: [EvidenceDocumentController],
  providers: [EvidenceDocumentService, EvidenceVaultService],
  exports: [EvidenceDocumentService, EvidenceVaultService],
})
export class EvidenceDocumentModule {}
