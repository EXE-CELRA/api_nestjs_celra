import { Module, forwardRef } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AuthModule } from '../auth/auth.module';
import { AIAssistantModule } from '../ai-assistant/ai-assistant.module';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => AIAssistantModule),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
