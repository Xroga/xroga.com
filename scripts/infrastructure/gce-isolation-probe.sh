#!/bin/bash
# Synthetic-only disposable VM proof. No customer data, platform secrets or SA.
set -Eeuo pipefail
stage=bootstrap
trap 'printf "XROGA_GCE_ISOLATION_RESULT={\"status\":\"FAIL\",\"stage\":\"%s\"}\n" "$stage" >/dev/console' ERR
export DEBIAN_FRONTEND=noninteractive
mkdir -p /opt/xroga-synthetic
cd /opt/xroga-synthetic
exec > >(tee -a /var/log/xroga-synthetic.log) 2>&1
stage=metadata_identity
token_status=$(curl --silent --max-time 5 --output /dev/null --write-out '%{http_code}' \
  -H 'Metadata-Flavor: Google' http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token)
test "$token_status" = 404
stage=official_runtime_install
apt-get update -qq
apt-get install -y -qq docker.io python3
systemctl start docker
stage=node_image
docker pull node:22.21.1-slim
node_image=$(docker image inspect node:22.21.1-slim --format '{{index .RepoDigests 0}}')
stage=container_isolation
docker run --rm --network none --read-only --tmpfs /tmp:rw,size=64m,mode=1777 \
  --memory 512m --memory-swap 512m --cpus 1 --pids-limit 64 --cap-drop ALL \
  --security-opt no-new-privileges --user 65532:65532 "$node_image" node --input-type=module -e '
import fs from "node:fs";
const denied=async url=>{try{await fetch(url,{headers:{"Metadata-Flavor":"Google"},signal:AbortSignal.timeout(2000)});return false;}catch{return true;}};
let readOnly=false;try{fs.writeFileSync("/etc/xroga-must-deny","x");}catch(e){readOnly=["EROFS","EACCES"].includes(e.code);}
const checks={nonRoot:process.getuid()===65532,readOnly,
 metadataDenied:await denied("http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token"),
 externalNetworkDenied:await denied("https://example.com"),
 noPlatformCredentials:!["SUPABASE_SERVICE_ROLE_KEY","OPENROUTER_API_KEY","GOOGLE_APPLICATION_CREDENTIALS"].some(k=>k in process.env),
 processLimit:fs.readFileSync("/sys/fs/cgroup/pids.max","utf8").trim()==="64",
 memoryLimit:fs.readFileSync("/sys/fs/cgroup/memory.max","utf8").trim()==="536870912"};
console.log(JSON.stringify(checks));if(!Object.values(checks).every(Boolean))process.exit(1);
' >container-checks.json
stage=browser_image
docker pull mcr.microsoft.com/playwright:v1.62.0-noble
browser_image=$(docker image inspect mcr.microsoft.com/playwright:v1.62.0-noble --format '{{index .RepoDigests 0}}')
mkdir -p browser
docker run --rm --network bridge --mount type=bind,src="$PWD/browser",dst=/work \
  --workdir /work "$browser_image" bash -c \
  'npm install --ignore-scripts --no-audit --no-fund playwright@1.62.0'
cat > browser/probe.cjs <<'JAVASCRIPT'
const http=require('node:http');
const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((req,res)=>res.end('<button id="go" onclick="document.body.dataset.result=\'verified\'">Run synthetic action</button>'));
 await new Promise(resolve=>server.listen(3000,'127.0.0.1',resolve));
 let browser;
 try {
  browser=await chromium.launch({headless:true,chromiumSandbox:false});
  const page=await browser.newPage();await page.goto('http://127.0.0.1:3000');
  await page.locator('#go').click();
  const executed=(await page.locator('body').getAttribute('data-result'))==='verified';
  console.log(JSON.stringify({realChromium:!!browser.version(),domActionExecuted:executed,localHttp:true}));
  if(!executed)process.exitCode=1;
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(()=>{console.error('SYNTHETIC_BROWSER_EXECUTION_FAILED');process.exitCode=1;});
JAVASCRIPT
chmod -R a+rX browser
stage=browser_execution
docker run --rm --network none --read-only --tmpfs /tmp:rw,size=256m,mode=1777 \
  --memory 1536m --memory-swap 1536m --cpus 1 --pids-limit 256 --cap-drop ALL \
  --security-opt no-new-privileges --user 65532:65532 --shm-size 256m \
  --env HOME=/tmp --mount type=bind,src="$PWD/browser",dst=/work,readonly \
  --workdir /work "$browser_image" node probe.cjs >browser-checks.json
stage=final_receipt
export XROGA_PROBE_NODE_IMAGE="$node_image" XROGA_PROBE_BROWSER_IMAGE="$browser_image"
python3 - <<'PY'
import json,pathlib,os,datetime
container=json.loads(pathlib.Path('container-checks.json').read_text())
browser=json.loads(pathlib.Path('browser-checks.json').read_text())
assert all(container.values()) and all(browser.values())
receipt={'status':'PASS_SYNTHETIC_GCE_ISOLATION_AND_BROWSER_ONLY','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'attachedServiceAccount':False,'customerDataOrCredentials':False,'container':container,'browser':browser,
 'nodeImage':os.environ['XROGA_PROBE_NODE_IMAGE'],'browserImage':os.environ['XROGA_PROBE_BROWSER_IMAGE'],
 'productionProviderIntegration':'NOT_YET_IMPLEMENTED','interactivePreview':'NOT_YET_VERIFIED'}
with open('/dev/console','w') as stream:stream.write('XROGA_GCE_ISOLATION_RESULT='+json.dumps(receipt,separators=(',',':'))+'\n')
PY
