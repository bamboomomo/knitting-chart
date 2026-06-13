/**
 * 符号图片映射表
 *
 * 钩针 (crochet) 符号 → /symbols/crochet/
 * 棒针 (knitting) 符号 → /symbols/knit/
 *
 * key = symbol 标识符，value = 图片路径
 * 图片要求：PNG/SVG，透明背景，推荐 48×48 或 96×96
 */

const SYMBOL_IMAGES: Record<string, string> = {
  // ========== 钩针 (Crochet) ==========
  'crochet-chain':         '/symbols/crochet/crochet-chain.png',
  'crochet-slip-stitch':   '/symbols/crochet/crochet-slip-stitch.png',
  'crochet-sc':            '/symbols/crochet/crochet-sc-cross.png',       // 短针
  'crochet-sc-plus':       '/symbols/crochet/crochet-sc-plus.png',        // 短针加针
  'crochet-sc2tog':        '/symbols/crochet/crochet-sc2tog.png',         // 短针减针
  'crochet-sc3tog':        '/symbols/crochet/crochet-sc3tog.png',         // 短针三并一
  'crochet-hdc':           '/symbols/crochet/crochet-hdc.png',            // 中长针
  'crochet-dc':            '/symbols/crochet/crochet-dc.png',            // 长针
  'crochet-dc2tog':        '/symbols/crochet/crochet-dc2tog.png',        // 长针减针
  'crochet-dc3tog':        '/symbols/crochet/crochet-dc3tog.png',        // 长针三并一
  'crochet-tr':            '/symbols/crochet/crochet-tr.png',             // 特长针
  'crochet-dtr':           '/symbols/crochet/crochet-dtr.png',           // 超长针
  'crochet-bpdc':          '/symbols/crochet/crochet-bpdc.png',          // 后针长针
  'crochet-fpdc':          '/symbols/crochet/crochet-fpdc.png',          // 前针长针
  'crochet-3-dc-cluster':  '/symbols/crochet/crochet-3-dc-cluster.png',  // 3长针枣形针
  'crochet-3-hdc-cluster': '/symbols/crochet/crochet-3-hdc-cluster.png', // 3中长针枣形针
  'crochet-5-dc-popcorn':  '/symbols/crochet/crochet-5-dc-popcorn.png', // 5长针爆米花针
  'crochet-5-dc-shell':    '/symbols/crochet/crochet-5-dc-shell.png',    // 5长针贝壳针
  'crochet-ch-3-picot':    '/symbols/crochet/crochet-ch-3-picot.png',    // 3锁针狗牙针
  'crochet-back-loop':     '/symbols/crochet/crochet-worked-in-back-loop.png',  // 后圈钩
  'crochet-front-loop':    '/symbols/crochet/crochet-worked-in-front-loop.png', // 前圈钩

  // ========== 棒针 (Knitting) ==========
  'knit':                  '/symbols/knit/knit.png',                       // 下针
  'purl':                  '/symbols/knit/purl.png',                       // 上针
  'yarn-over':             '/symbols/knit/yarn-over.png',                 // 绕线加针
  'yarnovertwist':         '/symbols/knit/yarnovertwist.png',             // 绕线扭针
  'k1-tbl':                '/symbols/knit/k1-tbl.png',                    // 扭下针
  'p1-tbl-loop':           '/symbols/knit/p1-tbl-loop.png',              // 扭上针
  'p1-tbl-filled':         '/symbols/knit/p1-tbl-filled.png',             // 扭上针(实心)
  'k1fb':                  '/symbols/knit/k1fb.png',                      // 前后加针
  'k3tog':                 '/symbols/knit/k3tog.png',                     // 三并一
  'slip':                  '/symbols/knit/slip.png',                       // 滑针
  'slipwyif':              '/symbols/knit/slipwyif.png',                  // 带线滑针
  'sl1-wyb':               '/symbols/knit/sl1-wyb.png',                   // 后方滑针
  'sl1-wyb-v':             '/symbols/knit/sl1-wyb-v.png',                // 后方滑针(V)
  'sl1-wyf':               '/symbols/knit/sl1-wyf.png',                   // 前方滑针
  'sl1-wyf-crossed':       '/symbols/knit/sl1-wyf-crossed.png',          // 前方交叉滑针
  'decreaseleft':          '/symbols/knit/decreaseleft.png',               // 左并针
  'decreaseright':         '/symbols/knit/decreaseright.png',              // 右并针
  'decreaseleft-purl':     '/symbols/knit/decreaseleft_purl.png',          // 左并针(上针)
  'decreaseright-purl':    '/symbols/knit/decreaseright_purl.png',         // 右并针(上针)
  'decreaseleft-2w':       '/symbols/knit/decreaseleft.2w.png',           // 左双并针
  'decreaseright-2w':      '/symbols/knit/decreaseright.2w.png',          // 右双并针
  'decrease3to1left':      '/symbols/knit/decrease3to1left.png',          // 左三并一
  'decrease3to1right':     '/symbols/knit/decrease3to1right.png',         // 右三并一
  'decrease3to1centered':  '/symbols/knit/decrease3to1centered.png',     // 中三并一
  'decrease4to1left':      '/symbols/knit/decrease4to1left.png',          // 左四并一
  'decrease4to1right':     '/symbols/knit/decrease4to1right.png',         // 右四并一
  'decrease5to1left':      '/symbols/knit/decrease5to1left.png',          // 左五并一
  'decrease5to1right':     '/symbols/knit/decrease5to1right.png',         // 右五并一
  'decrease5to1centered':  '/symbols/knit/decrease5to1centered.png',     // 中五并一
  'decrease6to1left':      '/symbols/knit/decrease6to1left.png',          // 左六并一
  'decrease6to1right':     '/symbols/knit/decrease6to1right.png',         // 右六并一
  'decrease7to1':          '/symbols/knit/decrease7to1.png',               // 七并一
  'decrease7to1left':      '/symbols/knit/decrease7to1left.png',          // 左七并一
  'decrease7to1right':     '/symbols/knit/decrease7to1right.png',         // 右七并一
  'dec-4-to-1-left':       '/symbols/knit/dec-4-to-1-left.png',           // 左四并一
  'dec-4-to-1-center':     '/symbols/knit/dec-4-to-1-center.png',        // 中四并一
  'dec-4-to-1-right':     '/symbols/knit/dec-4-to-1-right.png',          // 右四并一
  'dec-5-to-1':            '/symbols/knit/dec-5-to-1.png',                // 五并一
  'inc-1-to-3':            '/symbols/knit/inc-1-to-3.png',                // 一变三
  'inc-1-to-4':            '/symbols/knit/inc-1-to-4.png',                // 一变四
  'inc-1-to-5':            '/symbols/knit/inc-1-to-5.png',                // 一变五
  'increase1to3':          '/symbols/knit/increase1to3.png',               // 一变三
  'increaseleft':          '/symbols/knit/increaseleft.png',               // 左加针
  'increaseright':         '/symbols/knit/increaseright.png',              // 右加针
  'lifted-inc-left':       '/symbols/knit/lifted-inc-left.png',            // 挑针左加
  'lifted-inc-right':      '/symbols/knit/lifted-inc-right.png',           // 挑针右加
  'm1-left':               '/symbols/knit/m1-left.png',                   // M1左加针
  'cast-on-plus':          '/symbols/knit/cast-on-plus.png',               // 起针(+)
  'cast-on-u':             '/symbols/knit/cast-on-u.png',                  // 起针(U)
  'bind-off':              '/symbols/knit/bind-off.png',                   // 收针
  'bindoff':               '/symbols/knit/bindoff.png',                    // 收针(2)
  'k1-wrap-twice':         '/symbols/knit/k1-wrap-twice-loops.png',       // 绕两圈下针
  'purl-dot':              '/symbols/knit/purl-dot.png',                   // 上针(点)
  'p2tog-dot-slash':       '/symbols/knit/p2tog-dot-slash.png',            // 上针二并一(点斜)
  'p3tog-dot':             '/symbols/knit/p3tog-dot.png',                  // 上针三并一(点)
  'p3tog-triangle':        '/symbols/knit/p3tog-triangle.png',             // 上针三并一(三角)
  'passleft':              '/symbols/knit/passleft.png',                   // 左拨收
  'passright':             '/symbols/knit/passright.png',                  // 右拨收
  's2kp2-arrow':           '/symbols/knit/s2kp2-arrow.png',               // 滑2拨收2(箭头)
  'ssp-dot-backslash':     '/symbols/knit/ssp-dot-backslash.png',          // 上针滑拨(点反斜)
  'sssp-dot':              '/symbols/knit/sssp-dot.png',                   // 上针三滑拨(点)
  'sssp-triangle':         '/symbols/knit/sssp-triangle.png',              // 上针三滑拨(三角)
  'bobble-dot':            '/symbols/knit/bobble-dot.png',                 // 球球针(点)
  'dip':                   '/symbols/knit/dip.png',                        // 凹针
  'dip-purl':              '/symbols/knit/dip_purl.png',                   // 凹针(上针)
  'diptwist':              '/symbols/knit/diptwist.png',                   // 凹扭针
  'nostitch':              '/symbols/knit/nostitch.png',                   // 无针位
  'crossleft':             '/symbols/knit/crossleft.png',                  // 左交叉
  'crossright':            '/symbols/knit/crossright.png',                 // 右交叉
  'crossleft-purl':        '/symbols/knit/crossleft_purl.png',             // 左交叉(上针)
  'crossright-purl':       '/symbols/knit/crossright_purl.png',            // 右交叉(上针)
  'c2over1left':           '/symbols/knit/c2over1left.png',               // 2过1左交叉
  'c2over1right':          '/symbols/knit/c2over1right.png',              // 2过1右交叉
  'c2over1left-purl':      '/symbols/knit/c2over1left-purl.png',          // 2过1左交叉(上针)
  'c2over1right-purl':     '/symbols/knit/c2over1right-purl.png',         // 2过1右交叉(上针)
  'c2over2left':           '/symbols/knit/c2over2left.png',               // 2过2左交叉
  'c2over2right':          '/symbols/knit/c2over2right.png',              // 2过2右交叉
  'c2over2left-purl':      '/symbols/knit/c2over2left-purl.png',          // 2过2左交叉(上针)
  'c2over2right-purl':     '/symbols/knit/c2over2right-purl.png',         // 2过2右交叉(上针)
  'c3over1left-1':         '/symbols/knit/c3over1left-1.png',              // 3过1左交叉
  'c3over2right-1':        '/symbols/knit/c3over2right-1.png',             // 3过2右交叉(1)
  'c3over2right-2':        '/symbols/knit/c3over2right-2.png',             // 3过2右交叉(2)
  'c3over2right-3':        '/symbols/knit/c3over2right-3.png',             // 3过2右交叉(3)
  'c3over3left':           '/symbols/knit/c3over3left.png',               // 3过3左交叉
  'c3over3right':          '/symbols/knit/c3over3right.png',              // 3过3右交叉
  'slantleft':             '/symbols/knit/slantleft.png',                  // 左倾斜
  'slantright':            '/symbols/knit/slantright.png',                 // 右倾斜
  'twist':                 '/symbols/knit/twist.png',                      // 扭针
  'twist-straight':        '/symbols/knit/twist.straight.png',             // 直扭针
  'twist-purl':            '/symbols/knit/twist_purl.png',                 // 扭针(上针)
  'twistleft':             '/symbols/knit/twistleft.png',                  // 左扭针
  'twistleft-purl':        '/symbols/knit/twistleft_purl.png',             // 左扭针(上针)
  'twistright':            '/symbols/knit/twistright.png',                  // 右扭针
  'twistright-purl':       '/symbols/knit/twistright_purl.png',            // 右扭针(上针)
};

