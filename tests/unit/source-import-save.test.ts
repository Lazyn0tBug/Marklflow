import {it, expect, vi} from 'vitest';
import {
  SourceImport,
  type SourceImportPorts,
  type ImportFile,
} from '../../src/application/workspace/sourceImport';
import {saveSource} from '../../src/application/workspace/sourceSave';
import {DocumentSessions} from '../../src/application/sessions/documentSessions';
import {createNewDocument} from '../../src/core/storage/storage';
import {readSourceFile} from '../../src/core/platform/web/sourceImport';
import {IMPORT_BYTE_LIMIT} from '../../src/core/model/limits';
import type {DocumentRecord} from '../../src/core/model/document';
const file = (name: string, size = 1) => ({name, size});
function setup() {
  const docs: DocumentRecord[] = [],
    order: string[] = [],
    released: string[] = [];
  const ports: SourceImportPorts<ImportFile> = {
    read: async (input) => {
      order.push(input.name);
      return input.name;
    },
    decodeHtml: () => null,
    createMarkdown: (name, content) => ({...createNewDocument(name), markdown: content}),
    verify: async () => {},
    documentKey: async (_file, name, content) => name + content,
    open: async (doc) => {
      docs.push(doc);
      return {status: 'opened'};
    },
    boundSelection: async () => undefined,
    release: async (input) => {
      released.push(input.name);
    },
  };
  return {ports, docs, order, released};
}
/**
 * **上一批没走完 ⇒ ⇒ 这一批不用** ✓ ⇒ ⇒ 原生侧已经为它签发了句柄 ✓ ⇒ ⇒ 放掉 ✓
 * ⇒ ⇒ 原生侧不留无主的凭据 ✓（§5.1 ✓、M4-5 ✓）。
 */
