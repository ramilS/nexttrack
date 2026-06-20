import { CheckpointService } from '../checkpoint/checkpoint.service';
import { SummaryReporter } from '../reporters/summary.reporter';

export interface StatusOptions {
  checkpointFile: string;
}

export class StatusCommand {
  async run(options: StatusOptions): Promise<void> {
    const checkpointService = new CheckpointService(options.checkpointFile);
    const reporter = new SummaryReporter();

    const checkpoint = await checkpointService.load();

    if (!checkpoint) {
      console.log('No checkpoint file found at:', options.checkpointFile);
      process.exit(1);
    }

    reporter.printStatus(checkpoint);
  }
}
