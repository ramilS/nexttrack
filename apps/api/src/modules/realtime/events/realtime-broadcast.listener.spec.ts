import { Test } from '@nestjs/testing';
import { RealtimeBroadcastListener } from './realtime-broadcast.listener';
import { RealtimeGateway } from '../realtime.gateway';
import {
  IssueCreatedEvent,
  IssueDeletedEvent,
  IssueRestoredEvent,
  IssueUpdatedEvent,
} from '@/modules/issues/events/issue.events';
import { CommentCreatedEvent } from '@/modules/comments/events/comment.events';
import {
  SprintClosedEvent,
  SprintStartedEvent,
} from '@/modules/sprints/events/sprint.events';

const PROJECT_ID = 'project-1';
const ISSUE_ID = 'issue-1';
const USER_ID = 'user-1';

function withMeta<T>(event: T): T & { eventId: string } {
  return { ...event, eventId: 'outbox-1' };
}

describe('RealtimeBroadcastListener', () => {
  let listener: RealtimeBroadcastListener;
  let gateway: { sendToProject: jest.Mock };

  beforeEach(async () => {
    gateway = { sendToProject: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RealtimeBroadcastListener,
        { provide: RealtimeGateway, useValue: gateway },
      ],
    }).compile();

    listener = moduleRef.get(RealtimeBroadcastListener);
  });

  function issueUpdated(): IssueUpdatedEvent {
    return new IssueUpdatedEvent(
      ISSUE_ID,
      PROJECT_ID,
      'PRJ',
      'Project',
      1,
      'Title',
      USER_ID,
      [],
      {},
      { assigneeId: null, statusId: 's1', resolvedAt: null, description: null },
      [],
      'Reporter',
    );
  }

  it('broadcasts issue:created to the issue project room', () => {
    listener.onIssueCreated(
      withMeta(
        new IssueCreatedEvent(
          ISSUE_ID,
          PROJECT_ID,
          'PRJ',
          'Project',
          1,
          'Title',
          USER_ID,
          null,
          null,
          'Reporter',
        ),
      ),
    );

    expect(gateway.sendToProject).toHaveBeenCalledWith(
      PROJECT_ID,
      'issue:created',
      { payload: { issueId: ISSUE_ID }, actorId: USER_ID },
    );
  });

  it('broadcasts issue:updated', () => {
    listener.onIssueUpdated(withMeta(issueUpdated()));

    expect(gateway.sendToProject).toHaveBeenCalledWith(
      PROJECT_ID,
      'issue:updated',
      { payload: { issueId: ISSUE_ID }, actorId: USER_ID },
    );
  });

  it('broadcasts issue:deleted', () => {
    listener.onIssueDeleted(
      withMeta(new IssueDeletedEvent(ISSUE_ID, PROJECT_ID, USER_ID)),
    );

    expect(gateway.sendToProject).toHaveBeenCalledWith(
      PROJECT_ID,
      'issue:deleted',
      { payload: { issueId: ISSUE_ID }, actorId: USER_ID },
    );
  });

  it('broadcasts a restore as issue:updated, because it re-enters every list', () => {
    listener.onIssueRestored(
      withMeta(new IssueRestoredEvent(ISSUE_ID, PROJECT_ID, USER_ID)),
    );

    expect(gateway.sendToProject).toHaveBeenCalledWith(
      PROJECT_ID,
      'issue:updated',
      { payload: { issueId: ISSUE_ID }, actorId: USER_ID },
    );
  });

  it('broadcasts comment:created carrying the issue the comment belongs to', () => {
    listener.onCommentCreated(
      withMeta(
        new CommentCreatedEvent(
          'comment-1',
          ISSUE_ID,
          PROJECT_ID,
          USER_ID,
          { type: 'doc', content: [] },
          'Title',
          'Author',
          'PRJ',
          1,
        ),
      ),
    );

    expect(gateway.sendToProject).toHaveBeenCalledWith(
      PROJECT_ID,
      'comment:created',
      { payload: { issueId: ISSUE_ID }, actorId: USER_ID },
    );
  });

  it('broadcasts sprint:started and sprint:closed', () => {
    listener.onSprintStarted(
      withMeta(
        new SprintStartedEvent('sprint-1', 'board-1', PROJECT_ID, 'S1', USER_ID),
      ),
    );
    listener.onSprintClosed(
      withMeta(
        new SprintClosedEvent('sprint-1', 'board-1', PROJECT_ID, 'S1', null),
      ),
    );

    expect(gateway.sendToProject).toHaveBeenNthCalledWith(
      1,
      PROJECT_ID,
      'sprint:started',
      { payload: { sprintId: 'sprint-1', name: 'S1' }, actorId: USER_ID },
    );
    // `close` accepts an optional actor — absence is null, not a fake id.
    expect(gateway.sendToProject).toHaveBeenNthCalledWith(
      2,
      PROJECT_ID,
      'sprint:closed',
      { payload: { sprintId: 'sprint-1', name: 'S1' }, actorId: null },
    );
  });

  it('swallows a broadcast failure so the outbox does not retry side effects that already ran', () => {
    gateway.sendToProject.mockImplementation(() => {
      throw new Error('adapter down');
    });

    expect(() => listener.onIssueUpdated(withMeta(issueUpdated()))).not.toThrow();
  });
});
