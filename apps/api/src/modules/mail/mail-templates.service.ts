import { Injectable } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { AppLogger } from '@/common/logging/app-logger';

@Injectable()
export class MailTemplatesService {
  private readonly logger = new AppLogger(MailTemplatesService.name);
  private compiledTemplates = new Map<string, Handlebars.TemplateDelegate>();

  compile(templateName: string): Handlebars.TemplateDelegate {
    const cached = this.compiledTemplates.get(templateName);
    if (cached) return cached;

    const templatePath = path.join(__dirname, 'templates', `${templateName}.hbs`);
    let source: string;
    try {
      source = fs.readFileSync(templatePath, 'utf-8');
    } catch (error) {
      this.logger.error('Mail template read failed', error, {
        template: templateName,
        templatePath,
      });
      throw error;
    }
    const compiled = Handlebars.compile(source);
    this.compiledTemplates.set(templateName, compiled);
    return compiled;
  }

  render(templateName: string, data: Record<string, unknown>): string {
    const template = this.compile(templateName);
    return template(data);
  }
}