// 兼容旧 key 的别名映射（旧 symbol → 新 symbol）
const SYMBOL_ALIASES: Record<string, string> = {
  // 钩针旧 key → 新 key
  'CH':   'crochet-chain',
  'SS':   'crochet-slip-stitch',
  'SC':   'crochet-sc',
  'SC+':  'crochet-sc-plus',
  'HDC':  'crochet-hdc',
  'RL':   'crochet-dc',          // roll-stitch 近似映射为 dc

  // 棒针旧 key → 新 key
  '|':    'knit',
  '—':    'purl',
  '-':    'purl',
  'O':    'yarn-over',
  '∧':    'decreaseleft',
  '∨':    'decreaseright',
  '⊓':    'decreaseleft',
  '⊔':    'decreaseright',
  'S':    'k1-tbl',
  'U':    'cast-on-u',
  '\\':   'decreaseright',
  '/':    'decreaseleft',
  '≡':    'slip',
  'X':    'crossleft',
  'Q':    'crossleft',
  'Q̲':    'crossleft-purl',
  'K2L':  'decrease3to1left',
  'K2R':  'decrease3to1right',
  'K3L':  'decrease4to1left',
  'K3R':  'decrease4to1right',
  'K3C':  'dec-4-to-1-center',
};

const symbolImageCache: Record<string, HTMLImageElement> = {};
const symbolLoadErrors: Set<string> = new Set();
let loadPromise: Promise<void> | null = null;
let isLoadComplete = false;
const loadedListeners: Set<() => void> = new Set();

