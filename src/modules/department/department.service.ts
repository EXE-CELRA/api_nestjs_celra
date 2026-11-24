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
          },
        },
      },
    });
  }

  async update(deptId: string, orgId: string, dto: UpdateDepartmentDto) {
    const dept = await this.prisma.department.findFirst({
      where: { id: deptId, organizationId: orgId },
    });
    if (!dept) {
      throw new NotFoundException('Không tìm thấy phòng ban trong doanh nghiệp hiện tại');
    }

    return this.prisma.department.update({
      where: { id: deptId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.leadName !== undefined && { leadName: dto.leadName }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
  }

  async remove(deptId: string, orgId: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id: deptId, organizationId: orgId },
    });
    if (!dept) {
      throw new NotFoundException('Không tìm thấy phòng ban trong doanh nghiệp hiện tại');
    }

    return this.prisma.department.delete({ where: { id: deptId } });
  }
}
