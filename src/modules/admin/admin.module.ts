import { Module, forwardRef } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminConfigStore } from './admin-config.store';
import { AdminDlplService } from './admin-dlpl.service';
import { AdminAiService } from './admin-ai.service';
import { AdminFinanceService } from './admin-finance.service';
import { AuthModule } from '../auth/auth.module';
import { AIAssistantModule } from '../ai-assistant/ai-assistant.module';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => AIAssistantModule),
  ],
  controllers: [AdminController],
  providers: [
    AdminConfigStore,
    AdminDlplService,
    AdminAiService,
    AdminFinanceService,
    AdminService,
  ],
  exports: [AdminService],
})
export class AdminModule {}
