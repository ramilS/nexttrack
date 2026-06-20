import { Logger } from '@nestjs/common';
import { AppLogger } from './app-logger';
import { runWithRequestId, setRequestUserId } from '@/common/context/request-context';

describe('AppLogger', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs a bare message without context outside a request scope', () => {
    new AppLogger('Test').log('hello');

    expect(logSpy).toHaveBeenCalledWith('hello');
  });

  it('renders structured fields as key=value pairs', () => {
    new AppLogger('Test').log('Issue status changed', {
      issueId: 'i-1',
      from: 'TODO',
      to: 'DONE',
    });

    expect(logSpy).toHaveBeenCalledWith(
      'Issue status changed issueId=i-1 from=TODO to=DONE',
    );
  });

  it('omits fields whose value is undefined', () => {
    new AppLogger('Test').log('msg', { a: 1, b: undefined });

    expect(logSpy).toHaveBeenCalledWith('msg a=1');
  });

  it('prefixes the request id and user id from the active context', () => {
    runWithRequestId('req-9', () => {
      setRequestUserId('u-42');
      new AppLogger('Test').warn('Suspicious thing', { ip: '1.2.3.4' });
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[req-9][user:u-42] Suspicious thing ip=1.2.3.4',
    );
  });

  it('prefixes only the request id when no user is set', () => {
    runWithRequestId('req-9', () => {
      new AppLogger('Test').log('Public hit');
    });

    expect(logSpy).toHaveBeenCalledWith('[req-9] Public hit');
  });

  it('passes the stack trace through for Error arguments', () => {
    const err = new Error('boom');
    new AppLogger('Test').error('Job failed', err, { jobId: 'j-1' });

    expect(errorSpy).toHaveBeenCalledWith('Job failed jobId=j-1', err.stack);
  });

  it('surfaces a non-Error thrown value as an error field', () => {
    new AppLogger('Test').error('Weird failure', 'string-rejection');

    expect(errorSpy).toHaveBeenCalledWith(
      'Weird failure error=string-rejection',
      undefined,
    );
  });

  it('serializes object field values as JSON', () => {
    new AppLogger('Test').log('Updating', { changes: { title: 'x' } });

    expect(logSpy).toHaveBeenCalledWith('Updating changes={"title":"x"}');
  });

  it('renders null field values as the string "null"', () => {
    new AppLogger('Test').log('msg', { parentId: null });

    expect(logSpy).toHaveBeenCalledWith('msg parentId=null');
  });

  it('never renders "key=undefined" for unserializable values', () => {
    new AppLogger('Test').log('msg', { fn: () => 1 });

    expect(logSpy).toHaveBeenCalledWith(expect.not.stringContaining('=undefined'));
  });
});
