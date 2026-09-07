import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * 문서가 가리키는 저장소 파일이 실제로 있는지 검사한다.
 * 파일을 지우거나 옮긴 PR에서 낡은 문서가 그 자리에서 드러나게 하는 장치다.
 */

const TARGET_DIRS = [".claude/skills", "docs"];
const TARGET_FILES = ["AGENTS.md", "README.md"];
// `docs/sdlc/`는 승인 시점의 기록이라 이후 코드가 바뀌어도 그대로 둔다.
// 지금 상태를 설명하는 문서만 검사한다.
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "sdlc"]);

// 백틱 안의 경로 중 디렉터리 구분자와 확장자를 가진 것만 검사한다.
// `bun run lint` 같은 명령이나 `types.ts` 같은 이름 예시는 대상이 아니다.
const PATH_PATTERN =
  /`([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._*-]+)+\.[A-Za-z]{2,4})`/g;

async function collectMarkdown(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await collectMarkdown(path)));
    else if (entry.name.endsWith(".md")) found.push(path);
  }
  return found;
}

const files = [
  ...TARGET_FILES.filter((file) => existsSync(file)),
  ...(await Promise.all(TARGET_DIRS.map(collectMarkdown))).flat(),
];

const problems: string[] = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    for (const match of line.matchAll(PATH_PATTERN)) {
      const path = match[1];
      if (path === undefined) continue;
      // 와일드카드는 규칙 표기이므로 앞쪽 디렉터리만 확인한다.
      const target = path.includes("*") ? path.split("*")[0] : path;
      if (target === undefined || target === "") continue;
      // 저장소 루트 기준과 문서 위치 기준 둘 다 허용한다.
      const relative = join(dirname(file), target);
      if (!existsSync(target) && !existsSync(relative)) {
        problems.push(`${file}:${index + 1}  ${path}`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error("문서가 가리키는 경로를 찾지 못했습니다:\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    "\n파일을 옮겼거나 지웠다면 문서를 함께 고치세요. " +
      "이름 예시라면 백틱 대신 다른 표기를 쓰세요.",
  );
  process.exit(1);
}

console.log(`문서 ${files.length}개의 경로 참조를 확인했습니다.`);
