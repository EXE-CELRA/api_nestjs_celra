import { Module } from '@nestjs/common';
import { EvidenceDocumentService } from './evidence-document.service';
import { EvidenceDocumentController } from './evidence-document.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [EvidenceDocumentController],
  providers: [EvidenceDocumentService],
  exports: [EvidenceDocumentService],
})
export class EvidenceDocumentModule {}
