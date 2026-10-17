import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateLegalSourceDto } from './dto/legal-source.dto';

@Injectable()
export class LegalSourceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLegalSourceDto) {
    return this.prisma.legalSource.create({
      data: {
        title: dto.title,
        documentNumber: dto.documentNumber,
        authority: dto.authority,
        issuedDate: new Date(dto.issuedDate),
        effectiveDate: new Date(dto.effectiveDate),
        version: dto.version || '1.0',
        relevantSection: dto.relevantSection,
        summary: dto.summary,
        url: dto.url,
        status: dto.status,
      },
    });
  }

  async findAll() {
    return this.prisma.legalSource.findMany({
      orderBy: { effectiveDate: 'desc' },
    });
  }

  async findOne(id: string) {
    const source = await this.prisma.legalSource.findUnique({ where: { id } });
    if (!source) {
      throw new NotFoundException('Không tìm thấy văn bản pháp lý');
    }
    return source;
  }
}
