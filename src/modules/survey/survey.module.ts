import { Module } from '@nestjs/common';
import { SurveyService } from './survey.service';
import { SurveyController } from './survey.controller';
import { RuleEngineModule } from '../rule-engine/rule-engine.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [RuleEngineModule, AuthModule],
  controllers: [SurveyController],
  providers: [SurveyService],
  exports: [SurveyService],
})
export class SurveyModule {}
