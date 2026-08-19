/**
 * story.ts —— 6 章主线剧情数据（wiki/08-story/主线剧情脚本.md 全文录入）
 *
 * 每章五段：开场（起始房）/ 推进（第 3 战斗房或精英房后）/ 战前（Boss 房进入）/
 * 战后（Boss 击败）/ 结尾（通关时，含系统提示与章节结语）。
 * 台词结构：{ speaker, text, isNarration? }。
 */

export interface DialogLine {
  speaker: string;
  text: string;
  /** 系统提示（金色样式） */
  system?: boolean;
  /** 独白（斜体样式） */
  narration?: boolean;
}

export interface ChapterStory {
  chapter: number;
  level: number;
  title: string;
  opening: DialogLine[];
  midProgress: DialogLine[];
  preBoss: DialogLine[];
  postBoss: DialogLine[];
  ending: DialogLine[];
  /** Boss 阶段切换台词（阶段索引 → 台词） */
  bossStageLines?: Record<number, readonly DialogLine[]>;
}

export const STORY: readonly ChapterStory[] = [
  {
    chapter: 1, level: 1, title: '铁匠惊变',
    opening: [
      { speaker: '陈锋', text: '爹……您说过，铁匠的手，是打铁，不是打人。', narration: true },
      { speaker: '陈锋', text: '可黑风寨的人走了，留下的只有这把钝刀，和满地的血。', narration: true },
      { speaker: '陈锋', text: '藏锋。您给这刀起的名，说刃要藏，人也要藏。' },
      { speaker: '陈锋', text: '可他们逼我出鞘了。', narration: true },
    ],
    midProgress: [
      { speaker: '陈锋', text: '刀转起来，竟比挥砍更顺。是爹当年教我打铁时的发力……原来他早把刀法藏进了锤法里。', narration: true },
    ],
    preBoss: [
      { speaker: '赵横', text: '陈家小儿，你还敢回来？你爹那把破刀，你也敢拿来送死？' },
      { speaker: '陈锋', text: '赵横，我今日不杀你，这刀就白出了鞘。' },
      { speaker: '赵横', text: '狂妄！看我黑风刀法！' },
    ],
    postBoss: [
      { speaker: '赵横', text: '你……你这点本事，断不是陈铁匠教的……谁……谁指点你的？' },
      { speaker: '陈锋', text: '是这把刀自己会的。' },
      { speaker: '赵横', text: '咳……你爹……不过是替人藏刀的……铁匠……真正的麻烦……在断魂谷……' },
      { speaker: '陈锋', text: '替人藏刀？爹，您究竟瞒了我什么？', narration: true },
    ],
    ending: [
      { speaker: '系统', text: '击败黑风寨主，获得【精钢刀】', system: true },
      { speaker: '陈锋', text: '刀出了鞘，就收不回了。断魂谷……我来了。', narration: true },
    ],
  },
  {
    chapter: 2, level: 2, title: '黑风剿匪',
    opening: [
      { speaker: '陈锋', text: '黑风寨不过是爪牙。要查清爹的旧事，得先断了这条线。', narration: true },
    ],
    midProgress: [
      { speaker: '山贼头目', text: '你……杀了寨主还想怎样……血禅师……不会放过你的……' },
      { speaker: '陈锋', text: '血禅师？断魂谷的邪教头子？' },
      { speaker: '山贼头目', text: '他……给盟主府办事……' },
      { speaker: '陈锋', text: '盟主府。武林盟主，竟与邪教勾结？', narration: true },
    ],
    preBoss: [
      { speaker: '血禅师', text: '阿弥陀佛……陈家的遗孤，竟自己送上门来。' },
      { speaker: '陈锋', text: '你就是血禅师？赵横说你替盟主府敛财。' },
      { speaker: '血禅师', text: '小施主，刀是凶器，铁匠的手不该沾血。放下刀，贫僧保你做个太平铁匠。' },
      { speaker: '陈锋', text: '我爹已经太平地死了。' },
    ],
    postBoss: [
      { speaker: '血禅师', text: '你以为……杀了我就完了？……铸剑山庄的欧阳冶……他才知道……陈铁匠的旧事……' },
      { speaker: '陈锋', text: '欧阳冶？铸剑山庄？' },
      { speaker: '血禅师', text: '去问他吧……他欠你陈家……一条命……' },
      { speaker: '系统', text: '获得【雁翎刀】、解锁饰品槽', system: true },
    ],
    ending: [
      { speaker: '陈锋', text: '铸剑山庄，欧阳冶。爹，您当年到底欠了谁，又救了谁？', narration: true },
    ],
  },
  {
    chapter: 3, level: 3, title: '断魂险谷',
    opening: [
      { speaker: '陈锋', text: '血禅师说欧阳冶欠我家一条命。可我若不战过他，他不会开口。', narration: true },
    ],
    midProgress: [
      { speaker: '老者', text: '少年，看你刀法……是藏锋一脉的路子？' },
      { speaker: '陈锋', text: '前辈识得？' },
      { speaker: '老者', text: '藏锋道，失传已二十年。我这里有几本旧谱，你拿去吧。' },
      { speaker: '系统', text: '解锁【秘籍槽】、获得《疾风刀谱》', system: true },
    ],
    preBoss: [
      { speaker: '欧阳冶', text: '陈锋。我等你很久了。' },
      { speaker: '陈锋', text: '你就是欧阳冶？血禅师说你欠我家一条命。' },
      { speaker: '欧阳冶', text: '欠的是。当年你父藏锋刀出鞘，救我一命，却也断送了他自己。' },
      { speaker: '陈锋', text: '你说什么？' },
      { speaker: '欧阳冶', text: '要听真相，先过我这一关。你父说过——藏锋之刀，非战不能出鞘。' },
      { speaker: '陈锋', text: '……好。那就战！' },
    ],
    postBoss: [
      { speaker: '欧阳冶', text: '好刀法……你父若见，必欣慰。' },
      { speaker: '陈锋', text: '现在，告诉我真相。' },
      { speaker: '欧阳冶', text: '二十年前，武林盟主之位之争，你父陈铁锋本是藏锋道传人，刀法冠绝武林。他将胜局让给了天绝老人，退隐为铁匠，藏起藏锋刀……' },
      { speaker: '陈锋', text: '让位？为何？' },
      { speaker: '欧阳冶', text: '天绝老人许诺护江湖太平。可这些年，他暗中收服各派、铲除异己。你父悔了，想把藏锋刀传你，让你有一日……问鼎盟主，拨乱反正。' },
      { speaker: '陈锋', text: '所以灭门……' },
      { speaker: '欧阳冶', text: '是天绝老人得知藏锋刀仍存，授意黑风寨下手。' },
      { speaker: '陈锋', text: '天绝老人……武林盟主。', narration: true },
      { speaker: '欧阳冶', text: '这把刀给你。破镜重圆——当年你父救我，以破镜残片铸成。如今物归原主。' },
      { speaker: '系统', text: '获得【破镜重圆】', system: true },
      { speaker: '欧阳冶', text: '去神刀门吧，司马烈知道盟主府的内情。' },
    ],
    ending: [
      { speaker: '陈锋', text: '爹，您让了盟主之位，却换来灭门。这刀，我必须出鞘到底了。', narration: true },
    ],
  },
  {
    chapter: 4, level: 4, title: '铸剑山庄',
    opening: [
      { speaker: '陈锋', text: '欧阳冶让我找司马烈。神刀门掌门，堂堂名门正派，却也卷入这浑水？', narration: true },
    ],
    midProgress: [
      { speaker: '陈锋', text: '铸剑山庄的护卫都使上了神刀门的招式……这两家，早已是一伙。', narration: true },
    ],
    preBoss: [
      { speaker: '司马烈', text: '陈锋，欧阳冶让你来的？那老东西还没死心。' },
      { speaker: '陈锋', text: '司马烈，你替盟主府做了多少脏事？' },
      { speaker: '司马烈', text: '脏事？我神刀门弟子遍天下，靠的是刀，不是嘴。你爹当年让位天绝老人，是识时务。你不识，就是死路。' },
      { speaker: '陈锋', text: '我爹的识时务，换来满门抄斩。' },
      { speaker: '司马烈', text: '那就怪你爹藏刀藏得太深。受死吧！' },
    ],
    postBoss: [
      { speaker: '司马烈', text: '你以为……杀了我就……能问鼎盟主？……冷无缺……伪盟主……他才是……天绝老人的……代理人……' },
      { speaker: '陈锋', text: '冷无缺？那个在外行事都以盟主自居的人？' },
      { speaker: '司马烈', text: '武林大会……就在近日……天绝老人……在幕后看着……你……' },
      { speaker: '系统', text: '获得【龙鳞刀】、解锁第二饰品槽', system: true },
    ],
    ending: [
      { speaker: '陈锋', text: '冷无缺，伪盟主；天绝老人，真盟主。武林大会，便是了断之地。', narration: true },
    ],
  },
  {
    chapter: 5, level: 5, title: '神刀问道',
    opening: [
      { speaker: '陈锋', text: '要上武林大会，先过神刀门这一关。冷无缺的爪牙，就在此处。', narration: true },
    ],
    midProgress: [
      { speaker: '陈锋', text: '藏刀阁，神刀门历代名刀。今日借一用。', narration: true },
      { speaker: '系统', text: '获得刀具（关卡掉落）', system: true },
    ],
    preBoss: [
      { speaker: '冷无缺', text: '陈锋，你来得比我想的快。' },
      { speaker: '陈锋', text: '你就是冷无缺？顶着盟主名号，替天绝老人扫清障碍？' },
      { speaker: '冷无缺', text: '盟主？呵，那老东西退隐幕后，把我推到台前挡刀。可这江湖，谁不想真正坐上那把椅子？' },
      { speaker: '陈锋', text: '所以你也不过是颗棋子。' },
      { speaker: '冷无缺', text: '棋子？我冷无缺的影分身，足以让江湖天翻地覆！看招！' },
    ],
    postBoss: [
      { speaker: '冷无缺', text: '你……藏锋道的传人……果然……名不虚传……' },
      { speaker: '陈锋', text: '天绝老人在哪？' },
      { speaker: '冷无缺', text: '武林大会……决赛台……他等你……很久了……他想看……藏锋刀……是否真的……能出鞘……' },
      { speaker: '陈锋', text: '他等我？好。那我就去会会这位真正的武林盟主。', narration: true },
      { speaker: '系统', text: '获得【虎啸狂刀】', system: true },
    ],
    ending: [
      { speaker: '陈锋', text: '藏锋出鞘，今日方至。武林大会，我来问鼎。', narration: true },
    ],
  },
  {
    chapter: 6, level: 6, title: '武林问鼎',
    opening: [
      { speaker: '群雄', text: '那是陈锋？连败数派高手……铁匠之子，竟有此刀法……' },
      { speaker: '陈锋', text: '决赛台。天绝老人，二十年前我爹让给你的位子，今日我来讨回。', narration: true },
    ],
    midProgress: [
      { speaker: '老者', text: '少年，你比我想的更接近藏锋道了。' },
      { speaker: '陈锋', text: '前辈又是何人？' },
      { speaker: '老者', text: '我是当年你父的见证人。这把刀能否觉醒，全在你此战。去吧。' },
      { speaker: '系统', text: '决赛前商店开放（最终补给）', system: true },
    ],
    preBoss: [
      { speaker: '天绝老人', text: '陈锋。你终于来了。' },
      { speaker: '陈锋', text: '天绝老人。二十年前我爹让你盟主之位，你却灭我满门。' },
      { speaker: '天绝老人', text: '你爹太天真。藏锋道若出鞘，江湖再无人能制。我让他退隐，已是仁慈。可他偏要把刀传给你。' },
      { speaker: '陈锋', text: '所以我必须死？' },
      { speaker: '天绝老人', text: '本该如此。但我老了，想看看……藏锋道真正的传承，能否接得住我天绝一刀。来吧，让我看看你那把钝刀，藏了多少锋芒！' },
    ],
    bossStageLines: {
      2: [{ speaker: '天绝老人', text: '不错，能接我几刀。' }],
      3: [{ speaker: '天绝老人', text: '万刃风暴，看你如何躲！' }],
      4: [{ speaker: '天绝老人', text: '既如此，天绝双刀，送你上路！' }],
    },
    postBoss: [
      { speaker: '天绝老人', text: '好……好一个藏锋出鞘……你爹没看错人……' },
      { speaker: '陈锋', text: '你临死还认我爹的眼力？' },
      { speaker: '天绝老人', text: '我认的是……这把刀……藏锋道……果然……天下第一……' },
      { speaker: '陈锋', text: '天下第一？我要的不是这个名号。', narration: true },
    ],
    ending: [],
  },
] as const;

