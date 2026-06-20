import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { mailConfig, appConfig } from '@/config';
import { MailTemplatesService } from './mail-templates.service';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(
    @Inject(mailConfig.KEY)
    private mail: ConfigType<typeof mailConfig>,
    @Inject(appConfig.KEY)
    private app: ConfigType<typeof appConfig>,
    private templates: MailTemplatesService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.mail.host,
      port: this.mail.port,
      secure: this.mail.secure,
      ...(this.mail.user
        ? { auth: { user: this.mail.user, pass: this.mail.pass } }
        : {}),
    });
  }

  async sendInvite(
    to: string,
    data: { senderName: string; token: string; ttlHours: number },
  ) {
    const inviteUrl = `${this.app.webUrl}/accept-invite/${data.token}`;

    const html = this.templates.render('invite', {
      senderName: data.senderName,
      inviteUrl,
      ttlHours: data.ttlHours,
    });

    await this.transporter.sendMail({
      from: this.mail.from,
      to,
      subject: `Invite to nexttrack from ${data.senderName}`,
      html,
    });
  }

  async sendNotificationEmail(
    to: string,
    data: {
      type: string;
      actorName?: string;
      issueKey?: string;
      issueTitle?: string;
      projectName?: string;
      message?: string;
      actionUrl?: string;
    },
  ) {
    const subject = this.buildSubject(data.type, data.issueKey, data.issueTitle);
    const templateName = this.getTemplateForType(data.type);
    const html = this.templates.render(templateName, {
      ...data,
      webUrl: this.app.webUrl,
    });

    await this.transporter.sendMail({
      from: this.mail.from,
      to,
      subject,
      html,
    });
  }

  async sendDigestEmail(
    to: string,
    data: {
      userName: string;
      notifications: Array<{
        type: string;
        issueKey?: string;
        issueTitle?: string;
        actorName?: string;
        createdAt: string;
      }>;
    },
  ) {
    const html = this.templates.render('digest', {
      ...data,
      webUrl: this.app.webUrl,
    });

    await this.transporter.sendMail({
      from: this.mail.from,
      to,
      subject: `nexttrack Digest: ${data.notifications.length} new notifications`,
      html,
    });
  }

  private buildSubject(type: string, issueKey?: string, issueTitle?: string): string {
    const prefix = issueKey ? `[${issueKey}]` : '[nexttrack]';
    const subjectMap: Record<string, string> = {
      ISSUE_ASSIGNED: `${prefix} Issue assigned to you`,
      STATUS_CHANGE: `${prefix} Status changed`,
      COMMENT_ADD: `${prefix} New comment`,
      MENTION: `${prefix} You were mentioned`,
      ISSUE_RESOLVED: `${prefix} Issue resolved`,
      DUE_DATE: `${prefix} Due date approaching`,
      SPRINT_STARTED: 'Sprint started',
      SPRINT_CLOSED: 'Sprint closed',
      ADDED_TO_PROJECT: 'You were added to a project',
      INVITE_ACCEPTED: 'Invitation accepted',
    };
    const suffix = issueTitle ? `: ${issueTitle}` : '';
    return (subjectMap[type] ?? `${prefix} Notification`) + suffix;
  }

  private getTemplateForType(type: string): string {
    const map: Record<string, string> = {
      ISSUE_ASSIGNED: 'issue-assigned',
      STATUS_CHANGE: 'status-changed',
      COMMENT_ADD: 'comment-added',
      MENTION: 'mention',
      ISSUE_RESOLVED: 'issue-resolved',
      DUE_DATE: 'due-date-approaching',
    };
    return map[type] ?? 'notification-default';
  }
}
