// 牌陣：位置以 0~1 的相對座標（board 區域）表示，angle 為擺放角度（度數）。
export const SPREADS = [
  {
    key: 'one-card',
    name: '單張聚焦',
    useWhen: '快速聚焦重點、當日指引',
    positions: [
      { label: '核心訊息', x: 0.50, y: 0.48, angle: 0 }
    ]
  },
  {
    key: 'three-ppf',
    name: '三張：過去 / 現在 / 未來',
    useWhen: '了解時間脈絡與發展趨勢',
    positions: [
      { label: '過去', x: 0.34, y: 0.52, angle: -6 },
      { label: '現在', x: 0.50, y: 0.48, angle: 0 },
      { label: '未來', x: 0.66, y: 0.52, angle: 6 }
    ]
  },
  {
    key: 'five-decision',
    name: '五張決策',
    useWhen: '評估選項與可行策略',
    positions: [
      { label: '現況', x: 0.20, y: 0.50, angle: -6 },
      { label: '阻力', x: 0.36, y: 0.40, angle: -3 },
      { label: '助力', x: 0.52, y: 0.60, angle: 3 },
      { label: '建議', x: 0.68, y: 0.40, angle: 3 },
      { label: '可能結果', x: 0.84, y: 0.52, angle: 6 }
    ]
  },
  {
    key: 'relationship',
    name: '關係牌陣（六張）',
    useWhen: '理解雙方觀點與動力互動',
    positions: [
      { label: '你', x: 0.30, y: 0.38, angle: -4 },
      { label: '對方', x: 0.70, y: 0.38, angle: 4 },
      { label: '你需要面對', x: 0.30, y: 0.62, angle: -2 },
      { label: '對方需要面對', x: 0.70, y: 0.62, angle: 2 },
      { label: '關係動力', x: 0.50, y: 0.46, angle: 0 },
      { label: '走向建議', x: 0.50, y: 0.70, angle: 0 }
    ]
  },
  {
    key: 'horseshoe',
    name: '馬蹄形（七張）',
    useWhen: '全局掃描：過去、現況、阻礙、外在、希望、建議、結果',
    positions: [
      { label: '過去', x: 0.16, y: 0.55, angle: -8 },
      { label: '現在', x: 0.30, y: 0.45, angle: -6 },
      { label: '阻礙', x: 0.44, y: 0.55, angle: -3 },
      { label: '外在影響', x: 0.58, y: 0.45, angle: 3 },
      { label: '希望與恐懼', x: 0.72, y: 0.55, angle: 6 },
      { label: '建議', x: 0.58, y: 0.70, angle: 4 },
      { label: '結果', x: 0.72, y: 0.72, angle: 8 }
    ]
  },
  {
    key: 'celtic-cross',
    name: '凱爾特十字（十張）',
    useWhen: '深度分析複雜議題（現況、挑戰、意識、潛意識、過去、未來、自我、外界、希望恐懼、結果）',
    positions: [
      { label: '1. 現況', x: 0.36, y: 0.48, angle: 0 },
      { label: '2. 挑戰/交叉', x: 0.36, y: 0.48, angle: 90 },
      { label: '3. 意識層', x: 0.36, y: 0.30, angle: 0 },
      { label: '4. 潛意識', x: 0.36, y: 0.66, angle: 0 },
      { label: '5. 近過去', x: 0.20, y: 0.48, angle: 0 },
      { label: '6. 近未來', x: 0.52, y: 0.48, angle: 0 },
      { label: '7. 自我', x: 0.70, y: 0.24, angle: 0 },
      { label: '8. 外界', x: 0.70, y: 0.40, angle: 0 },
      { label: '9. 希望/恐懼', x: 0.70, y: 0.56, angle: 0 },
      { label: '10. 結果', x: 0.70, y: 0.72, angle: 0 }
    ]
  }
];

