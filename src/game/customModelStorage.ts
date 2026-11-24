import JSZip from 'jszip';
import { ModelStyle } from './types';

export type CustomWeaponMode = 'auto' | 'builtin' | 'detached';

export interface CustomWeaponAsset {
  filename: string;
  ext: string;
  size: number;
  buffer: ArrayBuffer;
  textures?: Record<string, ArrayBuffer>;
  yawOffsetDeg: number;
}

export interface CustomModelAsset {
  characterId: ModelStyle;
  filename: string;
  ext: string;
  size: number;
  buffer: ArrayBuffer;
  textures?: Record<string, ArrayBuffer>;
  yawOffsetDeg: number;
  playAnimation: boolean;
  weaponMode: CustomWeaponMode;
  savedOnServer: boolean;
  customWeapon?: CustomWeaponAsset;
}

const DB_NAME = 'lbx_custom_models_db';
const STORE_NAME = 'models';
const ALL_CHARS: ModelStyle[] = ['achilles', 'hunter', 'kunoichi', 'emperor', 'odin'];

const MODEL_PRIORITY = ['.glb', '.gltf', '.fbx', '.dae', '.obj', '.stl'];
const ALLOWED_MODEL_EXTS = new Set(MODEL_PRIORITY);
const COMPANION_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.tga',
  '.bmp',
  '.mtl',
]);

const cachedAssets: Partial<Record<ModelStyle, CustomModelAsset>> = {};

function basenameOf(pathStr: string): string {
  return pathStr.split(/[/\\]/).pop() || pathStr;
}

function extOf(name: string): string {
  const clean = basenameOf(name);
  const dotIdx = clean.lastIndexOf('.');
  return dotIdx >= 0 ? clean.slice(dotIdx).toLowerCase() : '';
}

