import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { InvitesRepository } from './invites.repository';
import { MailModule } from '@/modules/mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, InvitesRepository],
  exports: [UsersService, UsersRepository, InvitesRepository],
})
export class UsersModule {}
