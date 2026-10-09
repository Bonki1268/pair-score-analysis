import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/**
 * 解析器版本：解析器原始碼與 xlsx 套件版本的雜湊。
 * 任何一個檔案改了，瀏覽器裡已存的賽事就會在下次開啟時用保存的原始檔重新解析。
 */
function parserVersion(): string {
  const files = [
    ...readdirSync('src/parsers').filter((f) => f.endsWith('.ts')).map((f) => `src/parsers/${f}`),
    'src/engine/butler.ts',
    'src/model/types.ts',
  ].sort();
  const hash = createHash('sha256');
  for (const f of files) hash.update(f).update(readFileSync(f));
  hash.update(JSON.parse(readFileSync('package.json', 'utf8')).dependencies.xlsx);
  return hash.digest('hex').slice(0, 12);
}

export default defineConfig({
  base: './',
  define: {
    __PARSER_VERSION__: JSON.stringify(parserVersion()),
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
