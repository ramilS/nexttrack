import { Test, TestingModule } from '@nestjs/testing';
import { MailTemplatesService } from './mail-templates.service';
import * as fs from 'fs';

jest.mock('fs');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('MailTemplatesService', () => {
  let service: MailTemplatesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [MailTemplatesService],
    }).compile();

    service = module.get(MailTemplatesService);

    // Reset the internal cache between tests
    service['compiledTemplates'] = new Map();
  });

  describe('compile', () => {
    it('should read the .hbs file and return a compiled template function', () => {
      mockedFs.readFileSync.mockReturnValue('Hello {{name}}');

      const template = service.compile('welcome');

      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('welcome.hbs'),
        'utf-8',
      );
      expect(typeof template).toBe('function');
    });

    it('should cache the template on second call', () => {
      mockedFs.readFileSync.mockReturnValue('Cached {{value}}');

      const first = service.compile('invite');
      const second = service.compile('invite');

      expect(first).toBe(second);
      expect(mockedFs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('should propagate error when file is not found', () => {
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      expect(() => service.compile('nonexistent')).toThrow('ENOENT');
    });
  });

  describe('render', () => {
    it('should compile template and render with data', () => {
      mockedFs.readFileSync.mockReturnValue('Hello {{name}}, welcome to {{app}}!');

      const result = service.render('welcome', { name: 'Alice', app: 'NextTrack' });

      expect(result).toBe('Hello Alice, welcome to NextTrack!');
    });

    it('should render template with HTML content', () => {
      mockedFs.readFileSync.mockReturnValue(
        '<h1>Hi {{userName}}</h1><p>Your code is {{code}}</p>',
      );

      const result = service.render('verification', {
        userName: 'Bob',
        code: '123456',
      });

      expect(result).toBe('<h1>Hi Bob</h1><p>Your code is 123456</p>');
    });

    it('should use cached template for subsequent renders', () => {
      mockedFs.readFileSync.mockReturnValue('{{greeting}} {{name}}');

      const result1 = service.render('hello', { greeting: 'Hi', name: 'Alice' });
      const result2 = service.render('hello', { greeting: 'Hey', name: 'Bob' });

      expect(result1).toBe('Hi Alice');
      expect(result2).toBe('Hey Bob');
      expect(mockedFs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('should handle missing variables gracefully', () => {
      mockedFs.readFileSync.mockReturnValue('Hello {{name}}, your role is {{role}}');

      const result = service.render('partial', { name: 'Charlie' });

      expect(result).toBe('Hello Charlie, your role is ');
    });

    it('should propagate file not found errors through render', () => {
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      expect(() => service.render('missing', { data: 'value' })).toThrow('ENOENT');
    });
  });
});
