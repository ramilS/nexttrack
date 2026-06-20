import { Test, TestingModule } from '@nestjs/testing';
import { TelegramTemplatesService } from './telegram-templates.service';

describe('TelegramTemplatesService', () => {
  let service: TelegramTemplatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TelegramTemplatesService],
    }).compile();

    service = module.get(TelegramTemplatesService);
  });

  describe('render', () => {
    it('should render ASSIGNEE_CHANGED default template', () => {
      const result = service.render('ASSIGNEE_CHANGED', {
        issueKey: 'PRJ-1',
        assigneeName: 'Alice',
        issueTitle: 'Fix bug',
      });

      expect(result).toContain('PRJ-1');
      expect(result).toContain('Alice');
      expect(result).toContain('Fix bug');
    });

    it('should render STATUS_CHANGED default template', () => {
      const result = service.render('STATUS_CHANGED', {
        issueKey: 'PRJ-2',
        statusName: 'In Progress',
        issueTitle: 'Implement feature',
      });

      expect(result).toContain('PRJ-2');
      expect(result).toContain('In Progress');
      expect(result).toContain('Implement feature');
    });

    it('should render COMMENT_ADDED default template', () => {
      const result = service.render('COMMENT_ADDED', {
        issueKey: 'PRJ-3',
        actorName: 'Bob',
        preview: 'Looks good to me',
      });

      expect(result).toContain('PRJ-3');
      expect(result).toContain('Bob');
      expect(result).toContain('Looks good to me');
    });

    it('should render ISSUE_RESOLVED default template', () => {
      const result = service.render('ISSUE_RESOLVED', {
        issueKey: 'PRJ-4',
        actorName: 'Charlie',
        issueTitle: 'Resolved task',
      });

      expect(result).toContain('PRJ-4');
      expect(result).toContain('Charlie');
      expect(result).toContain('Resolved task');
    });

    it('should render SPRINT_STARTED default template', () => {
      const result = service.render('SPRINT_STARTED', {
        sprintName: 'Sprint 5',
        projectName: 'My Project',
      });

      expect(result).toContain('Sprint 5');
      expect(result).toContain('My Project');
    });

    it('should render SPRINT_CLOSED default template', () => {
      const result = service.render('SPRINT_CLOSED', {
        sprintName: 'Sprint 4',
        projectName: 'My Project',
      });

      expect(result).toContain('Sprint 4');
      expect(result).toContain('My Project');
    });

    it('should use custom template when provided', () => {
      const custom = 'Custom: {{issueKey}} by {{actorName}}';
      const result = service.render('ASSIGNEE_CHANGED', {
        issueKey: 'PRJ-99',
        actorName: 'Dave',
      }, custom);

      expect(result).toBe('Custom: PRJ-99 by Dave');
    });

    it('should fall back to "Event: TYPE" for unknown event types', () => {
      const result = service.render('UNKNOWN_EVENT', { foo: 'bar' });

      expect(result).toBe('Event: UNKNOWN_EVENT');
    });

    it('should cache compiled templates and reuse them', () => {
      const data = { issueKey: 'PRJ-1', assigneeName: 'Alice', issueTitle: 'Bug' };

      const result1 = service.render('ASSIGNEE_CHANGED', data);
      const result2 = service.render('ASSIGNEE_CHANGED', data);

      expect(result1).toBe(result2);

      // Verify cache is populated via internal map
      const cache = service['compiledTemplates'];
      expect(cache.has('ASSIGNEE_CHANGED')).toBe(true);
    });

    it('should cache custom templates with custom: prefix', () => {
      const custom = 'Hello {{name}}';
      service.render('ANY', { name: 'World' }, custom);

      const cache = service['compiledTemplates'];
      expect(cache.has(`custom:${custom}`)).toBe(true);
    });

    it('should substitute data correctly in default templates', () => {
      const result = service.render('STATUS_CHANGED', {
        issueKey: 'ABC-123',
        statusName: 'Done',
        issueTitle: 'Task title here',
      });

      expect(result).toBe(
        '<b>ABC-123</b> status changed to <b>Done</b>\nTask title here',
      );
    });
  });
});
