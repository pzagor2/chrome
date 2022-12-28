import { mkdir } from 'fs/promises';
import path from 'path';
import fs from 'fs';

import { noop } from 'lodash';
import { Page } from 'puppeteer';
import rimraf from 'rimraf';

import { WORKSPACE_DIR } from '../config';
import { id, getCDPClient, readdir, sleep } from '../utils';

export const before = async ({ page }: { page: Page }) => {
  const downloadPath = path.join(
    WORKSPACE_DIR,
    `.browserless.download.${id()}`,
  );
  await mkdir(downloadPath);
  const client = getCDPClient(page);
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath,
  });

  return { downloadPath };
};

export const after = async ({
  downloadPath,
  debug,
  res,
  req,
  done,
}: {
  downloadPath: string;
  debug: (...args: string[]) => any;
  res: any;
  req: any;
  done: (errBack?: Error | null) => any;
}) => {
  debug(`Waiting for download to finish in ${downloadPath}`);

  async function checkIfDownloadComplete(): Promise<string | null> {
    if (res.headersSent) {
      return null;
    }
    const [fileName] = await readdir(downloadPath);
    if (!fileName || fileName.endsWith('.crdownload')) {
      await sleep(500);
      return checkIfDownloadComplete();
    }

    debug(`All files have finished downloading`);

    return path.join(downloadPath, fileName);
  }

  const filePath = await checkIfDownloadComplete();

  if (res.headersSent || !filePath) {
    rimraf(downloadPath, noop);
    return done();
  }

  if (req.header('Transfer-Encoding') === 'chunked') {
    const fileStream = fs.createReadStream(filePath);
    res.setHeader('Content-Type', 'video/webm');
    fileStream.on('error', function (err) {
      debug(`Error streaming file back ${err}`);
      done(err);
    });

    fileStream.on('finish', function () {
      debug('File sent successfully');
      done(null);
    });
    return fileStream.pipe(res);
  } else {
    return res.sendFile(filePath, (err: Error) => {
      const message = err
        ? `Error streaming file back ${err}`
        : `File sent successfully`;

      debug(message);
      rimraf(filePath, noop);
    });
  }
};