function recordKeyFor(charId: ModelStyle): string {
  return charId === 'achilles' ? 'achilles_custom' : `${charId}_custom`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIndexedDb(charId: ModelStyle, asset: CustomModelAsset): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(asset, recordKeyFor(charId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore IDB quota/availability errors
  }
}

async function loadFromIndexedDb(charId: ModelStyle): Promise<CustomModelAsset | null> {
  try {
    const db = await openDb();
    const res = await new Promise<CustomModelAsset | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(recordKeyFor(charId));
      req.onsuccess = () => resolve((req.result as CustomModelAsset) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return res;
  } catch {
    return null;
  }
}

async function deleteFromIndexedDb(charId: ModelStyle): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(recordKeyFor(charId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore
  }
}

function normalizeAsset(
  charId: ModelStyle,
  raw: CustomModelAsset,
): CustomModelAsset {
  return {
    ...raw,
    characterId: raw.characterId ?? charId,
    textures: raw.textures ?? {},
    playAnimation: raw.playAnimation ?? false,
    weaponMode:
      raw.weaponMode === 'builtin' || raw.weaponMode === 'detached'
        ? raw.weaponMode
        : 'auto',
  };
}

export function getCachedCustomModel(
  charId: ModelStyle = 'achilles',
): CustomModelAsset | null {
  return cachedAssets[charId] ?? null;
}

export async function loadAllSavedCustomModels(): Promise<
  Partial<Record<ModelStyle, CustomModelAsset>>
> {
  const result: Partial<Record<ModelStyle, CustomModelAsset>> = {};
  const loadedFromServer = new Set<ModelStyle>();

  // 1. Check server filesystem for all characters
  try {
    const resp = await fetch('/api/custom-models');
    if (resp.ok) {
      const data = (await resp.json()) as {
        models?: Record<
          string,
          {
            characterId?: string;
            filename: string;
            ext: string;
            size?: number;
            url: string;
            yawOffsetDeg?: number;
            playAnimation?: boolean;
            weaponMode?: CustomWeaponMode;
            textures?: { name: string; url: string; size?: number }[];
            customWeapon?: {
              filename: string;
              ext: string;
              size?: number;
              url: string;
              yawOffsetDeg?: number;
              textures?: { name: string; url: string; size?: number }[];
            };
          }
        >;
      };
      const serverModels = data.models ?? {};
      await Promise.all(
        ALL_CHARS.map(async (charId) => {
          const meta = serverModels[charId];
          if (!meta || !meta.url || !meta.filename || !meta.ext) return;
          try {
            const fileResp = await fetch(`${meta.url}?t=${Date.now()}`);
            if (!fileResp.ok) return;
            const buffer = await fileResp.arrayBuffer();

            const textures: Record<string, ArrayBuffer> = {};
            if (Array.isArray(meta.textures) && meta.textures.length > 0) {
              await Promise.all(
                meta.textures.map(async (t) => {
                  try {
                    const tResp = await fetch(`${t.url}?t=${Date.now()}`);
                    if (tResp.ok) {
                      textures[t.name] = await tResp.arrayBuffer();
                    }
                  } catch {
                    // Ignore missing individual texture
                  }
                }),
              );
            }

            let customWeapon: CustomWeaponAsset | undefined;
            if (meta.customWeapon?.url && meta.customWeapon.filename && meta.customWeapon.ext) {
              try {
                const wResp = await fetch(`${meta.customWeapon.url}?t=${Date.now()}`);
                if (wResp.ok) {
                  const wBuf = await wResp.arrayBuffer();
                  const wTex: Record<string, ArrayBuffer> = {};
                  if (Array.isArray(meta.customWeapon.textures) && meta.customWeapon.textures.length > 0) {
                    await Promise.all(
                      meta.customWeapon.textures.map(async (t) => {
                        try {
                          const wtResp = await fetch(`${t.url}?t=${Date.now()}`);
                          if (wtResp.ok) {
                            wTex[t.name] = await wtResp.arrayBuffer();
                          }
                        } catch {
                          // Ignore missing weapon texture
                        }
                      }),
                    );
                  }
                  customWeapon = {
                    filename: meta.customWeapon.filename,
                    ext: meta.customWeapon.ext,
                    size: meta.customWeapon.size ?? wBuf.byteLength,
                    buffer: wBuf,
                    textures: wTex,
                    yawOffsetDeg: meta.customWeapon.yawOffsetDeg ?? 0,
                  };
                }
              } catch {
                // Ignore failed weapon fetch
              }
            }

            const asset = normalizeAsset(charId, {
              characterId: charId,
              filename: meta.filename,
              ext: meta.ext,
              size: meta.size ?? buffer.byteLength,
              buffer,
              textures,
              yawOffsetDeg: meta.yawOffsetDeg ?? 0,
              playAnimation: meta.playAnimation ?? false,
              weaponMode: meta.weaponMode ?? 'auto',
              savedOnServer: true,
              customWeapon,
            });
            cachedAssets[charId] = asset;
            result[charId] = asset;
            loadedFromServer.add(charId);
            await saveToIndexedDb(charId, asset);
          } catch {
            // Skip failed fetch for this character
          }
        }),
      );
    }
  } catch {
    // Server might be unavailable; fallback to IndexedDB
  }

  // 2. Fallback to IndexedDB for any character not loaded from server
  await Promise.all(
    ALL_CHARS.map(async (charId) => {
      if (loadedFromServer.has(charId)) return;
      const local = await loadFromIndexedDb(charId);
      if (local) {
        const asset = normalizeAsset(charId, local);
        cachedAssets[charId] = asset;
        result[charId] = asset;
      }
    }),
  );

  return result;
}

export async function loadSavedCustomModel(): Promise<CustomModelAsset | null> {
  const all = await loadAllSavedCustomModels();
  return all.achilles ?? null;
}

async function uploadTexturesToServer(
  characterId: ModelStyle,
  textures: Record<string, ArrayBuffer>,
): Promise<void> {
  const entries = Object.entries(textures);
  if (entries.length === 0) return;
  await Promise.all(
    entries.map(async ([name, buf]) => {
      try {
        await fetch(
          `/api/custom-model-texture?characterId=${encodeURIComponent(characterId)}&filename=${encodeURIComponent(name)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: buf,
          },
        );
      } catch {
        // Ignore; already saved in IndexedDB
      }
    }),
  );
}

function partHintFromFilename(filename: string): string {
  const base = basenameOf(filename).replace(/\.[^.]+$/, '').toLowerCase();
  if (/head|helm|face|голов|шлем|(?:^|[^a-z])hd(?:[^a-z]|$)/.test(base)) return 'head';
  if (/cape|cloak|mantle|wing|scarf|manto|back.?pack|плащ|накид|крыл/.test(base)) return 'cape';
  if (/tail|хвост|(?:^|[^a-z])tl(?:[^a-z]|$)/.test(base)) return 'tail';
  if (/pelvis|waist|таз|пояс/.test(base)) return 'pelvis';
  if (/leg|thigh|shin|knee|calf|foot|feet|ног|ступн|(?:^|[^a-z])lg(?:[^a-z]|$)/.test(base)) return 'leg';
  if (/arm|hand|shld|shoulder|elbow|wrist|forearm|рук|плеч|кист|(?:^|[^a-z])ar(?:[^a-z]|$)/.test(base)) return 'arm';
  if (/body|torso|chest|core|тел|торс|корпус|(?:^|[^a-z])bd(?:[^a-z]|$)/.test(base)) return 'body';
  return base.replace(/[^a-z0-9_]+/g, '_') || 'part';
}

function sideHintFromFilename(filename: string): 'L' | 'R' | '' {
  const base = basenameOf(filename).replace(/\.[^.]+$/, '').toLowerCase();
  if (/(?:^|[^a-z])(left|l|лев\w*)(?:[^a-z]|$)|(?:arm|leg|hand|shld|shoulder|foot)l(?:\d|$)/.test(base)) {
    return 'L';
  }
  if (/(?:^|[^a-z])(right|r|прав\w*)(?:[^a-z]|$)|(?:arm|leg|hand|shld|shoulder|foot)r(?:\d|$)/.test(base)) {
    return 'R';
  }
  return '';
}

function subPartHintFromFilename(filename: string): string {
  const base = basenameOf(filename).replace(/\.[^.]+$/, '').toLowerCase();
  if (/thigh|bedr|бедр/.test(base)) return 'thigh';
  if (/shin|calf|knee|голен|колен/.test(base)) return 'shin';
  if (/foot|feet|boot|стоп|ступн/.test(base)) return 'foot';
  if (/shld|shoulder|upper.?arm|плеч/.test(base)) return 'upper';
  if (/fore.?arm|elbow|предплеч|локот/.test(base)) return 'fore';
  if (/hand|wrist|кист/.test(base)) return 'hand';
  return '';
}

function mergeColladaBuffers(
  parts: Array<{ name: string; buffer: ArrayBuffer }>,
): { filename: string; ext: string; size: number; buffer: ArrayBuffer } {
  if (parts.length === 1) {
    return {
      filename: basenameOf(parts[0].name),
      ext: '.dae',
      size: parts[0].buffer.byteLength,
      buffer: parts[0].buffer,
    };
  }

  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return {
      filename: basenameOf(parts[0].name),
      ext: '.dae',
      size: parts[0].buffer.byteLength,
      buffer: parts[0].buffer,
    };
  }

  const NS = 'http://www.collada.org/2005/11/COLLADASchema';
  const decoder = new TextDecoder();
  const parser = new DOMParser();

  const outDoc = document.implementation.createDocument(NS, 'COLLADA', null);
  const outRoot = outDoc.documentElement;
  outRoot.setAttribute('version', '1.4.1');
  outRoot.setAttribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');
  outRoot.setAttribute('xmlns:xsd', 'http://www.w3.org/2001/XMLSchema');

  const assetEl = outDoc.createElementNS(NS, 'asset');
  const unitEl = outDoc.createElementNS(NS, 'unit');
  unitEl.setAttribute('name', 'meter');
  unitEl.setAttribute('meter', '1');
  const upEl = outDoc.createElementNS(NS, 'up_axis');
  upEl.textContent = 'Y_UP';
  assetEl.appendChild(unitEl);
  assetEl.appendChild(upEl);
  outRoot.appendChild(assetEl);

  const libImages = outDoc.createElementNS(NS, 'library_images');
  const libEffects = outDoc.createElementNS(NS, 'library_effects');
  const libMaterials = outDoc.createElementNS(NS, 'library_materials');
  const libGeoms = outDoc.createElementNS(NS, 'library_geometries');
  const libControllers = outDoc.createElementNS(NS, 'library_controllers');
  const libScenes = outDoc.createElementNS(NS, 'library_visual_scenes');
  const visScene = outDoc.createElementNS(NS, 'visual_scene');
  visScene.setAttribute('id', 'assembled_scene');
  visScene.setAttribute('name', 'assembled_scene');
  libScenes.appendChild(visScene);

  const sceneEl = outDoc.createElementNS(NS, 'scene');
  const instVis = outDoc.createElementNS(NS, 'instance_visual_scene');
  instVis.setAttribute('url', '#assembled_scene');
  sceneEl.appendChild(instVis);

  const HASH_ATTRS = ['url', 'source', 'target', 'skin'];

  parts.forEach((part, idx) => {
    const xmlText = decoder.decode(part.buffer);
    const doc = parser.parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return;

    const prefix = `p${idx}_`;
    const partHint = partHintFromFilename(part.name);
    const sideHint = sideHintFromFilename(part.name);
    const subHint = subPartHintFromFilename(part.name);

    // 1. Deduplicate duplicate node IDs within the part before prefixing
    const nodeList = doc.getElementsByTagName('node');
    const seenNodeIds = new Set<string>();
    let dupCounter = 1;
    for (let i = 0; i < nodeList.length; i++) {
      const n = nodeList[i];
      const id = n.getAttribute('id');
      if (!id) continue;
      if (seenNodeIds.has(id)) {
        let nxt = `${id}__dup_${dupCounter++}`;
        while (seenNodeIds.has(nxt)) nxt = `${id}__dup_${dupCounter++}`;
        n.setAttribute('id', nxt);
        seenNodeIds.add(nxt);
      } else {
        seenNodeIds.add(id);
      }
    }

    // 2. Collect all IDs & joint SIDs so references stay 100% isolated across parts
    const allIds = new Set<string>();
    const allJointSids = new Set<string>();
    const allElems = doc.getElementsByTagName('*');
    for (let i = 0; i < allElems.length; i++) {
      const el = allElems[i];
      const id = el.getAttribute('id');
      if (id) allIds.add(id);
      if (el.tagName === 'node' && el.getAttribute('type') === 'JOINT') {
        const sid = el.getAttribute('sid');
        if (sid) allJointSids.add(sid);
      }
    }

    // 3. Rewrite all IDs, #refs, surface <init_from>, <skeleton>, and joint Name_arrays / IDREF_arrays
    for (let i = 0; i < allElems.length; i++) {
      const el = allElems[i];
      const id = el.getAttribute('id');
      if (id) {
        el.setAttribute('id', prefix + id);
      }

      if (el.tagName === 'node' && el.getAttribute('type') === 'JOINT') {
        const sid = el.getAttribute('sid');
        if (sid && allJointSids.has(sid)) {
          el.setAttribute('sid', prefix + sid);
        }
      }

      for (const attrName of HASH_ATTRS) {
        const val = el.getAttribute(attrName);
        if (val && val.startsWith('#')) {
          const ref = val.slice(1);
          if (allIds.has(ref)) {
            el.setAttribute(attrName, `#${prefix}${ref}`);
          }
        }
      }

      if (el.tagName === 'init_from' && el.parentElement?.tagName === 'surface') {
        const txt = (el.textContent || '').trim();
        if (txt && allIds.has(txt)) {
          el.textContent = prefix + txt;
        }
      } else if (el.tagName === 'skeleton') {
        const txt = (el.textContent || '').trim();
        if (txt.startsWith('#') && allIds.has(txt.slice(1))) {
          el.textContent = `#${prefix}${txt.slice(1)}`;
        }
      } else if (
        (el.tagName === 'Name_array' && allJointSids.size > 0) ||
        el.tagName === 'IDREF_array'
      ) {
        const tokens = (el.textContent || '').trim().split(/\s+/);
        if (tokens.some((tok) => allJointSids.has(tok) || allIds.has(tok))) {
          el.textContent = tokens
            .map((tok) =>
              allJointSids.has(tok) || allIds.has(tok) ? prefix + tok : tok,
            )
            .join(' ');
        }
      } else if (el.tagName === 'material') {
        const matName = el.getAttribute('name') || '';
        if (!/(tail|pelvis|waist|leg|arm|body|torso|head|cape|cloak|wing)/i.test(matName)) {
          el.setAttribute('name', `${matName ? `${matName}_` : ''}${partHint}`);
        }
      }
    }

    const importAppendChildren = (srcTag: string, dstParent: Element) => {
      const srcLibs = doc.getElementsByTagName(srcTag);
      for (let i = 0; i < srcLibs.length; i++) {
        const lib = srcLibs[i];
        for (let c = 0; c < lib.children.length; c++) {
          dstParent.appendChild(outDoc.importNode(lib.children[c], true));
        }
      }
    };

    importAppendChildren('library_images', libImages);
    importAppendChildren('library_effects', libEffects);
    importAppendChildren('library_materials', libMaterials);
    importAppendChildren('library_geometries', libGeoms);
    importAppendChildren('library_controllers', libControllers);

    // 4. Wrap visual_scene children in a named part node, converting asset unit/up_axis to Y_UP meter=1
    const partUnitMeter = Number(
      doc.getElementsByTagName('unit')[0]?.getAttribute('meter') || 1,
    );
    const partUpAxis = (
      doc.getElementsByTagName('up_axis')[0]?.textContent || 'Y_UP'
    )
      .trim()
      .toUpperCase();

    const partWrapper = outDoc.createElementNS(NS, 'node');
    partWrapper.setAttribute('id', `${prefix}part_root_id`);
    const tagSegments = [
      `part_${idx}`,
      partHint,
      sideHint ? `side_${sideHint}` : '',
      subHint ? `sub_${subHint}` : '',
    ].filter(Boolean);
    partWrapper.setAttribute('name', tagSegments.join('_'));
    partWrapper.setAttribute('type', 'NODE');

    if (partUpAxis === 'Z_UP') {
      const rot = outDoc.createElementNS(NS, 'rotate');
      rot.textContent = '1 0 0 -90';
      partWrapper.appendChild(rot);
    } else if (partUpAxis === 'X_UP') {
      const rot = outDoc.createElementNS(NS, 'rotate');
      rot.textContent = '0 0 1 90';
      partWrapper.appendChild(rot);
    }
    if (Number.isFinite(partUnitMeter) && partUnitMeter > 0 && Math.abs(partUnitMeter - 1) > 1e-4) {
      const scl = outDoc.createElementNS(NS, 'scale');
      scl.textContent = `${partUnitMeter} ${partUnitMeter} ${partUnitMeter}`;
      partWrapper.appendChild(scl);
    }

    const srcScenes = doc.getElementsByTagName('visual_scene');
    if (srcScenes.length > 0) {
      const srcScene = srcScenes[0];
      for (let c = 0; c < srcScene.children.length; c++) {
        const child = srcScene.children[c];
        if (child.tagName === 'node') {
          partWrapper.appendChild(outDoc.importNode(child, true));
        }
      }
    }
    visScene.appendChild(partWrapper);
  });

  if (libImages.children.length > 0) outRoot.appendChild(libImages);
  if (libEffects.children.length > 0) outRoot.appendChild(libEffects);
  if (libMaterials.children.length > 0) outRoot.appendChild(libMaterials);
  if (libGeoms.children.length > 0) outRoot.appendChild(libGeoms);
  if (libControllers.children.length > 0) outRoot.appendChild(libControllers);
  outRoot.appendChild(libScenes);
  outRoot.appendChild(sceneEl);

  const xmlOut =
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    new XMLSerializer().serializeToString(outDoc);
  const encoded = new TextEncoder().encode(xmlOut);
  const buffer = encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength,
  );
  return {
    filename: `assembled_${parts.length}parts.dae`,
    ext: '.dae',
    size: buffer.byteLength,
    buffer,
  };
}

