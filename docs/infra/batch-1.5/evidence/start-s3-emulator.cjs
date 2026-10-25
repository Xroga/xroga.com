// SYNTHETIC S3 emulator for the wire test. Not a repo dependency:  mkdir /tmp/s3emu && cd /tmp/s3emu && npm i s3rver@3.7.1
// then: node <this file>   and   export STORAGE_TEST_S3_ENDPOINT=http://127.0.0.1:4569
// Known emulator gaps (so a failure here is never mistaken for an R2 result): no ListParts (405), 500 on truncated ListObjectsV2,
// rejects presigned UploadPart URLs. It is NOT Cloudflare R2 and proves nothing about R2-specific behaviour.
const S3rver = require('/tmp/s3emu/node_modules/s3rver');
require('fs').mkdirSync('/tmp/s3emu/data', { recursive: true });
new S3rver({ port: 4569, address: '127.0.0.1', silent: true, directory: '/tmp/s3emu/data', configureBuckets: [{ name: 'drive-test' }] })
  .run().then(() => console.log('s3rver up'));
