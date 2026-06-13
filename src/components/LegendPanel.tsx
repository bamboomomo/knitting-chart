import { useState } from 'react';
import { SYMBOL_IMAGES } from '../utils/symbolImages';

interface Legend {
  key: string;       // 对应 SYMBOL_IMAGES 的 key
  name: string;      // 中文名
  description: string; // 英文/缩写
  category: 'crochet' | 'knitting';
}

const CROCHET_LEGENDS: Legend[] = [
  { key: 'crochet-chain',         name: '锁针',       description: 'ch',       category: 'crochet' },
  { key: 'crochet-slip-stitch',   name: '引拔针',     description: 'sl st',    category: 'crochet' },
  { key: 'crochet-sc',            name: '短针',       description: 'sc',       category: 'crochet' },
  { key: 'crochet-sc-plus',       name: '短针加针',   description: 'sc inc',   category: 'crochet' },
  { key: 'crochet-sc2tog',        name: '短针减针',   description: 'sc2tog',   category: 'crochet' },
  { key: 'crochet-sc3tog',        name: '短针三并一', description: 'sc3tog',   category: 'crochet' },
  { key: 'crochet-hdc',           name: '中长针',     description: 'hdc',      category: 'crochet' },
  { key: 'crochet-dc',            name: '长针',       description: 'dc',       category: 'crochet' },
  { key: 'crochet-dc2tog',        name: '长针减针',   description: 'dc2tog',   category: 'crochet' },
  { key: 'crochet-dc3tog',        name: '长针三并一', description: 'dc3tog',   category: 'crochet' },
  { key: 'crochet-tr',            name: '特长针',     description: 'tr',       category: 'crochet' },
  { key: 'crochet-dtr',           name: '超长针',     description: 'dtr',      category: 'crochet' },
  { key: 'crochet-bpdc',          name: '后针长针',   description: 'bpdc',     category: 'crochet' },
  { key: 'crochet-fpdc',          name: '前针长针',   description: 'fpdc',     category: 'crochet' },
  { key: 'crochet-3-dc-cluster',  name: '3长针枣形针', description: '3dc cl',  category: 'crochet' },
  { key: 'crochet-3-hdc-cluster', name: '3中长针枣形针', description: '3hdc cl', category: 'crochet' },
  { key: 'crochet-5-dc-popcorn',  name: '5长针爆米花针', description: '5dc pop', category: 'crochet' },
  { key: 'crochet-5-dc-shell',    name: '5长针贝壳针', description: '5dc shell', category: 'crochet' },
  { key: 'crochet-ch-3-picot',   name: '3锁针狗牙针', description: 'ch-3 picot', category: 'crochet' },
  { key: 'crochet-back-loop',     name: '后圈钩',     description: 'BLO',      category: 'crochet' },
  { key: 'crochet-front-loop',    name: '前圈钩',     description: 'FLO',      category: 'crochet' },
];