async function unpackZipBundle(zipFile: File): Promise<{
  filename: string;
  ext: string;
  size: number;
  buffer: ArrayBuffer;
  textures: Record<string, ArrayBuffer>;
}> {
  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
  const modelEntries: { name: string; ext: string; entry: JSZip.JSZipObject }[] = [];
  const companionEntries: { name: string; entry: JSZip.JSZipObject }[] = [];

  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    if (relativePath.startsWith('__MACOSX/') || basenameOf(relativePath).startsWith('.')) {
      return;
    }
    const base = basenameOf(relativePath);
    const ext = extOf(base);
    if (ALLOWED_MODEL_EXTS.has(ext)) {
      modelEntries.push({ name: base, ext, entry });
    } else if (COMPANION_EXTS.has(ext)) {
      companionEntries.push({ name: base, entry });
    }
  });

  if (modelEntries.length === 0) {
    if (companionEntries.length > 0) {
      throw new Error(
        'В архиве только PNG/текстуры без 3D-модели (.dae, .glb, .fbx, .obj). Приложите сам 3D-файл модели вместе с текстурами.',
      );
    }
    throw new Error(
      'В архиве не найден 3D-файл (.glb, .gltf, .fbx, .dae, .obj, .stl).',
    );
  }

  const daeEntries = modelEntries.filter((m) => m.ext === '.dae');
  let filename = '';
  let ext = '';
  let size = 0;
  let buffer: ArrayBuffer;

  if (daeEntries.length > 1 && !modelEntries.some((m) => m.ext === '.glb' || m.ext === '.gltf')) {
    const partBuffers = await Promise.all(
      daeEntries.map(async (m) => ({
        name: m.name,
        buffer: await m.entry.async('arraybuffer'),
      })),
    );
    const merged = mergeColladaBuffers(partBuffers);
    filename = merged.filename;
    ext = merged.ext;
    size = merged.size;
    buffer = merged.buffer;
  } else {
    modelEntries.sort(
      (a, b) => MODEL_PRIORITY.indexOf(a.ext) - MODEL_PRIORITY.indexOf(b.ext),
    );
    const chosen = modelEntries[0];
    buffer = await chosen.entry.async('arraybuffer');
    filename = chosen.name;
    ext = chosen.ext;
    size = buffer.byteLength;
  }

  const textures: Record<string, ArrayBuffer> = {};
  await Promise.all(
    companionEntries.map(async (c) => {
      textures[c.name] = await c.entry.async('arraybuffer');
    }),
  );

  return {
    filename,
    ext,
    size,
    buffer,
    textures,
  };
}

