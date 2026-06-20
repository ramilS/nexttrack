import cliProgress from 'cli-progress';
import chalk from 'chalk';

export class ProgressReporter {
  private verbose: boolean;

  constructor(options: { verbose?: boolean }) {
    this.verbose = options.verbose ?? false;
  }

  createBar(label: string, format?: string): cliProgress.SingleBar {
    const bar = new cliProgress.SingleBar(
      {
        format: format ?? `  ${label} [{bar}] {value}/{total} {percentage}% | ETA: {eta}s`,
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic,
    );
    return bar;
  }

  info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  }

  warn(message: string): void {
    console.log(chalk.yellow('⚠'), message);
  }

  error(message: string): void {
    console.log(chalk.red('✖'), message);
  }

  done(message: string): void {
    console.log(chalk.green('✔'), message);
  }

  skip(message: string): void {
    console.log(chalk.gray('⏭'), message);
  }

  log(message: string): void {
    if (this.verbose) {
      console.log(chalk.gray('  '), message);
    }
  }

  header(title: string): void {
    console.log('');
    console.log(chalk.bold(title));
    console.log(chalk.gray('─'.repeat(50)));
  }

  section(step: number, total: number, title: string): void {
    console.log('');
    console.log(chalk.bold(`[${step}/${total}] ${title}`));
  }
}
