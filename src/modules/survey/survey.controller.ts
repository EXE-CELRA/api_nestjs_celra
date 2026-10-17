import {
  Controller,
  Get,
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

  @Get('questions')
  @ApiOperation({ summary: 'Lấy bộ câu hỏi khảo sát tình huống' })
  async getQuestions() {
    return this.surveyService.getQuestions();
  }

  @Get('my-answers')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Lấy các câu trả lời khảo sát đã lưu của Doanh nghiệp' })
  async getOrgAnswers(@Headers('x-organization-id') orgId: string) {
    return this.surveyService.getOrgAnswers(orgId);
  }

  @Post('submit')
  @ApiHeader({ name: 'x-organization-id', description: 'ID Doanh nghiệp' })
  @ApiOperation({ summary: 'Nộp câu trả lời khảo sát và tự động kích hoạt tạo Checklist/Task' })
  async submitAnswers(
    @Headers('x-organization-id') orgId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: SubmitSurveyDto,
  ) {
    return this.surveyService.submitAnswers(orgId, userId, dto);
  }
}
