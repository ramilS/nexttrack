import chalk from 'chalk';
import { YouTrackClient } from '../youtrack/youtrack-client';
import { OurApiClient } from '../loaders/api-client';
import { IssuesExtractor } from '../extractors/issues.extractor';

export interface VerifyOptions {
  sourceUrl: string;
  sourceToken: string;
  targetUrl: string;
  targetToken: string;
  migrationSecret: string;
  projects: string[];
  rateLimit: number;
}

export class VerifyCommand {
  async run(options: VerifyOptions): Promise<void> {
    const yt = new YouTrackClient({
      url: options.sourceUrl,
      token: options.sourceToken,
      rateLimit: options.rateLimit,
    });

    const api = new OurApiClient({
      url: options.targetUrl,
      token: options.targetToken,
      migrationSecret: options.migrationSecret,
    });

    const issuesExtractor = new IssuesExtractor(yt);

    console.log('');
    console.log(chalk.bold('Verification Report'));
    console.log(chalk.gray('─'.repeat(50)));

    for (const projectKey of options.projects) {
      // Count issues in YouTrack
      let ytIssueCount = 0;
      for await (const batch of issuesExtractor.extract(projectKey, {
        withClosedIssues: true,
        batchSize: 100,
      })) {
        ytIssueCount += batch.length;
      }

      // Get counts from our API
      let ourStats;
      try {
        ourStats = await api.getProjectStats(projectKey);
      } catch {
        console.log(chalk.red(`  Project ${projectKey}: not found in target system`));
        continue;
      }

      console.log(`\nProject ${chalk.bold(projectKey)}:`);

      const issuesDelta = ourStats.counts.issues - ytIssueCount;
      const issuesStatus = issuesDelta === 0 ? chalk.green('OK') : chalk.yellow(`delta: ${issuesDelta}`);
      console.log(
        `  Issues:      YouTrack ${ytIssueCount} / Ours ${ourStats.counts.issues}  ${issuesStatus}`,
      );
      console.log(
        `  Comments:    Ours ${ourStats.counts.comments}`,
      );
      console.log(
        `  Attachments: Ours ${ourStats.counts.attachments}`,
      );
      console.log(
        `  Time Logs:   Ours ${ourStats.counts.timeLogs}`,
      );
    }

    console.log('');
  }
}