/** 结局 A（标准）与结局 B（觉醒：持铁匠刀通关） */
export const ENDINGS = {
  A: [
    { speaker: '陈锋', text: '武林盟主之位，我取了。但这刀，不为称霸。' },
    { speaker: '陈锋', text: '爹，您让出的位子，我夺回来了。从此江湖，藏锋者不必再藏，出鞘者不必再战。', narration: true },
    { speaker: '字幕', text: '陈锋继任武林盟主，废盟主府专权，重立武林大会公议之制。藏锋刀归于铁匠铺，悬于炉畔，再未出鞘。', system: true },
  ],
  B: [
    { speaker: '系统', text: '家传【藏锋】觉醒为【藏锋·无名】', system: true },
    { speaker: '陈锋', text: '原来……藏的不是锋，是待出鞘的时机。' },
    { speaker: '陈锋', text: '爹，您让位是藏锋，我出鞘也是藏锋。锋藏于刃，刃藏于心。', narration: true },
    { speaker: '字幕', text: '陈锋以藏锋·无名问鼎盟主，却随即挂印而去，重开陈家铁匠铺。江湖传其刀法，却再不见其人。唯炉畔一柄无名刀，静待下一个该出鞘的人。', system: true },
  ],
} as const;

/** 按关卡取章节 */
export function chapterOf(level: number): ChapterStory | undefined {
  return STORY.find((s) => s.level === level);
}
