export const DOC_GEN_QUEUE = 'ai-doc-suggestions';

export interface DocGenJobData {
  sourceIssueId: string;
  projectId: string;
  /** The user who resolved the source issue — becomes the doc-update issue's reporter. */
  userId: string;
}
