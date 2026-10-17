import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../database/prisma.service';
import {
  RegisterDto,
  LoginDto,
  VerifyOtpDto,
  ChangePasswordDto,
} from './dto/auth.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new BadRequestException('Email này đã được sử dụng trong hệ thống');
    }

    const rawPassword = dto.password || dto.passwordHash;
    if (!rawPassword) {
      throw new BadRequestException('Mật khẩu không được để trống');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(rawPassword, saltRounds);

    const userName = dto.name || dto.fullName || 'Người dùng';
    const userPhone = dto.phone || dto.phoneNumber;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        name: userName,
        role: dto.role || UserRole.owner,
        roleTitle: dto.roleTitle || 'Chủ doanh nghiệp',
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
      user,
      accessToken: token,
    };
  }

  async login(dto: LoginDto) {
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

    const rawPassword = dto.password || dto.passwordHash;
    if (!rawPassword) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    const isPasswordValid = await bcrypt.compare(rawPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    // Nếu đã bật 2FA mà chưa cung cấp mã hoặc mã sai
    if (user.isTwoFactorEnabled) {
      if (!dto.twoFactorCode) {
        return {
          require2FA: true,
          message: 'Tài khoản yêu cầu mã xác thực 2FA OTP',
        };
      }

      const is2FAValid = speakeasy.totp.verify({
        secret: user.twoFactorSecret || '',
        encoding: 'base32',
        token: dto.twoFactorCode,
        window: 1,
      });

      if (!is2FAValid) {
        throw new UnauthorizedException('Mã 2FA OTP không hợp lệ hoặc đã hết hạn');
      }
    }

    const token = await this.generateToken(user);

    const { passwordHash: _, twoFactorSecret: __, ...safeUser } = user;

    return {
      user: safeUser,
      accessToken: token,
    };
  }

  async generate2FASecret(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    const secret = speakeasy.generateSecret({
      name: `CELRA (${user.email})`,
      issuer: 'CELRA Compliance',
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32 },
    });

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url || '');

    return {
      secret: secret.base32,
      qrCodeUrl,
    };
  }

  async enable2FA(userId: string, dto: VerifyOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) {
      throw new BadRequestException('Vui lòng tạo mã bí mật 2FA trước');
    }

    const isVerified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: dto.code,
      window: 1,
    });

    if (!isVerified) {
      throw new BadRequestException('Mã OTP không hợp lệ. Không thể kích hoạt 2FA');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isTwoFactorEnabled: true },
    });

    return {
      success: true,
      message: 'Đã kích hoạt xác thực 2 lớp (2FA) thành công',
    };
  }

  async disable2FA(userId: string, dto: VerifyOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isTwoFactorEnabled) {
      throw new BadRequestException('Tài khoản chưa bật 2FA');
    }

    const isVerified = speakeasy.totp.verify({
      secret: user.twoFactorSecret || '',
      encoding: 'base32',
      token: dto.code,
      window: 1,
    });

    if (!isVerified) {
      throw new BadRequestException('Mã OTP không hợp lệ. Không thể tắt 2FA');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isTwoFactorEnabled: false, twoFactorSecret: null },
    });

    return {
      success: true,
      message: 'Đã tắt bảo mật 2 lớp 2FA thành công',
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    const isOldPasswordValid = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!isOldPasswordValid) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(dto.newPassword, saltRounds);

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

    return user;
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
