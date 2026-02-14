class Logger {
  constructor(chalk, verbose = true) {
    this.chalk = chalk;
    this.verbose = verbose;
  }

  explain(message) {
    if (this.verbose) {
      console.log(this.chalk.gray(message));
    }
  }

  info(message) {
    console.log(this.chalk.blue('ℹ ') + message);
  }

  success(message) {
    console.log(this.chalk.green('✓ ') + message);
  }

  warning(message) {
    console.log(this.chalk.yellow('⚠ ') + message);
  }

  error(message) {
    console.log(this.chalk.red('✗ ') + message);
  }

  header(message) {
    console.log();
    console.log(this.chalk.bold.cyan('━'.repeat(60)));
    console.log(this.chalk.bold.cyan(`  ${message}`));
    console.log(this.chalk.bold.cyan('━'.repeat(60)));
    console.log();
  }

  section(message) {
    console.log();
    console.log(this.chalk.bold.magenta(`▸ ${message}`));
    console.log(this.chalk.gray('─'.repeat(50)));
  }

  step(step, total, message) {
    const progress = `[${step}/${total}]`;
    console.log();
    console.log(this.chalk.cyan(progress) + ' ' + this.chalk.bold(message));
  }
}

module.exports = Logger;
