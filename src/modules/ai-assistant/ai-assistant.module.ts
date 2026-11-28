import { Module } from '@nestjs/common';
import { AIAssistantService } from './ai-assistant.service';
import { AIAssistantController } from './ai-assistant.controller';
import { ChatFileService } from './chat-file.service';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [AuthModule, SubscriptionModule],
  controllers: [AIAssistantController],
  providers: [AIAssistantService, ChatFileService],
  exports: [AIAssistantService, ChatFileService],
})
export class AIAssistantModule {}
