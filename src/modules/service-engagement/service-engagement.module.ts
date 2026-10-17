import { Module } from '@nestjs/common';
import { ServiceEngagementService } from './service-engagement.service';
import { ServiceEngagementController } from './service-engagement.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ServiceEngagementController],
  providers: [ServiceEngagementService],
  exports: [ServiceEngagementService],
})
export class ServiceEngagementModule {}