export async function addCustomCharacterTextures(
  characterId: ModelStyle,
  inputFiles: File[],
): Promise<CustomModelAsset> {
  const existing = cachedAssets[characterId];
  if (!existing) {
    throw new Error(
      'Сначала выберите 3D-файл модели (.dae, .glb, .fbx, .obj) — сами по себе PNG-текстуры не образуют 3D-модель.',
    );
  }

  const validFiles = inputFiles.filter((f) => COMPANION_EXTS.has(extOf(f.name)));
  if (validFiles.length === 0) {
    throw new Error('Поддерживаются текстуры .png, .jpg, .tga, .webp, .bmp и материалы .mtl');
  }

  const newTextures: Record<string, ArrayBuffer> = {};
  await Promise.all(
    validFiles.map(async (f) => {
      newTextures[basenameOf(f.name)] = await f.arrayBuffer();
    }),
  );

  const mergedTextures: Record<string, ArrayBuffer> = {
    ...(existing.textures ?? {}),
    ...newTextures,
  };

  if (existing.savedOnServer) {
    await uploadTexturesToServer(characterId, newTextures);
  }

  const updated: CustomModelAsset = {
    ...existing,
    textures: mergedTextures,
  };
  cachedAssets[characterId] = updated;
  await saveToIndexedDb(characterId, updated);
  return updated;
}

