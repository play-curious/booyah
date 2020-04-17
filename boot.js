const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const cp = require("child_process");

const projectFolderPath = path.resolve(__dirname, "../");
const projectFilesPath = path.resolve(__dirname, "./project_files/");

async function copy(source, target) {
  const resolvedTarget = (await fsp.lstat(target)).isDirectory()
    ? path.join(target, path.basename(source))
    : target;
  const file = await fsp.readFile(source);
  await fsp.writeFile(resolvedTarget, file);
  console.log("*", source);
}

async function copyDir(source, target) {
  if (!(await fs.existsSync(target))) await fsp.mkdir(target);
  if ((await fsp.lstat(source)).isDirectory()) {
    const files = await fsp.readdir(source);
    for (const file of files) {
      const filePath = path.join(source, file);
      if ((await fsp.lstat(filePath)).isDirectory())
        await copyDir(filePath, path.join(target, path.basename(filePath)));
      else await copy(filePath, target);
    }
  } else throw Error("given source is'nt a directory");
}

async function installDependencies() {
  const include = (await fs.existsSync(
    path.join(projectFolderPath, "package.json")
  ))
    ? ""
    : "npm init -y &&";
  const event = cp.exec(`cd ${projectFolderPath} && ${include} npm install`);
  return new Promise((resolve, reject) => {
    event.stdout.on("data", (data) => {
      const log = data.toString().trim();
      if (log.length > 0) console.log(log);
    });
    event.once("error", reject);
    event.once("exit", resolve);
  });
}

async function waitResponse(query) {
  process.stdin.resume();
  process.stdout.write(query);
  const response = await new Promise((resolve) => {
    process.stdin.once("data", resolve);
  }).then((data) => data.toString().trim());
  process.stdin.pause();
  return response;
}

(async () => {
  console.group("Check project folder...");
  try {
    const files = await fsp.readdir(projectFolderPath);
    if (files.length > 1) {
      console.warn(
        `The current project folder is not empty (${projectFolderPath})\n${files
          .map((file) => `* ${file}`)
          .join("\n")}`
      );
      const response = await waitResponse(
        "are you sure you want to continue copying the files into it? [y]"
      );
      console.groupEnd();
      if (!/y/i.test(response))
        return console.error("Bootstrapping was aborted");
      else console.log("Checking of project folder successful");
    }
  } catch (e) {
    console.groupEnd();
    console.error("Checking of project folder failed");
    throw e;
  }
  console.group("File copying...");
  try {
    await copyDir(projectFilesPath, projectFolderPath);
    console.groupEnd();
    console.log("File copying successful");
  } catch (e) {
    console.groupEnd();
    console.error("File copying failed");
    throw e;
  }
  console.group(
    "Dependencies installation...",
    "(this operation can last 1 or 2 minutes)"
  );
  try {
    await installDependencies();
    console.groupEnd();
    console.log("Dependencies installation successful");
  } catch (e) {
    console.groupEnd();
    console.error("Dependencies installation failed");
    throw e;
  }
  console.warn(
    "\n---\nGo to",
    "https://github.com/play-curious/booyah/blob/master/README.md#production",
    "for the rest of the guide.\n---"
  );
})();
