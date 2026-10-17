import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './database/prisma.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';

// Feature Modules
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { DepartmentModule } from './modules/department/department.module';
import { MembershipModule } from './modules/membership/membership.module';
import { ContextEngineModule } from './modules/context-engine/context-engine.module';
import { RuleEngineModule } from './modules/rule-engine/rule-engine.module';
import { TaskModule } from './modules/task/task.module';
import { EvidenceDocumentModule } from './modules/evidence-document/evidence-document.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { PaymentModule } from './modules/payment/payment.module';
import { AIAssistantModule } from './modules/ai-assistant/ai-assistant.module';
import { SurveyModule } from './modules/survey/survey.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database
    PrismaModule,

    // Feature Modules
    AuthModule,
    OrganizationModule,
    DepartmentModule,
    MembershipModule,
    ContextEngineModule,
    RuleEngineModule,
    SurveyModule,
    TaskModule,
    EvidenceDocumentModule,
    WalletModule,
    PaymentModule,
    AIAssistantModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformResponseInterceptor,
    },
  ],
})
export class AppModule {}
