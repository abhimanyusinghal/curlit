# CurlIt CLI

Run the same HTTP and GraphQL collections used in CurlIt's browser and desktop apps from a terminal or CI pipeline. Requires Node.js 22.12 or newer. Requests go directly to the target API; a running CurlIt UI or proxy is not required.

## Build and run

From the repository:

```sh
npm ci
npm run build:cli
node bin/curlit.cjs --help
node bin/curlit.cjs run collection.json --env environment.json --report-json reports/result.json --report-junit reports/result.xml
```

For a global `curlit` command, install the generated standalone package:

```sh
npm install --global ./dist-cli
curlit run collection.json --bail
```

The `dist-cli` package contains the CLI, its script worker, documentation, and license. It depends only on Undici at runtime. It can also be packed with `npm pack ./dist-cli` for installation on another machine. Rebuild before packing after changing source files.

## Collections and environments

In CurlIt, choose **Collections → ... → Export collection**. The CLI accepts that `{ "collections": [...] }` export and a single `{ "name": "...", "requests": [...] }` collection object. If an export contains several collections, pass `--collection NAME_OR_ID`. Empty collections and unsupported WebSocket requests are rejected before execution.

Requests support the same `{{variable}}` placeholders, Basic/Bearer/API-key authentication, SSL verification setting, pre-request scripts, assertions, and `{{chain.name}}` response chaining as the UI. GraphQL uses HTTP POST with the existing query/variables body format. OAuth requests can use a saved access token; the CLI does not launch interactive OAuth flows or refresh tokens. For CI, provide a current token through a Bearer auth variable.

An environment file can be a simple string-valued map:

```json
{
  "baseUrl": "http://127.0.0.1:4010",
  "token": ""
}
```

It can also be a CurlIt environment object with a `variables` array of `{ "key", "value", "enabled" }` entries. Disabled entries are ignored. Overrides are applied after the file, in command-line order:

```sh
curlit run collection.json --env environment.json --var baseUrl=https://staging.example.com --var-from-env token=API_TOKEN
```

`--var` and `--var-from-env` are repeatable. The latter reads an explicitly named process environment variable, so CI secrets do not need to be stored in collection files or passed as literal command-line arguments. An unset process variable is an input error. Chain variables start empty for each run and are shared only between requests in that run.

### File uploads

UI exports contain file metadata, not file contents. To run a binary upload, add `filePath` to `body.binaryFile`. For multipart uploads, add `filePath` to each enabled file entry in `body.formData`. Paths resolve relative to the collection JSON and support environment and chain placeholders. Missing files fail the request explicitly.

```json
{
  "type": "binary",
  "binaryFile": {
    "filePath": "fixtures/payload.bin",
    "fileName": "payload.bin",
    "fileType": "application/octet-stream"
  }
}
```

## Execution and exit codes

| Option | Behavior |
| --- | --- |
| `--bail` / `--stop-on-failure` | Skip remaining requests after the first failure or error |
| `--delay MS` | Delay between requests, from 0 to 60000 ms; default 0 |
| `--timeout-request MS` | Bound the complete network request, including downloading the body; default 30000 ms |
| `--timeout-script MS` | Bound each script's execution; default 1000 ms, maximum 60000 ms |
| `--report-json FILE` | Export a JSON report; parent directories are created |
| `--report-junit FILE` | Export a JUnit XML report |

Without a test script, HTTP 4xx/5xx responses fail the request. With a test script, assertions decide success, allowing tests that deliberately expect error responses. A thrown pre-request/test script, network error, or timeout always produces an errored result. Runs continue by default; `--bail` stops after the first unsuccessful result.

| Exit code | Meaning |
| --- | --- |
| 0 | All requests passed |
| 1 | One or more requests failed, errored, or were skipped |
| 2 | Invalid arguments/input, or reports could not be written |
| 130 | Interrupted with Ctrl+C / SIGINT |
| 143 | Interrupted with SIGTERM |

Interruption cancels the current network request or script, skips remaining requests, and writes any requested partial reports. Scripts use the shared CurlIt assertion engine in a separate worker and VM context, with time and heap limits. Node globals and the process environment are not exposed to scripts. These mechanisms are not a security boundary for hostile JavaScript; run collections from sources you trust.

## Reports

JSON includes the collection name, start time, request totals, durations, HTTP statuses, individual assertions, errors, and skip reasons. JUnit has one test case per request, with failed assertions in the failure detail and network/script problems represented as errors. Case names include their position so identically named requests remain distinct in CI. Counts in the summary and JUnit suite are request counts.

Reports omit request URLs, headers, credentials, response bodies, chain variables, and console logs. Request/test names and assertion error messages are included, so those fields should not embed secrets.

In the UI, run a collection and use **Export report → JSON / JUnit XML**. Both interfaces use the same report format. A new run clears the previous report.

## GitHub Actions

The repository includes `examples/ci/collection.json`, `examples/ci/environment.json`, and a local fixture server. The **CLI CI** workflow builds and tests the CLI on Linux and Windows, then runs that sample collection and uploads both reports even when a run fails.

For a pipeline checking an existing API, build the CLI and replace the fixture paths with your exported collection and environment:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: npm
- run: npm ci
- run: npm run build:cli
- name: Run API tests
  env:
    API_TOKEN: ${{ secrets.API_TOKEN }}
  run: >-
    node bin/curlit.cjs run tests/api/collection.json
    --env tests/api/environment.json
    --var-from-env token=API_TOKEN
    --report-json reports/result.json
    --report-junit reports/result.xml
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: api-test-reports
    path: reports/
```