it('keeps one import batch busy and processes the selected files serially', async () => {
  const {ports, order, released} = setup();
  let release: (value: string) => void = () => {};
  ports.read = vi.fn((input) => {
    order.push(input.name);
    return input.name === 'first.md'
      ? new Promise<string>((resolve) => {
          release = resolve;
        })
      : Promise.resolve('second');
  });
  const service = new SourceImport(ports),
    run = service.run([file('first.md'), file('second.md')]);
  expect(service.busy).toBe(true);
  expect(await service.run([file('extra.md')])).toEqual({status: 'busy'});
  expect(order).toEqual(['first.md']);
  expect(released).toEqual(['extra.md']);
  release('first');
  expect((await run).status).toBe('completed');
  expect(order).toEqual(['first.md', 'second.md']);
  expect(service.busy).toBe(false);
});
it('reports per-file read failures and continues a mixed batch without opening the failed item', async () => {
  const {ports, docs} = setup();
  ports.read = async (input) => {
    if (input.name === 'broken.md') throw new Error('read failed');
    return 'ok';
  };
  const result = await new SourceImport(ports).run([file('broken.md'), file('good.md')]);
  expect(result.status === 'completed' && result.items.map((item) => item.status)).toEqual([
    'failed',
    'opened',
  ]);
  expect(docs.map((doc) => doc.meta.title)).toEqual(['good.md']);
});
it('rejects unsupported extensions before reading', async () => {
  const {ports} = setup();
  ports.read = vi.fn();
  const result = await new SourceImport(ports).run([file('bad.pdf')]);
  expect(ports.read).not.toHaveBeenCalled();
  expect(
    result.status === 'completed' && result.items.every((item) => item.status === 'failed'),
  ).toBe(true);
});
it('accepts empty Markdown and reuses its source identity on a repeated open', async () => {
  const {ports, docs} = setup();
  ports.read = async () => '';
  const service = new SourceImport(ports);
  await service.run([file('empty.MD', 0)]);
  await service.run([file('empty.MD', 0)]);
  expect(docs[0]?.markdown).toBe('');
  expect(docs[1]?.id).toBe(docs[0]?.id);
});
it('never opens invalid HTML, invalid source records or corrupt assets', async () => {
  const {ports, docs} = setup();
  const service = new SourceImport(ports);
  expect((await service.run([file('bad.html')])).status).toBe('completed');
  ports.decodeHtml = () => ({...createNewDocument(), revision: Number.MAX_SAFE_INTEGER + 1});
  await service.run([file('bad.htm')]);
  ports.decodeHtml = () => createNewDocument();
  ports.verify = async () => {
    throw new Error('asset hash mismatch');
  };
  await service.run([file('bad.html')]);
  expect(docs).toHaveLength(0);
});
it('focuses the document an identity is already bound to instead of opening a second one', async () => {
  const {ports, docs, order, released} = setup();
  ports.boundSelection = async () => ({documentId: 'bound-doc', target: 'ready'});
  const result = await new SourceImport(ports).run([file('same.md')]);
  expect(result.status === 'completed' && result.items[0]?.status).toBe('focused');
  expect(result.status === 'completed' && result.items[0]?.documentId).toBe('bound-doc'); // **不新建、不覆盖** ✓ ⇒ ⇒ 没有读、没有开 ✓。
  expect(docs).toHaveLength(0);
  expect(order).toEqual([]);
  expect(released).toEqual(['same.md']);
});
it('says the file changed on disk instead of overwriting the draft quietly', async () => {
  const {ports, docs, order, released} = setup();
  ports.boundSelection = async () => ({documentId: 'bound-doc', target: 'changed'});
  const result = await new SourceImport(ports).run([file('changed.md')]);
  expect(result.status === 'completed' && result.items[0]?.status).toBe('changed');
  expect(result.status === 'completed' && result.items[0]?.documentId).toBe('bound-doc'); // **不静默覆盖** ✓ ⇒ ⇒ 草稿一个字没动 ✓。
  expect(docs).toHaveLength(0);
  expect(order).toEqual([]);
  expect(released).toEqual(['changed.md']);
});
it('says the file is gone instead of saying it changed', async () => {
  const {ports, docs, order, released} = setup();
  ports.boundSelection = async () => ({documentId: 'bound-doc', target: 'missing'});
  const result = await new SourceImport(ports).run([file('gone.md')]);
  const item = result.status === 'completed' ? result.items[0] : undefined;
  // **目标没了 ⇒ ⇒ 那是另一件事** ✓ ⇒ ⇒ **说另一句话** ✓ ⇒ ⇒
  // **不让用户去重载一个不存在的文件** ✓（§8.5 ✓）。
  expect(item?.status).toBe('missing');
  expect(item?.message).toContain('已经不在了');
  expect(item?.message).not.toContain('已变化');
  // **还是聚焦那个文档** ✓ ⇒ ⇒ 草稿一个字没动 ✓。
  expect(item?.documentId).toBe('bound-doc');
  expect(docs).toHaveLength(0);
  expect(order).toEqual([]);
  expect(released).toEqual(['gone.md']);
});
it('releases the grant of an item it could not open, and keeps the one it opened', async () => {
  const {ports, released} = setup();
  ports.read = async (input) => {
    if (input.name === 'broken.md') throw new Error('read failed');
    return 'ok';
  };
  const result = await new SourceImport(ports).run([file('broken.md'), file('good.md')]);
  expect(result.status === 'completed' && result.items.map((item) => item.status)).toEqual([
    'failed',
    'opened',
  ]); // **失败项的授权释放** ✓ ⇒ ⇒ 打开成功的那一项不释放 ✓ ⇒ ⇒ 那个授权是绑定的命脉 ✓。
  expect(released).toEqual(['broken.md']);
});
it('releases import busy after a rejected write and permits an explicit retry', async () => {
  const {ports} = setup();
  ports.open = vi
    .fn()
    .mockRejectedValueOnce(new Error('storage failed'))
    .mockResolvedValue({status: 'opened'});
  const service = new SourceImport(ports);
  const failed = await service.run([file('retry.md')]);
  expect(failed.status === 'completed' && failed.items[0]?.status).toBe('failed');
  expect(service.busy).toBe(false);
  const success = await service.run([file('retry.md')]);
  expect(success.status === 'completed' && success.items[0]?.status).toBe('opened');
});
it('freezes source save input and marks only its document while another Tab is active', async () => {
  const sessions = new DocumentSessions(),
    a = createNewDocument('A'),
    b = createNewDocument('B');
  sessions.open(a, true);
  sessions.open(b, true);
  let finish: () => void = () => {};
  let stored: DocumentRecord | undefined;
  const run = saveSource(sessions, a, async (doc) => {
    stored = doc;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  a.markdown = 'caller mutation';
  finish();
  expect(await run).toEqual({documentId: a.id, revision: 1, markedSaved: true});
  expect(stored?.markdown).not.toBe('caller mutation');
  expect(sessions.read(b.id).dirty).toBe(true);
  expect(sessions.activeDocumentId).toBe(b.id);
});
it('does not let a late source save clear a newer document revision', async () => {
  const sessions = new DocumentSessions(),
    a = createNewDocument('A');
  sessions.open(a, true);
  let finish: () => void = () => {};
  const run = saveSource(
    sessions,
    a,
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  sessions.update({...a, revision: 2, markdown: 'new revision'});
  finish();
  expect((await run).markedSaved).toBe(false);
  expect(sessions.read(a.id).dirty).toBe(true);
});
it('retains dirty state on storage rejection and ignores saves for a closed session', async () => {
  const sessions = new DocumentSessions(),
    a = createNewDocument();
  sessions.open(a, true);
  await expect(
    saveSource(sessions, a, async () => {
      throw new Error('disk');
    }),
  ).rejects.toThrow('disk');
  expect(sessions.read(a.id).dirty).toBe(true);
  let finish: () => void = () => {};
  const run = saveSource(
    sessions,
    a,
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  sessions.close(a.id, true);
  finish();
  expect((await run).markedSaved).toBe(false);
});
it('reads browser UTF-8 files, including an empty file, without a server', async () => {
  expect(await readSourceFile(new File(['中文\r\n'], 'source.md'))).toBe('中文\r\n');
  expect(await readSourceFile(new File([], 'empty.md'))).toBe('');
});
it('rejects malformed UTF-8 rather than silently replacing source bytes', async () => {
  await expect(readSourceFile(new File([new Uint8Array([0xff])], 'invalid.md'))).rejects.toThrow(
    'UTF-8',
  );
});
it('refuses a file over the import limit and says how much the limit is', async () => {
  // **上限由 Web 侧自己守** ✓ ⇒ ⇒ 与原生侧刻意一致 ✓（设计 §5.1 ✓）。
  const tooBig = new File([new Uint8Array(IMPORT_BYTE_LIMIT + 1)], 'big.md');
  await expect(readSourceFile(tooBig)).rejects.toThrow('文件超过 50MiB 的上限');
});
it('rejects an invalid source revision before calling storage', async () => {
  const save = vi.fn(),
    sessions = new DocumentSessions(),
    doc = createNewDocument();
  await expect(
    saveSource(sessions, {...doc, revision: Number.MAX_SAFE_INTEGER + 1}, save),
  ).rejects.toThrow('revision');
  expect(save).not.toHaveBeenCalled();
});
