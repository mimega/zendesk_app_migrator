import "es6-promise/auto";
import * as fs from "fs";
import * as path from "path";
import * as chalk from "chalk";
import * as memFs from "mem-fs";
import * as fsEditor from "mem-fs-editor";
import * as emoji from "node-emoji";
import * as ProgressBar from "progress";
import { List, Map } from "immutable";

// This monkeypatch is necessary for for–await-of to work in Typescript v2.4+
(Symbol as any).asyncIterator =
  Symbol.asyncIterator || Symbol.for("Symbol.asyncIterator");

class Migrator {
  protected progressBar: ProgressBar;

  static tmpDir = path.resolve(__dirname, "../tmp");

  static steps: List<string> = List([
    "correct_version",
    "marketing_only",
    "requirements_only",

    "setup_app_scaffold",
    "setup_npm_offline_cache",

    "migrate_common_js",
    "migrate_app_js",
    "migrate_app_css",
    "migrate_templates",
    "migrate_translations",
    "migrate_images",
    "migrate_manifest",

    "commit_changes",

    "run_scripts"
  ]);

  constructor() {
    this.progressBar = new ProgressBar(
      ` [:bar] ${chalk.bold(":current/:total")} steps complete`,
      {
        total: Migrator.steps.size - 1, // FIXME: run_scripts has it's own output
        complete: chalk.bold.green("="),
        incomplete: chalk.green("-"),
        width: 20
      }
    );
  }

  protected async *perform(options: Map<string, any>) {
    // FIXME: Having to type the iterable as <any> is ugly
    // work out why there is a type incompatibility with the iterator
    for (const stepName of <any>Migrator.steps) {
      options = options.set("step", stepName);
      // console.log(chalk.bold.gray.underline(`Starting step: ${stepName}`));
      // FIXME: Work out why dynamic imports aren't working in the downlevel
      // https://blogs.msdn.microsoft.com/typescript/2017/06/27/announcing-typescript-2-4/
      const step = require(`./steps/${stepName}`).default;
      // const step = await import(`./steps/${stepName}`);
      const newOptions = await step(options);
      options = options.merge(newOptions);
      yield options;
    }
  }

  static async migrate({ path: src }) {
    // Create a new unique dir under `./tmp/` for migration
    const dest: string = fs.mkdtempSync(path.join(Migrator.tmpDir, path.sep));
    src = path.resolve(__dirname, src);
    // Log out the `src` and `dest` paths for developer reference
    console.log(chalk.yellow(`App will be migrated from: ${src}`));
    console.log(chalk.yellow(`App will be migrated to: ${dest}`));
    // Create an in-memory file system for app source
    const store = memFs.create();
    const editor = fsEditor.create(store);
    // Make a new instance of the Migrator
    const migratr: Migrator = new Migrator();
    // Create options to be passed through steps
    const options: Map<string, any> = Map({
      editor,
      src,
      dest
    });
    // Iterate asynchronously through the steps,
    // passing the resulting options object from each step
    // into the next step
    try {
      for await (const newOptions of migratr.perform(options)) {
        if (!migratr.progressBar.complete) migratr.progressBar.tick();
      }
      console.log(
        chalk.bold.green(emoji.emojify("Finished all steps! :rocket:"))
      );
    } catch (err) {
      migratr.progressBar.interrupt(chalk.bold.red(err.message));
      throw err;
    }
  }
}

export default Migrator;