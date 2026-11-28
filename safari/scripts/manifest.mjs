// Safari판 manifest: 크롬판 manifest.json 에서 만든다 (같은 확장 코드).
// Safari 에 없는 것(tabCapture · offscreen · ⌥L 음성 번역 단축키)을 빼고, 담는 맥 앱과 말하는 nativeMessaging 을 넣는다.
//   node safari/scripts/manifest.mjs <manifest.json> <out.json> [version]
import { readFileSync, writeFileSync } from 'node:fs';

export const SAFARI_DESCRIPTION = 'F1 TV·YouTube·강의 영상의 영어 자막을 Claude·Gemini·맥 번역으로 한국어 자막으로 영상 위에 보여 준다 (Safari · macOS)';

export function safariManifest(src, version) {
  const m = structuredClone(src);
  m.description = SAFARI_DESCRIPTION;
  if (version) m.version = version;
  m.permissions = [...new Set([...(m.permissions || []).filter(p => !['tabCapture', 'offscreen'].includes(p)), 'nativeMessaging'])];
  delete m.commands;               // ⌥L 은 음성 번역(크롬판만)
  delete m.minimum_chrome_version;
  m.browser_specific_settings = { safari: { strict_min_version: '18.0' } };
  return m;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [, , input, output, version] = process.argv;
  writeFileSync(output, JSON.stringify(safariManifest(JSON.parse(readFileSync(input, 'utf8')), version), null, 2) + '\n');
}
