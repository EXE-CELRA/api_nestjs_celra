import { Module } from '@nestjs/common';
import { EvidenceDocumentService } from './evidence-document.service';
import { EvidenceVaultService } from './evidence-vault.service';
import { EvidenceDocumentController } from './evidence-document.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [EvidenceDocumentController],
  providers: [EvidenceDocumentService, EvidenceVaultService],
  exports: [EvidenceDocumentService, EvidenceVaultService],
})
export class EvidenceDocumentModule {}
