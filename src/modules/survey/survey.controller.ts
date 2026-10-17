import {
  Controller,
  Post,
  Body,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { SurveyService } from './survey.service';
import { SubmitSurveyDto } from './dto/survey.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Situation Survey (Khảo sát Tình huống)')
@Controller('surveys')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  @Post('submit')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Nộp câu trả lời khảo sát và lưu vào Bối cảnh doanh nghiệp' })
  async submitAnswers(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: SubmitSurveyDto,
  ) {
    return this.surveyService.submitAnswers(orgId, userId, dto);
  }
}
