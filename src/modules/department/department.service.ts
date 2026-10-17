import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto';

@Injectable()
export class DepartmentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, dto: CreateDepartmentDto) {
    return this.prisma.department.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        leadName: dto.leadName,
        description: dto.description,
      },
    });
  }

  async findAll(orgId: string) {
    return this.prisma.department.findMany({
      where: { organizationId: orgId },
      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                roleTitle: true,
              },
            },
          },
        },
        _count: {
          select: {
            tasks: true,
            findings: true,
          },
        },
      },
    });
  }

  async update(deptId: string, dto: UpdateDepartmentDto) {
    const dept = await this.prisma.department.findUnique({ where: { id: deptId } });
    if (!dept) {
      throw new NotFoundException('Không tìm thấy phòng ban');
    }

    return this.prisma.department.update({
      where: { id: deptId },
      data: dto,
    });
  }

  async remove(deptId: string) {
    const dept = await this.prisma.department.findUnique({ where: { id: deptId } });
    if (!dept) {
      throw new NotFoundException('Không tìm thấy phòng ban');
    }

    return this.prisma.department.delete({ where: { id: deptId } });
  }
}
