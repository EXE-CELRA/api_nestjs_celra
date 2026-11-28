import { Module } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';
import { AuthModule } from '../auth/auth.module';
import { EvidenceDocumentModule } from '../evidence-document/evidence-document.module';

@Module({
  imports: [AuthModule, EvidenceDocumentModule],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
