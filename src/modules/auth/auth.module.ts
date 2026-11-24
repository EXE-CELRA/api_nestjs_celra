import { Module, Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { EmailService } from './email.service';

const authModuleLogger = new Logger('AuthModule');

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const rawSecret = config.get<string>('JWT_SECRET')?.trim();
        const isProd = config.get<string>('NODE_ENV') === 'production';

        if (isProd && (!rawSecret || rawSecret.length < 32)) {
          throw new Error(
            'FATAL SECURITY ERROR: JWT_SECRET bắt buộc phải được cấu hình và dài tối thiểu 32 ký tự trong môi trường Production.',
          );
        }

        let secret = rawSecret;
        if (!secret) {
          secret = crypto.randomBytes(32).toString('hex');
          authModuleLogger.warn(
            'JWT_SECRET chưa được cấu hình trong .env (Dev mode). Đã tự sinh khóa ngẫu nhiên tạm thời cho phiên chạy hiện tại.',
          );
        } else if (secret.length < 32) {
          authModuleLogger.warn(
            'Cảnh báo bảo mật: JWT_SECRET hiện ngắn hơn 32 ký tự. Vui lòng tăng độ dài khóa trước khi triển khai Production.',
          );
        }

        return {
          secret,
          signOptions: {
            expiresIn: (config.get<string>('JWT_EXPIRES_IN', '7d') as `${number}d`) || '7d',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard, EmailService],
  exports: [AuthService, JwtModule, JwtAuthGuard, RolesGuard, EmailService],
})
export class AuthModule { }
