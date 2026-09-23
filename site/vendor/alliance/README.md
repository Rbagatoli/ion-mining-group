# Alliance homepage globe renderer

Copied from the user-provided `alliance-freight-tms/website/public/js/` source on 2026-09-22.

## Verified upstream releases

The supplied scripts match these official npm release files after trimming outer whitespace. The runtime and shaders were not upgraded to another version.

| Local file | Verified release | Official package source | License |
| --- | --- | --- | --- |
| `cobe.esm.js` | COBE 0.6.1 | [npm release archive](https://registry.npmjs.org/cobe/-/cobe-0.6.1.tgz), `package/dist/index.esm.js` | [COBE.LICENSE](COBE.LICENSE), MIT, copyright 2021 Shu Ding |
| `phenomenon.mjs` | Phenomenon 1.6.0 | [npm release archive](https://registry.npmjs.org/phenomenon/-/phenomenon-1.6.0.tgz), `package/dist/phenomenon.mjs` | [PHENOMENON.LICENSE](PHENOMENON.LICENSE), MIT, copyright 2019 Colin van Eenige |

Both license files were copied byte-for-byte from `package/LICENSE` in their matching releases. Upstream repositories: [shuding/cobe](https://github.com/shuding/cobe) and [vaneenige/phenomenon](https://github.com/vaneenige/phenomenon).

The separate, unused Alliance `js/globe.js` references COBE 2.0.0; that import is not the version of the local script loaded by the supplied homepage.

SHA-256 of the original package scripts after trimming outer whitespace:

- COBE: `6d9201bbd8cf40d628a2ab6f2e88e712c6d5f64e4c271b8d266afd4219ccf8d8`
- Phenomenon: `d7fa67b6edf86ca47312cb66cd736f089d7457c4af93ab2423a8213f64dcae4c`

## Local changes

- `cobe.esm.js`: Original COBE shader, geometry, embedded map, settings interface and marker rendering are unchanged. The bare Phenomenon import now resolves locally. Optional `onReady`/`onError` callbacks notify the wrapper when the embedded land bitmap finishes loading so a reduced-motion view can render once without an idle animation loop. A late bitmap load is ignored after disposal.
- `phenomenon.mjs`: Original rendering math is unchanged. The resize callback and animation frame ID are retained so `toggle(false)` and `destroy()` can release scheduled work and the resize listener. Destruction is idempotent.

Preserve the accompanying upstream notices when redistributing these files.
