import { Module } from '@nestjs/common';
import { TaxLookupController } from './tax-lookup.controller';
import { TaxLookupService } from './tax-lookup.service';

@Module({
  controllers: [TaxLookupController],
  providers: [TaxLookupService],
  exports: [TaxLookupService],
})
export class TaxLookupModule {}
