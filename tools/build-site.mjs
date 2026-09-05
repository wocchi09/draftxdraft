/**
 * 公開用のファイルだけを dist/ に集める。
 *
 * ビルドと呼べるほどのことはしていない（変換も圧縮もしない）。
 * 目的は「配信するものを明示する」こと。リポジトリ直下をそのまま
 * 配信対象にすると、ホスティング側がビルド中に作る node_modules や、
 * データ生成用の道具・素材まで巻き込まれる。
 */
import { cp, mkdir, rm, readdir, stat } from "node:fs/promises";
import path from "node:path";

/** 丸ごと持っていくもの */
const DIRS = ["src", "styles", "assets"];
/** 単体で持っていくもの */
const FILES = ["index.html", "terms.html", "privacy.html", "_headers"];
/** data/ からはJSONだけ。data/_raw（Wikipediaの素材）は要らない */
const DATA_GLOB = /\.json$/;

const OUT = "dist";

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const dir of DIRS) {
  await cp(dir, path.join(OUT, dir), { recursive: true });
}
for (const file of FILES) {
  await cp(file, path.join(OUT, file));
}

await mkdir(path.join(OUT, "data"), { recursive: true });
for (const name of await readdir("data")) {
  if (!DATA_GLOB.test(name)) continue;
  await cp(path.join("data", name), path.join(OUT, "data", name));
}

// 何を出したかを数えて出す。取りこぼしに気づけるように。
async function walk(dir) {
  let files = 0;
  let bytes = 0;
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    const info = await stat(full);
    if (info.isDirectory()) {
      const sub = await walk(full);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += info.size;
    }
  }
  return { files, bytes };
}

const { files, bytes } = await walk(OUT);
console.log(`${OUT}/ に ${files} ファイル / ${(bytes / 1024 / 1024).toFixed(1)}MB を出力した`);