/** 获取符号的实际图片路径（解析别名） */
function resolveSymbolSrc(symbol: string): string | undefined {
  // 直接匹配
  if (symbol in SYMBOL_IMAGES) return SYMBOL_IMAGES[symbol];
  // 别名解析
  const alias = SYMBOL_ALIASES[symbol];
  if (alias && alias in SYMBOL_IMAGES) return SYMBOL_IMAGES[alias];
  return undefined;
}

export function preloadSymbolImages(): Promise<void> {
  if (loadPromise) return loadPromise;

  const allKeys = Object.keys(SYMBOL_IMAGES);
  let loadedCount = 0;
  const totalSymbols = allKeys.length;

  loadPromise = Promise.all(
    allKeys.map(key => {
      const src = SYMBOL_IMAGES[key];
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          symbolImageCache[key] = img;
          loadedCount++;
          if (loadedCount === totalSymbols) {
            isLoadComplete = true;
            loadedListeners.forEach(listener => listener());
            loadedListeners.clear();
          }
          resolve();
        };
        img.onerror = () => {
          console.error(`[symbolImages] Failed to load: "${key}" → ${src}`);
          symbolLoadErrors.add(key);
          loadedCount++;
          if (loadedCount === totalSymbols) {
            isLoadComplete = true;
            loadedListeners.forEach(listener => listener());
            loadedListeners.clear();
          }
          resolve();
        };
        img.src = src;
      });
    })
  ).then(() => {});

  return loadPromise;
}

