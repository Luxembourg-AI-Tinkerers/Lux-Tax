import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserDto } from '@luxtax/contracts';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.profile?.firstName || undefined,
      lastName: user.profile?.lastName || undefined,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async updateProfile(
    userId: string,
    data: { firstName?: string; lastName?: string }
  ): Promise<UserDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        profile: {
          upsert: {
            create: {
              firstName: data.firstName?.trim(),
              lastName: data.lastName?.trim(),
            },
            update: {
              firstName: data.firstName?.trim(),
              lastName: data.lastName?.trim(),
            },
          },
        },
      },
      include: { profile: true },
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.profile?.firstName || undefined,
      lastName: user.profile?.lastName || undefined,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