export async function saveCustomCharacterModel(
  characterId: ModelStyle,
  input: File | File[],
): Promise<CustomModelAsset> {
  const files = Array.isArray(input) ? input : [input];
  if (files.length === 0) {
    throw new Error('Файл не выбран');
  }

  let filename = '';
  let ext = '';
  let size = 0;
  let buffer: ArrayBuffer | null = null;
  let textures: Record<string, ArrayBuffer> = {};

  const zipFile = files.find((f) => extOf(f.name) === '.zip');
  if (zipFile && files.length === 1) {
    const unpacked = await unpackZipBundle(zipFile);
    filename = unpacked.filename;
    ext = unpacked.ext;
    size = unpacked.size;
    buffer = unpacked.buffer;
    textures = unpacked.textures;
  } else {
    const modelFiles = files.filter((f) => ALLOWED_MODEL_EXTS.has(extOf(f.name)));
    const companionFiles = files.filter((f) => COMPANION_EXTS.has(extOf(f.name)));

    if (modelFiles.length === 0) {
      if (companionFiles.length > 0 && cachedAssets[characterId]) {
        return addCustomCharacterTextures(characterId, companionFiles);
      }
      if (companionFiles.length > 0) {
        throw new Error(
          'Выбраны только текстуры (.png). Выберите вместе с ними 3D-файл (.dae / .glb / .obj / .fbx) или .zip-архив целиком.',
        );
      }
      throw new Error(
        'Поддерживаются форматы .glb, .gltf, .fbx, .dae, .obj, .stl и .zip (включая несколько .dae + .png)',
      );
    }

    const daeFiles = modelFiles.filter((f) => extOf(f.name) === '.dae');
    if (daeFiles.length > 1 && !modelFiles.some((f) => ['.glb', '.gltf'].includes(extOf(f.name)))) {
      const partBuffers = await Promise.all(
        daeFiles.map(async (f) => ({
          name: basenameOf(f.name),
          buffer: await f.arrayBuffer(),
        })),
      );
      const merged = mergeColladaBuffers(partBuffers);
      filename = merged.filename;
      ext = merged.ext;
      size = merged.size;
      buffer = merged.buffer;
    } else {
      modelFiles.sort(
        (a, b) =>
          MODEL_PRIORITY.indexOf(extOf(a.name)) - MODEL_PRIORITY.indexOf(extOf(b.name)),
      );
      const mainFile = modelFiles[0];
      filename = basenameOf(mainFile.name);
      ext = extOf(filename);
      size = mainFile.size;
      buffer = await mainFile.arrayBuffer();
    }

    await Promise.all(
      companionFiles.map(async (f) => {
        textures[basenameOf(f.name)] = await f.arrayBuffer();
      }),
    );
  }

  let savedOnServer = false;

  try {
    const resp = await fetch(
      `/api/custom-model?characterId=${encodeURIComponent(characterId)}&filename=${encodeURIComponent(filename)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buffer,
      },
    );
    if (resp.ok) {
      const json = (await resp.json()) as { ok?: boolean };
      savedOnServer = Boolean(json.ok);
    }
    if (savedOnServer && Object.keys(textures).length > 0) {
      await uploadTexturesToServer(characterId, textures);
    }
  } catch {
    // Fallback gracefully to IndexedDB if backend unavailable
  }

  const asset: CustomModelAsset = {
    characterId,
    filename,
    ext,
    size,
    buffer,
    textures,
    yawOffsetDeg: 0,
    playAnimation: false,
    weaponMode: 'auto',
    savedOnServer,
  };
  cachedAssets[characterId] = asset;
  await saveToIndexedDb(characterId, asset);
  return asset;
}

async function patchCharacterMeta(
  characterId: ModelStyle,
  patch: Partial<Pick<CustomModelAsset, 'yawOffsetDeg' | 'playAnimation' | 'weaponMode'>>,
): Promise<void> {
  const existing = cachedAssets[characterId];
  if (existing) {
    const updated = { ...existing, ...patch };
    cachedAssets[characterId] = updated;
    await saveToIndexedDb(characterId, updated);
  }
  try {
    await fetch(
      `/api/custom-model?characterId=${encodeURIComponent(characterId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      },
    );
  } catch {
    // Ignore
  }
}

export async function updateCustomModelYaw(
  yawOffsetDeg: number,
  characterId: ModelStyle = 'achilles',
): Promise<void> {
  await patchCharacterMeta(characterId, { yawOffsetDeg });
}

export async function updateCustomModelPlayAnimation(
  playAnimation: boolean,
  characterId: ModelStyle = 'achilles',
): Promise<void> {
  await patchCharacterMeta(characterId, { playAnimation });
}

export async function updateCustomModelWeaponMode(
  weaponMode: CustomWeaponMode,
  characterId: ModelStyle = 'achilles',
): Promise<void> {
  await patchCharacterMeta(characterId, { weaponMode });
}

async function resolveModelAndTextures(input: File | File[]): Promise<
  | {
      kind: 'model';
      filename: string;
      ext: string;
      size: number;
      buffer: ArrayBuffer;
      textures: Record<string, ArrayBuffer>;
    }
  | { kind: 'texturesOnly'; files: File[] }
> {
  const files = Array.isArray(input) ? input : [input];
  if (files.length === 0) {
    throw new Error('Файл не выбран');
  }

  const zipFile = files.find((f) => extOf(f.name) === '.zip');
  if (zipFile && files.length === 1) {
    const unpacked = await unpackZipBundle(zipFile);
    return { kind: 'model', ...unpacked };
  }

  const modelFiles = files.filter((f) => ALLOWED_MODEL_EXTS.has(extOf(f.name)));
  const companionFiles = files.filter((f) => COMPANION_EXTS.has(extOf(f.name)));

  if (modelFiles.length === 0) {
    if (companionFiles.length > 0) {
      return { kind: 'texturesOnly', files: companionFiles };
    }
    throw new Error(
      'Поддерживаются форматы .glb, .gltf, .fbx, .dae, .obj, .stl и .zip (включая несколько .dae + .png)',
    );
  }

  const daeFiles = modelFiles.filter((f) => extOf(f.name) === '.dae');
  let filename = '';
  let ext = '';
  let size = 0;
  let buffer: ArrayBuffer;

  if (daeFiles.length > 1 && !modelFiles.some((f) => ['.glb', '.gltf'].includes(extOf(f.name)))) {
    const partBuffers = await Promise.all(
      daeFiles.map(async (f) => ({
        name: basenameOf(f.name),
        buffer: await f.arrayBuffer(),
      })),
    );
    const merged = mergeColladaBuffers(partBuffers);
    filename = merged.filename;
    ext = merged.ext;
    size = merged.size;
    buffer = merged.buffer;
  } else {
    modelFiles.sort(
      (a, b) =>
        MODEL_PRIORITY.indexOf(extOf(a.name)) - MODEL_PRIORITY.indexOf(extOf(b.name)),
    );
    const mainFile = modelFiles[0];
    filename = basenameOf(mainFile.name);
    ext = extOf(filename);
    size = mainFile.size;
    buffer = await mainFile.arrayBuffer();
  }

  const textures: Record<string, ArrayBuffer> = {};
  await Promise.all(
    companionFiles.map(async (f) => {
      textures[basenameOf(f.name)] = await f.arrayBuffer();
    }),
  );

  return { kind: 'model', filename, ext, size, buffer, textures };
}

async function uploadWeaponTexturesToServer(
  characterId: ModelStyle,
  textures: Record<string, ArrayBuffer>,
): Promise<void> {
  const entries = Object.entries(textures);
  if (entries.length === 0) return;
  await Promise.all(
    entries.map(async ([name, buf]) => {
      try {
        await fetch(
          `/api/custom-weapon-texture?characterId=${encodeURIComponent(characterId)}&filename=${encodeURIComponent(name)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: buf,
          },
        );
      } catch {
        // Ignore; saved in IndexedDB
      }
    }),
  );
}

export async function addCustomCharacterWeaponTextures(
  characterId: ModelStyle,
  inputFiles: File[],
): Promise<CustomModelAsset> {
  const existing = cachedAssets[characterId];
  if (!existing || !existing.customWeapon) {
    throw new Error('Сначала загрузите 3D-файл оружия.');
  }

  const validFiles = inputFiles.filter((f) => COMPANION_EXTS.has(extOf(f.name)));
  if (validFiles.length === 0) {
    throw new Error('Поддерживаются текстуры .png, .jpg, .tga, .webp, .bmp и материалы .mtl');
  }

  const newTextures: Record<string, ArrayBuffer> = {};
  await Promise.all(
    validFiles.map(async (f) => {
      newTextures[basenameOf(f.name)] = await f.arrayBuffer();
    }),
  );

  const mergedTextures: Record<string, ArrayBuffer> = {
    ...(existing.customWeapon.textures ?? {}),
    ...newTextures,
  };

  if (existing.savedOnServer) {
    await uploadWeaponTexturesToServer(characterId, newTextures);
  }

  const updated: CustomModelAsset = {
    ...existing,
    customWeapon: {
      ...existing.customWeapon,
      textures: mergedTextures,
    },
  };
  cachedAssets[characterId] = updated;
  await saveToIndexedDb(characterId, updated);
  return updated;
}

export async function saveCustomCharacterWeapon(
  characterId: ModelStyle,
  input: File | File[],
): Promise<CustomModelAsset> {
  const existing = cachedAssets[characterId];
  if (!existing) {
    throw new Error('Сначала загрузите 3D-модель самого персонажа.');
  }

  const resolved = await resolveModelAndTextures(input);
  if (resolved.kind === 'texturesOnly') {
    if (existing.customWeapon) {
      return addCustomCharacterWeaponTextures(characterId, resolved.files);
    }
    throw new Error(
      'Выбраны только текстуры (.png). Выберите вместе с ними 3D-файл оружия (.dae / .glb / .obj / .fbx) или .zip-архив.',
    );
  }

  if (existing.savedOnServer) {
    try {
      const resp = await fetch(
        `/api/custom-weapon?characterId=${encodeURIComponent(characterId)}&filename=${encodeURIComponent(resolved.filename)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: resolved.buffer,
        },
      );
      if (resp.ok && Object.keys(resolved.textures).length > 0) {
        await uploadWeaponTexturesToServer(characterId, resolved.textures);
      }
    } catch {
      // Saved locally in IndexedDB
    }
  }

  const updated: CustomModelAsset = {
    ...existing,
    weaponMode: existing.weaponMode === 'detached' ? 'auto' : existing.weaponMode,
    customWeapon: {
      filename: resolved.filename,
      ext: resolved.ext,
      size: resolved.size,
      buffer: resolved.buffer,
      textures: resolved.textures,
      yawOffsetDeg: 0,
    },
  };
  cachedAssets[characterId] = updated;
  await saveToIndexedDb(characterId, updated);
  return updated;
}

export async function updateCustomWeaponYaw(
  yawOffsetDeg: number,
  characterId: ModelStyle = 'achilles',
): Promise<CustomModelAsset | null> {
  const existing = cachedAssets[characterId];
  if (!existing || !existing.customWeapon) return existing ?? null;
  const updated: CustomModelAsset = {
    ...existing,
    customWeapon: { ...existing.customWeapon, yawOffsetDeg },
  };
  cachedAssets[characterId] = updated;
  await saveToIndexedDb(characterId, updated);
  try {
    await fetch(`/api/custom-weapon?characterId=${encodeURIComponent(characterId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yawOffsetDeg }),
    });
  } catch {
    // Ignore
  }
  return updated;
}

export async function deleteCustomCharacterWeapon(
  characterId: ModelStyle,
): Promise<CustomModelAsset | null> {
  const existing = cachedAssets[characterId];
  if (!existing) return null;
  const updated: CustomModelAsset = { ...existing };
  delete updated.customWeapon;
  cachedAssets[characterId] = updated;
  await saveToIndexedDb(characterId, updated);
  try {
    await fetch(`/api/custom-weapon?characterId=${encodeURIComponent(characterId)}`, {
      method: 'DELETE',
    });
  } catch {
    // Ignore
  }
  return updated;
}

export async function deleteCustomCharacterModel(
  characterId: ModelStyle,
): Promise<void> {
  delete cachedAssets[characterId];
  await deleteFromIndexedDb(characterId);
  try {
    await fetch(
      `/api/custom-model?characterId=${encodeURIComponent(characterId)}`,
      { method: 'DELETE' },
    );
  } catch {
    // Ignore
  }
}

export async function saveCustomAchillesModel(file: File): Promise<CustomModelAsset> {
  return saveCustomCharacterModel('achilles', file);
}

export async function deleteCustomAchillesModel(): Promise<void> {
  return deleteCustomCharacterModel('achilles');
}