export function getSymbolImage(symbol: string): HTMLImageElement | undefined {
  // 直接查找缓存
  if (symbolImageCache[symbol]) return symbolImageCache[symbol];
  // 别名解析
  const alias = SYMBOL_ALIASES[symbol];
  if (alias && symbolImageCache[alias]) return symbolImageCache[alias];
  return undefined;
}

export function hasSymbolImage(symbol: string): boolean {
  return symbol in SYMBOL_IMAGES || symbol in SYMBOL_ALIASES;
}

export function isSymbolImageReady(symbol: string): boolean {
  const img = getSymbolImage(symbol);
  return !!img && img.complete;
}

export function onAllSymbolsLoaded(callback: () => void): () => void {
  if (isLoadComplete) {
    callback();
    return () => {};
  }
  loadedListeners.add(callback);
  return () => { loadedListeners.delete(callback); };
}

export function debugSymbolStatus(): void {
  const allKeys = Object.keys(SYMBOL_IMAGES);
  const loaded: string[] = [];
  const failed: string[] = [];
  const pending: string[] = [];

  allKeys.forEach(key => {
    if (symbolLoadErrors.has(key)) {
      failed.push(key);
    } else if (symbolImageCache[key]?.complete && symbolImageCache[key].naturalWidth > 0) {
      loaded.push(key);
    } else {
      pending.push(key);
    }
  });

  console.group('%c[Symbol Debug] 符号加载状态', 'font-weight:bold; font-size:14px; color:#2563eb;');
  console.log(`总计: ${allKeys.length} | 已加载: ${loaded.length} | 失败: ${failed.length} | 等待中: ${pending.length}`);

  if (failed.length > 0) {
    console.groupCollapsed(`❌ 加载失败 (${failed.length})`);
    failed.forEach(key => console.log(`  "${key}" → ${SYMBOL_IMAGES[key]}`));
    console.groupEnd();
  }

  if (pending.length > 0) {
    console.groupCollapsed(`⏳ 等待中 (${pending.length})`);
    pending.forEach(key => console.log(`  "${key}"`));
    console.groupEnd();
  }

  console.groupCollapsed(`✅ 已加载 (${loaded.length})`);
  loaded.forEach(key => {
    const img = symbolImageCache[key];
    console.log(`  "${key}" → ${img.width}x${img.height}`);
  });
  console.groupEnd();

  console.groupEnd();
}

export { SYMBOL_IMAGES, SYMBOL_ALIASES };
