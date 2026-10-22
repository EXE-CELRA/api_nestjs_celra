import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import {
  RegisterDto,
  LoginDto,
  ChangePasswordDto,
  UpdateProfileDto,
} from './dto/auth.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private enrichUserWithVietnamese(user: any) {
    if (!user) return user;
    return {
      ...user,
      hoVaTen: user.name,
      soDienThoai: user.phone,
      vaiTro: user.role,
      chucDanh: user.roleTitle,
      anhDaiDien: user.avatar,
      taoLuc: user.createdAt,
    };
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new BadRequestException('Email này đã được sử dụng trong hệ thống');
    }

    const rawPassword = dto.matKhau || dto.password || dto.passwordHash;
    if (!rawPassword) {
      throw new BadRequestException('Mật khẩu không được để trống');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(rawPassword, saltRounds);

    const userName = dto.hoVaTen || dto.name || dto.fullName || 'Người dùng';
    const userPhone = dto.soDienThoai || dto.phone || dto.phoneNumber;
    const userRole = dto.vaiTro || dto.role || UserRole.owner;
    const userRoleTitle = dto.chucDanh || dto.roleTitle || 'Chủ doanh nghiệp';

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        name: userName,
        role: userRole,
        roleTitle: userRoleTitle,
        phone: userPhone,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roleTitle: true,
        avatar: true,
        phone: true,
        isTwoFactorEnabled: true,
        createdAt: true,
      },
    });

    const token = await this.generateToken(user);

    return {
      user: this.enrichUserWithVietnamese(user),
      accessToken: token,
    };
  }

  async login(dto: LoginDto) {
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@gmail.com').toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123!@#';
    const rawPassword = dto.matKhau || dto.password || dto.passwordHash;

    // Kiểm tra tài khoản ảo Super Admin (In-Memory, không chạm vào DB)
    if (dto.email.toLowerCase() === adminEmail) {
      if (rawPassword !== adminPassword) {
        throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
      }

      const virtualAdmin = {
        id: 'admin-virtual-system-id',
        email: adminEmail,
        name: process.env.ADMIN_DEFAULT_NAME || 'Quản Trị Viên Hệ Thống CELRA',
        role: UserRole.admin,
        roleTitle: 'Super Administrator',
        avatar: null,
        phone: '0987654321',
        isTwoFactorEnabled: false,
        createdAt: new Date(),
        isSuperAdmin: true,
      };

      const token = await this.generateToken(virtualAdmin);

      return {
        user: this.enrichUserWithVietnamese(virtualAdmin),
        accessToken: token,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    if (!rawPassword) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    const isPasswordValid = await bcrypt.compare(rawPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    const token = await this.generateToken(user);

    const { passwordHash: _, ...safeUser } = user;

    return {
      user: this.enrichUserWithVietnamese(safeUser),
      accessToken: token,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    const oldPassword = dto.matKhauCu || dto.oldPassword;
    const newPassword = dto.matKhauMoi || dto.newPassword;

    if (!oldPassword || !newPassword) {
      throw new BadRequestException('Mật khẩu cũ và mật khẩu mới không được để trống');
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isOldPasswordValid) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    return {
      success: true,
      message: 'Đã cập nhật mật khẩu mới thành công',
    };
  }

  async getProfile(userId: string) {
    if (userId === 'admin-virtual-system-id') {
      const virtualAdmin = {
        id: 'admin-virtual-system-id',
        email: process.env.ADMIN_EMAIL || 'admin@gmail.com',
        name: process.env.ADMIN_DEFAULT_NAME || 'Quản Trị Viên Hệ Thống CELRA',
        role: UserRole.admin,
        roleTitle: 'Super Administrator',
        avatar: null,
        phone: '0987654321',
        isTwoFactorEnabled: false,
        createdAt: new Date(),
        memberships: [],
        isSuperAdmin: true,
      };
      return this.enrichUserWithVietnamese(virtualAdmin);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roleTitle: true,
        avatar: true,
        phone: true,
        isTwoFactorEnabled: true,
        createdAt: true,
        memberships: {
          include: {
            organization: true,
            department: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy thông tin người dùng');
    }

    return this.enrichUserWithVietnamese(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    if (dto.email && dto.email.toLowerCase() !== user.email.toLowerCase()) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase() },
      });
      if (existingEmail) {
        throw new BadRequestException('Email này đã được sử dụng bởi tài khoản khác');
      }
    }

    const targetName = dto.hoVaTen || dto.name;
    const targetPhone = dto.soDienThoai || dto.phone;

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(targetName !== undefined && { name: targetName.trim() }),
        ...(targetPhone !== undefined && { phone: targetPhone.trim() }),
        ...(dto.email !== undefined && { email: dto.email.trim().toLowerCase() }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roleTitle: true,
        avatar: true,
        phone: true,
        isTwoFactorEnabled: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      message: 'Cập nhật thông tin cá nhân thành công',
      user: this.enrichUserWithVietnamese(updatedUser),
    };
  }

  private async generateToken(user: { id: string; email: string; role: UserRole; name: string }) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    return this.jwtService.signAsync(payload);
  }
}