const KNITTING_LEGENDS: Legend[] = [
  { key: 'knit',                  name: '下针',         description: 'K / knit',        category: 'knitting' },
  { key: 'purl',                  name: '上针',         description: 'P / purl',        category: 'knitting' },
  { key: 'yarn-over',             name: '绕线加针',     description: 'YO',              category: 'knitting' },
  { key: 'yarnovertwist',         name: '绕线扭针',     description: 'YO twist',       category: 'knitting' },
  { key: 'k1-tbl',                name: '扭下针',       description: 'k1 tbl',          category: 'knitting' },
  { key: 'p1-tbl-loop',          name: '扭上针',       description: 'p1 tbl',          category: 'knitting' },
  { key: 'p1-tbl-filled',         name: '扭上针(实心)', description: 'p1 tbl filled',   category: 'knitting' },
  { key: 'k1fb',                  name: '前后加针',     description: 'k1fb',            category: 'knitting' },
  { key: 'k3tog',                 name: '三并一',       description: 'k3tog',           category: 'knitting' },
  { key: 'slip',                  name: '滑针',         description: 'sl',             category: 'knitting' },
  { key: 'slipwyif',              name: '带线滑针',     description: 'sl wyif',         category: 'knitting' },
  { key: 'sl1-wyb',               name: '后方滑针',     description: 'sl1 wyb',         category: 'knitting' },
  { key: 'sl1-wyb-v',            name: '后方滑针(V)',  description: 'sl1 wyb v',       category: 'knitting' },
  { key: 'sl1-wyf',               name: '前方滑针',     description: 'sl1 wyf',         category: 'knitting' },
  { key: 'sl1-wyf-crossed',       name: '前方交叉滑针', description: 'sl1 wyf crossed', category: 'knitting' },
  { key: 'decreaseleft',          name: '左并针',       description: 'k2tog tbl',      category: 'knitting' },
  { key: 'decreaseright',         name: '右并针',       description: 'k2tog',           category: 'knitting' },
  { key: 'decreaseleft-purl',     name: '左并针(上针)', description: 'p2tog tbl',      category: 'knitting' },
  { key: 'decreaseright-purl',    name: '右并针(上针)', description: 'p2tog',           category: 'knitting' },
  { key: 'decreaseleft-2w',       name: '左双并针',     description: 'sk2p',           category: 'knitting' },
  { key: 'decreaseright-2w',      name: '右双并针',     description: 'k3tog',           category: 'knitting' },
  { key: 'decrease3to1left',      name: '左三并一',     description: 'sl1-k2tog-psso',  category: 'knitting' },
  { key: 'decrease3to1right',     name: '右三并一',     description: 'k3tog',           category: 'knitting' },
  { key: 'decrease3to1centered',  name: '中三并一',     description: 's2kp2',           category: 'knitting' },
  { key: 'decrease4to1left',      name: '左四并一',     description: 'sk3p',           category: 'knitting' },
  { key: 'decrease4to1right',     name: '右四并一',     description: 'k4tog',           category: 'knitting' },
  { key: 'decrease5to1left',      name: '左五并一',     description: 'sk4p',            category: 'knitting' },
  { key: 'decrease5to1right',     name: '右五并一',     description: 'k5tog',           category: 'knitting' },
  { key: 'decrease5to1centered',  name: '中五并一',     description: 's2kp3',          category: 'knitting' },
  { key: 'decrease6to1left',      name: '左六并一',     description: 'sk5p',           category: 'knitting' },
  { key: 'decrease6to1right',     name: '右六并一',     description: 'k6tog',           category: 'knitting' },
  { key: 'decrease7to1',          name: '七并一',       description: 'k7tog',           category: 'knitting' },
  { key: 'decrease7to1left',      name: '左七并一',     description: 'sk6p',           category: 'knitting' },
  { key: 'decrease7to1right',     name: '右七并一',     description: 'k7tog tbl',       category: 'knitting' },
  { key: 'dec-4-to-1-left',       name: '左四并一(2)',  description: 'dec4L',          category: 'knitting' },
  { key: 'dec-4-to-1-center',     name: '中四并一(2)',  description: 'dec4C',          category: 'knitting' },
  { key: 'dec-4-to-1-right',      name: '右四并一(2)',  description: 'dec4R',          category: 'knitting' },
  { key: 'dec-5-to-1',            name: '五并一(2)',    description: 'dec5',           category: 'knitting' },
  { key: 'inc-1-to-3',            name: '一变三',       description: 'inc3',           category: 'knitting' },
  { key: 'inc-1-to-4',            name: '一变四',       description: 'inc4',           category: 'knitting' },
  { key: 'inc-1-to-5',            name: '一变五',       description: 'inc5',           category: 'knitting' },
  { key: 'increase1to3',          name: '一变三(2)',    description: 'M3',             category: 'knitting' },
  { key: 'increaseleft',          name: '左加针',       description: 'M1L',            category: 'knitting' },
  { key: 'increaseright',         name: '右加针',       description: 'M1R',            category: 'knitting' },
  { key: 'lifted-inc-left',       name: '挑针左加',     description: 'lifted L',       category: 'knitting' },
  { key: 'lifted-inc-right',      name: '挑针右加',     description: 'lifted R',       category: 'knitting' },
  { key: 'm1-left',               name: 'M1左加针',    description: 'M1L',            category: 'knitting' },
  { key: 'cast-on-plus',          name: '起针(+)',     description: 'CO+',            category: 'knitting' },
  { key: 'cast-on-u',             name: '起针(U)',     description: 'CO U',           category: 'knitting' },
  { key: 'bind-off',              name: '收针',         description: 'BO',             category: 'knitting' },
  { key: 'bindoff',               name: '收针(2)',     description: 'BO2',            category: 'knitting' },
  { key: 'k1-wrap-twice',         name: '绕两圈下针',   description: 'wrap2',          category: 'knitting' },
  { key: 'purl-dot',              name: '上针(点)',     description: 'P dot',          category: 'knitting' },
  { key: 'p2tog-dot-slash',       name: '上针二并一(点斜)', description: 'p2tog dot',  category: 'knitting' },
  { key: 'p3tog-dot',             name: '上针三并一(点)', description: 'p3tog dot',    category: 'knitting' },
  { key: 'p3tog-triangle',        name: '上针三并一(三角)', description: 'p3tog tri',  category: 'knitting' },
  { key: 'passleft',              name: '左拨收',       description: 'psso L',        category: 'knitting' },
  { key: 'passright',             name: '右拨收',       description: 'psso R',        category: 'knitting' },
  { key: 's2kp2-arrow',           name: '滑2拨收2(箭头)', description: 's2kp2',       category: 'knitting' },
  { key: 'ssp-dot-backslash',     name: '上针滑拨(点反斜)', description: 'ssp dot',    category: 'knitting' },
  { key: 'sssp-dot',              name: '上针三滑拨(点)', description: 'sssp dot',     category: 'knitting' },
  { key: 'sssp-triangle',         name: '上针三滑拨(三角)', description: 'sssp tri',   category: 'knitting' },
  { key: 'bobble-dot',            name: '球球针(点)',   description: 'bobble',         category: 'knitting' },
  { key: 'dip',                   name: '凹针',         description: 'dip',            category: 'knitting' },
  { key: 'dip-purl',              name: '凹针(上针)',   description: 'dip purl',       category: 'knitting' },
  { key: 'diptwist',              name: '凹扭针',       description: 'dip twist',      category: 'knitting' },
  { key: 'nostitch',              name: '无针位',       description: 'no stitch',      category: 'knitting' },
  { key: 'crossleft',             name: '左交叉',       description: 'C2F',            category: 'knitting' },
  { key: 'crossright',            name: '右交叉',       description: 'C2B',            category: 'knitting' },
  { key: 'crossleft-purl',        name: '左交叉(上针)', description: 'C2F purl',      category: 'knitting' },
  { key: 'crossright-purl',       name: '右交叉(上针)', description: 'C2B purl',      category: 'knitting' },
  { key: 'c2over1left',           name: '2过1左交叉',   description: 'C2/1L',          category: 'knitting' },
  { key: 'c2over1right',          name: '2过1右交叉',   description: 'C2/1R',          category: 'knitting' },
  { key: 'c2over1left-purl',      name: '2过1左交叉(上针)', description: 'C2/1L purl', category: 'knitting' },
  { key: 'c2over1right-purl',     name: '2过1右交叉(上针)', description: 'C2/1R purl', category: 'knitting' },
  { key: 'c2over2left',           name: '2过2左交叉',   description: 'C2/2L',          category: 'knitting' },
  { key: 'c2over2right',          name: '2过2右交叉',   description: 'C2/2R',          category: 'knitting' },
  { key: 'c2over2left-purl',      name: '2过2左交叉(上针)', description: 'C2/2L purl', category: 'knitting' },
  { key: 'c2over2right-purl',     name: '2过2右交叉(上针)', description: 'C2/2R purl', category: 'knitting' },
  { key: 'c3over1left-1',        name: '3过1左交叉',     description: 'C3/1L',          category: 'knitting' },
  { key: 'c3over2right-1',       name: '3过2右交叉(1)',  description: 'C3/2R-1',       category: 'knitting' },
  { key: 'c3over2right-2',       name: '3过2右交叉(2)',  description: 'C3/2R-2',       category: 'knitting' },
  { key: 'c3over2right-3',       name: '3过2右交叉(3)',  description: 'C3/2R-3',       category: 'knitting' },
  { key: 'c3over3left',          name: '3过3左交叉',     description: 'C3/3L',          category: 'knitting' },
  { key: 'c3over3right',         name: '3过3右交叉',     description: 'C3/3R',          category: 'knitting' },
  { key: 'slantleft',             name: '左倾斜',         description: 'slant L',       category: 'knitting' },
  { key: 'slantright',            name: '右倾斜',       description: 'slant R',         category: 'knitting' },
  { key: 'twist',                 name: '扭针',         description: 'twist',           category: 'knitting' },
  { key: 'twist-straight',        name: '直扭针',       description: 'twist straight',  category: 'knitting' },
  { key: 'twist-purl',            name: '扭针(上针)',   description: 'twist purl',      category: 'knitting' },
  { key: 'twistleft',             name: '左扭针',       description: 'twist L',         category: 'knitting' },
  { key: 'twistleft-purl',        name: '左扭针(上针)', description: 'twist L purl',    category: 'knitting' },
  { key: 'twistright',            name: '右扭针',       description: 'twist R',         category: 'knitting' },
  { key: 'twistright-purl',       name: '右扭针(上针)', description: 'twist R purl',    category: 'knitting' },
];