// ===== 牌組資料（78 張） =====
// 欄位：arcana: 'major'|'minor', suit: 'wands'|'cups'|'swords'|'pentacles', rank: 'A'|'2'..'10'|'P'|'N'|'Q'|'K'
const MAJOR = [
  { key: 0,  name: 'The Fool', zh: '愚者', icon: 'fool', keywords: ['新生','零狀態','躍入','直覺'] },
  { key: 1,  name: 'The Magician', zh: '魔術師', icon: 'infinity', keywords: ['意志','創造','專注','資源'] },
  { key: 2,  name: 'The High Priestess', zh: '女祭司', icon: 'moon', keywords: ['直覺','潛意識','寧靜','秘知'] },
  { key: 3,  name: 'The Empress', zh: '女皇', icon: 'wheat', keywords: ['豐饒','滋養','感性','美'] },
  { key: 4,  name: 'The Emperor', zh: '皇帝', icon: 'crown', keywords: ['秩序','結構','權威','規劃'] },
  { key: 5,  name: 'The Hierophant', zh: '教皇', icon: 'keys', keywords: ['傳統','師承','價值','儀式'] },
  { key: 6,  name: 'The Lovers', zh: '戀人', icon: 'heart', keywords: ['選擇','聯結','價值一致','吸引'] },
  { key: 7,  name: 'The Chariot', zh: '戰車', icon: 'wheel', keywords: ['推進','自律','勝利','方向'] },
  { key: 8,  name: 'Strength', zh: '力量', icon: 'lion', keywords: ['勇氣','馴服','內在力量','溫柔堅定'] },
  { key: 9,  name: 'The Hermit', zh: '隱者', icon: 'lantern', keywords: ['獨處','洞見','內觀','師者'] },
  { key: 10, name: 'Wheel of Fortune', zh: '命運之輪', icon: 'wheel2', keywords: ['循環','轉機','節點','機運'] },
  { key: 11, name: 'Justice', zh: '正義', icon: 'scales', keywords: ['衡平','因果','決策','責任'] },
  { key: 12, name: 'The Hanged Man', zh: '倒吊人', icon: 'triangle', keywords: ['換位','暫停','犧牲','看見新角度'] },
  { key: 13, name: 'Death', zh: '死神', icon: 'scythe', keywords: ['終結','蛻變','清理','更新'] },
  { key: 14, name: 'Temperance', zh: '節制', icon: 'vessel', keywords: ['調和','節奏','配比','適度'] },
  { key: 15, name: 'The Devil', zh: '惡魔', icon: 'horns', keywords: ['束縛','慾望','依附','誘惑'] },
  { key: 16, name: 'The Tower', zh: '高塔', icon: 'tower', keywords: ['瓦解','突變','真相顯露','重構'] },
  { key: 17, name: 'The Star', zh: '星星', icon: 'star', keywords: ['希望','療癒','遠景','純淨'] },
  { key: 18, name: 'The Moon', zh: '月亮', icon: 'moon2', keywords: ['朦朧','想像','不安','夢境'] },
  { key: 19, name: 'The Sun', zh: '太陽', icon: 'sun', keywords: ['明朗','成功','能量','童心'] },
  { key: 20, name: 'Judgement', zh: '審判', icon: 'trumpet', keywords: ['召喚','甦醒','總結','覺醒'] },
  { key: 21, name: 'The World', zh: '世界', icon: 'laurel', keywords: ['完成','整合','旅程終點','新章'] }
];

function mkMinor(suit, suitZh){
  const ranks = [
    ['A','Ace','王牌'], ['2','Two','二'], ['3','Three','三'], ['4','Four','四'],
    ['5','Five','五'], ['6','Six','六'], ['7','Seven','七'], ['8','Eight','八'],
    ['9','Nine','九'], ['10','Ten','十'], ['P','Page','侍者'], ['N','Knight','騎士'],
    ['Q','Queen','皇后'], ['K','King','國王']
  ];
  const baseKeywords = {
    wands: ['行動','靈感','企圖','火元素'],
    cups: ['情感','連結','直覺','水元素'],
    swords: ['思辨','決斷','真相','風元素'],
    pentacles: ['實務','價值','穩定','土元素']
  }[suit];

  return ranks.map(([code, en, zh], i) => ({
    arcana: 'minor',
    suit, suitZh,
    rank: code, rankEn: en, rankZh: zh,
    name: `${en} of ${suit[0].toUpperCase()+suit.slice(1)}`,
    zhName: `${suitZh}${zh}`,
    icon: suit, // 使用花色圖標
    keywords: baseKeywords
  }));
}

const MINOR = [
  ...mkMinor('wands','權杖'),
  ...mkMinor('cups','聖杯'),
  ...mkMinor('swords','寶劍'),
  ...mkMinor('pentacles','錢幣'),
];

// 匯出全牌組（78）
export const TAROT_DECK = [
  ...MAJOR.map(m => ({
    arcana: 'major',
    suit: null, suitZh: '大牌',
    rank: String(m.key), rankZh: String(m.key),
    name: m.name, zhName: m.zh,
    icon: m.icon,
    keywords: m.keywords
  })),
  ...MINOR
];