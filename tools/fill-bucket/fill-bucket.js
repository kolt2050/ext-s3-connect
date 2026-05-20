#!/usr/bin/env node
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_COUNT = 1000;
const DEFAULT_CONCURRENCY = 20;
const ENV_FILE = ".env";

function loadDotEnv(filePath = resolve(process.cwd(), ENV_FILE)) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }

    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function usage() {
  return `
Usage:
  node tools/fill-bucket/fill-bucket.js --ak <AK> --sk <SK> --server <host> --bucket <bucket> [options]

Options:
  --prefix <folder/path>   Folder/prefix inside the bucket. Example: test/page-1
  --count <number>         Number of files to create. Default: ${DEFAULT_COUNT}
  --concurrency <number>   Parallel uploads. Default: ${DEFAULT_CONCURRENCY}
  --region <region>        Signature region. Default: inferred from obs.<region>.* or us-east-1
  --path-style             Use path-style addressing instead of virtual-host style
  --help                   Show this help

Environment fallbacks:
  S3_AK, S3_SK, S3_SERVER, S3_BUCKET, S3_PREFIX, S3_REGION, S3_COUNT, S3_CONCURRENCY
`.trim();
}

function normalizePrefix(prefix = "") {
  const clean = prefix.replace(/^\/+|\/+$/g, "");
  return clean ? `${clean}/` : "";
}

function inferRegion(serverAddress) {
  const match = serverAddress.match(/^obs\.([a-z0-9-]+)\./i);
  return match?.[1] || "us-east-1";
}

function requireValue(value, name) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const current = items[cursor];
      cursor += 1;
      await worker(current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
}

async function main() {
  loadDotEnv();

  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const accessKeyId = requireValue(args.ak || process.env.S3_AK, "AK");
  const secretAccessKey = requireValue(args.sk || process.env.S3_SK, "SK");
  const serverAddress = requireValue(args.server || process.env.S3_SERVER, "Server address")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const bucket = requireValue(args.bucket || process.env.S3_BUCKET, "Bucket");
  const prefix = normalizePrefix(args.prefix || process.env.S3_PREFIX || "");
  const count = Number(args.count || process.env.S3_COUNT || DEFAULT_COUNT);
  const concurrency = Number(args.concurrency || process.env.S3_CONCURRENCY || DEFAULT_CONCURRENCY);
  const region = args.region || process.env.S3_REGION || inferRegion(serverAddress);

  if (!Number.isInteger(count) || count < 1) {
    throw new Error("--count must be a positive integer");
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("--concurrency must be a positive integer");
  }

  const client = new S3Client({
    region,
    endpoint: `https://${serverAddress}`,
    forcePathStyle: Boolean(args["path-style"]),
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const keys = Array.from({ length: count }, (_, index) => {
    const fileNumber = String(index + 1).padStart(String(count).length, "0");
    return `${prefix}file-${fileNumber}.txt`;
  });

  let uploaded = 0;
  console.log(`Uploading ${count} one-byte files to obs://${bucket}/${prefix}`);
  console.log(`Endpoint: https://${serverAddress}, region: ${region}`);

  await runPool(keys, concurrency, async (key) => {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: "x",
        ContentType: "text/plain",
      }),
    );

    uploaded += 1;
    if (uploaded % 100 === 0 || uploaded === count) {
      console.log(`Uploaded ${uploaded}/${count}`);
    }
  });

  console.log("Done");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