interface LegendPanelProps {
  onSelectSymbol?: (symbol: string) => void;
}

export default function LegendPanel({ onSelectSymbol }: LegendPanelProps) {
  const [crochetOpen, setCrochetOpen] = useState(true);
  const [knittingOpen, setKnittingOpen] = useState(true);

  const renderSymbol = (key: string) => {
    const src = SYMBOL_IMAGES[key];
    if (!src) return <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>?</span>;
    return (
      <img
        src={src}
        alt={key}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
        draggable={false}
      />
    );
  };

  const renderSection = (
    title: string,
    legends: Legend[],
    isOpen: boolean,
    onToggle: () => void,
    keyPrefix: string
  ) => (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between mb-1.5"
      >
        <h4 style={{ color: 'var(--accent)' }} className="text-xs font-bold uppercase tracking-wider">
          {title}
        </h4>
        <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{isOpen ? '▼' : '▶'}</span>
      </button>
      {isOpen && (
        <div className="grid grid-cols-4 gap-1">
          {legends.map((legend, i) => (
            <button
              key={`${keyPrefix}-${i}`}
              onClick={() => onSelectSymbol?.(legend.key)}
              className="flex flex-col items-center gap-0.5 p-1 rounded transition-all duration-200 group"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              title={`${legend.name} (${legend.description})`}
            >
              <span
                className="w-8 h-8 flex items-center justify-center rounded shrink-0 overflow-hidden"
                style={{ background: 'var(--bg-elevated)' }}
              >
                {renderSymbol(legend.key)}
              </span>
              <span className="text-[9px] leading-tight text-center truncate w-full" style={{ color: 'var(--text-muted)' }}>
                {legend.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="rounded-lg p-4 shrink-0 min-h-[280px] max-h-[500px] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <h3 style={{ color: 'var(--text-secondary)', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }} className="text-xs font-semibold uppercase tracking-widest mb-3 sticky top-0 pb-2 z-10">
        符号图例
      </h3>

      <div className="space-y-4">
        {renderSection('钩针编织', CROCHET_LEGENDS, crochetOpen, () => setCrochetOpen(v => !v), 'c')}
        <div style={{ borderTop: '1px solid var(--border-color)' }} />
        {renderSection('棒针编织', KNITTING_LEGENDS, knittingOpen, () => setKnittingOpen(v => !v), 'k')}
      </div>

      <p className="text-xs mt-4 pt-2" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' }}>
        点击选择符号后在网格上绘制
      </p>
    </div>
  );
}
