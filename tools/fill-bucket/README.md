# Fill Bucket Test Data

Creates many tiny files in an S3/OBS bucket for pagination tests.

## Example

```powershell
node tools/fill-bucket/fill-bucket.js `
  --ak "YOUR_AK" `
  --sk "YOUR_SK" `
  --server "obs.ru-moscow-1.hc.sbercloud.ru" `
  --bucket "test-obs-ag" `
  --prefix "pagination-test" `
  --count 1000
```

The script creates objects like:

```text
pagination-test/file-0001.txt
pagination-test/file-0002.txt
...
```

Each object body is exactly 1 byte.

## Options

- `--prefix folder/path` uploads into a folder/prefix. Omit it for bucket root.
- `--count 1000` controls how many files to create.
- `--concurrency 20` controls parallel uploads.
- `--region ru-moscow-1` overrides region inference.
- `--path-style` switches from virtual-host addressing to path-style addressing.

You can also use the root `.env` file or environment variables: `S3_AK`, `S3_SK`, `S3_SERVER`, `S3_BUCKET`, `S3_PREFIX`, `S3_REGION`, `S3_COUNT`, `S3_CONCURRENCY`.

With `.env` filled in, the short command is:

```powershell
node tools/fill-bucket/fill-bucket.js
```
