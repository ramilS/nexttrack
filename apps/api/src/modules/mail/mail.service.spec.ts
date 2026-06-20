import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import { MailTemplatesService } from './mail-templates.service';
import { mailConfig, appConfig } from '@/config';

describe('MailService', () => {
  let service: MailService;
  let mockSendMail: jest.Mock;
  let templatesService: { render: jest.Mock };

  const mockMailConfig = {
    host: 'localhost',
    port: 1025,
    secure: false,
    user: '',
    pass: '',
    from: 'test@test.local',
  };

  const mockAppConfig = {
    webUrl: 'http://localhost:3000',
  };

  beforeEach(async () => {
    mockSendMail = jest.fn().mockResolvedValue({ messageId: '<test>' });
    templatesService = { render: jest.fn().mockReturnValue('<html>test</html>') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: mailConfig.KEY, useValue: mockMailConfig },
        { provide: appConfig.KEY, useValue: mockAppConfig },
        { provide: MailTemplatesService, useValue: templatesService },
      ],
    }).compile();

    service = module.get(MailService);
    // Replace the transporter's sendMail with a mock
    (service as unknown as { transporter: { sendMail: jest.Mock } }).transporter =
      { sendMail: mockSendMail };
  });

  describe('sendInvite', () => {
    it('should send invite email with correct subject', async () => {
      await service.sendInvite('new@test.local', {
        senderName: 'Alice',
        token: 'abc-123',
        ttlHours: 72,
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'test@test.local',
          to: 'new@test.local',
          subject: 'Invite to nexttrack from Alice',
        }),
      );
      // The link must point at the real frontend route (/accept-invite/:token),
      // not /invite/:token, which has no page and 404s.
      expect(templatesService.render).toHaveBeenCalledWith(
        'invite',
        expect.objectContaining({
          inviteUrl: 'http://localhost:3000/accept-invite/abc-123',
        }),
      );
    });
  });

  describe('sendNotificationEmail', () => {
    it('should send notification with correct subject for ISSUE_ASSIGNED', async () => {
      await service.sendNotificationEmail('user@test.local', {
        type: 'ISSUE_ASSIGNED',
        issueKey: 'PRJ-1',
        issueTitle: 'Fix bug',
        actorName: 'Bob',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: '[PRJ-1] Issue assigned to you: Fix bug',
        }),
      );
      expect(templatesService.render).toHaveBeenCalledWith(
        'issue-assigned',
        expect.objectContaining({ webUrl: 'http://localhost:3000' }),
      );
    });

    it('should use [nexttrack] prefix when no issueKey', async () => {
      await service.sendNotificationEmail('user@test.local', {
        type: 'ADDED_TO_PROJECT',
        projectName: 'My Project',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'You were added to a project',
        }),
      );
    });

    it('should fallback to notification-default template for unknown type', async () => {
      await service.sendNotificationEmail('user@test.local', {
        type: 'UNKNOWN_TYPE',
      });

      expect(templatesService.render).toHaveBeenCalledWith(
        'notification-default',
        expect.any(Object),
      );
    });
  });

  describe('sendDigestEmail', () => {
    it('should send digest with notification count in subject', async () => {
      await service.sendDigestEmail('user@test.local', {
        userName: 'Test',
        notifications: [
          { type: 'COMMENT_ADD', issueKey: 'PRJ-1', createdAt: new Date().toISOString() },
          { type: 'ISSUE_ASSIGNED', issueKey: 'PRJ-2', createdAt: new Date().toISOString() },
        ],
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'nexttrack Digest: 2 new notifications',
        }),
      );
      expect(templatesService.render).toHaveBeenCalledWith(
        'digest',
        expect.objectContaining({ userName: 'Test' }),
      );
    });
  });
});
