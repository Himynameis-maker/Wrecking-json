(function (root) {
  "use strict";

  const G = root.WreckGame || {};
  const DOWN = G.DOWN || 4;
  const TILE = G.TILE || {
    EMPTY: 0x00,
    LADDER: 0x01,
    WALL: 0x08,
    DRUM: 0x08,
    HOLE: 0x09,
    HOLE_FALLING: 0x0c,
    DRUM_FALLING: 0x0d,
    WALL_1: 0xc1,
    WALL_2: 0x92,
    WALL_3: 0xa3,
    BOMB: 0xb1,
    BREAK_LADDER: 0xd1,
    PILLAR: 0xf1
  };
  const isHoleTile = G.isHoleTile || (t => t >= 0x09 && t <= 0x0b);
  const isCrumblingLadderTile = G.isCrumblingLadderTile || (t => t >= 0x51 && t <= 0x55);
  const isPillarCrumblingTile = G.isPillarCrumblingTile || (t => t >= 0x71 && t <= 0x75);
  const isSameLadderType = G.isSameLadderType || ((a, b) =>
    (a === TILE.LADDER && b === TILE.LADDER) ||
    (a === TILE.BREAK_LADDER && b === TILE.BREAK_LADDER));
  const getHammerTiming = G.getHammerTiming || (slot => {
    if (slot.isMario) {
      return slot.isGolden
        ? { totalFrames: 7, hitFrame: 5, recoverStart: 7 }
        : { totalFrames: 21, hitFrame: 17, recoverStart: 21 };
    }
    return { totalFrames: 27, hitFrame: 14, recoverStart: 23 };
  });

  // ヘルメットなし・一般作業員パレット
  const PALETTE_WORKER = {
    H: "#4a321c",
    S: "#f4be8c",
    E: "#22242c",
    T: "#6094b4",
    D: "#456d88",
    P: "#343c4e",
    Q: "#232936",
    B: "#5a3820"
  };

  // スパイク（親方）パレット
  const PALETTE_SPIKE = {
    K: "#3c4252",
    P: "#f09660",
    G: "#14161e",
    O: "#dc6820",
    M: "#9e4612",
    B: "#f8d820",
    W: "#e6e6e6"
  };

  // 16x26 ドット絵（上1px余白 + 実体25px、足元は最下行 y=25 揃え）
  const PLAYER_IDLE = [
    "................",
    ".....HHHHHH.....",
    "....HHHHHHHH....",
    "....HHHHHHHH....",
    "....HHSSSSSS....",
    "....HSSSSESS....",
    "....HSSSSSSS....",
    ".....SSSSSS.....",
    "......SSSS......",
    "....TTTTTTTT....",
    "...TTTTTTTTTT...",
    "...TTDTTTTTDT...",
    "...TTDTTTTTDT...",
    "...TTDTTTTTDT...",
    "...SSTTTTTTSS...",
    "....DDDDDDDD....",
    "....PPPPPPPP....",
    "....PPPPPPPP....",
    "....PPP..PPP....",
    "....PPP..PPP....",
    "....PPP..PPP....",
    "....PPP..PPP....",
    "....PPP..PPP....",
    "....BBB..BBB....",
    "....BBBB.BBBB...",
    "....BBBB.BBBB..."
  ];

  const PLAYER_WALK1 = [
    "................",
    "................",
    ".....HHHHHH.....",
    "....HHHHHHHH....",
    "....HHHHHHHH....",
    "....HHSSSSSS....",
    "....HSSSSESS....",
    "....HSSSSSSS....",
    ".....SSSSSS.....",
    "......SSSS......",
    "....TTTTTTTT....",
    "...TTTTTTTTTT...",
    "...TTTTDDDDTT...",
    "...TTTTTTDDDTSS.",
    "....TTTTTTTDDSS.",
    "....DDDDDDDD....",
    "....PPPPPPPP....",
    "....QQQPPPPPP...",
    "...QQQ....PPPP..",
    "..QQQ......PPP..",
    "..QQ........PPP.",
    "..QQ........PPP.",
    "..QQ........PPP.",
    "..BB........BBB.",
    "..BBB.......BBBB",
    "..BBB.......BBBB"
  ];

  const PLAYER_WALK2 = [
    "................",
    "................",
    ".....HHHHHH.....",
    "....HHHHHHHH....",
    "....HHHHHHHH....",
    "....HHSSSSSS....",
    "....HSSSSESS....",
    "....HSSSSSSS....",
    ".....SSSSSS.....",
    "......SSSS......",
    "....TTTTTTTT....",
    "...TTTTTTTTTT...",
    "..DDTTTTTTTT....",
    ".SSDDTTTTTTT....",
    ".SSDDTTTTTT.....",
    "....DDDDDDDD....",
    "....PPPPPPPP....",
    "...PPPPPPQQQ....",
    "..PPPP....QQQ...",
    "..PPP......QQQ..",
    ".PPP........QQ..",
    ".PPP........QQ..",
    ".PPP........QQ..",
    ".BBB........BB..",
    "BBBB.......BBB..",
    "BBBB.......BBB.."
  ];

  const PLAYER_CLIMB1 = [
    "................",
    ".....HHHHHH.....",
    "....HHHHHHHH....",
    "....HHHHHHHH....",
    "....HHHHHHHH....",
    "....HHHHHHHH....",
    ".....HHHHHH.....",
    "..SS..HHHH......",
    "..SS.TTTTTTT....",
    "...TTTTTTTTTT...",
    "....TTTTTTTTSS..",
    "....TTTTTTTTSS..",
    "....TTTTTTTT....",
    "....DDDDDDDD....",
    "....PPPPPPPP....",
    "....PPPPPPPP....",
    "....PPPPPPPP....",
    "....PPP..PPP....",
    "....PPP..PPP....",
    "....PPP..PPP....",
    "....PPP..PPP....",
    "....BBB..PPP....",
    "....BBBB.PPP....",
    "....BBBB.BBB....",
    ".........BBBB...",
    ".........BBBB..."
  ];

  const PLAYER_CLIMB2 = [
    "................",
    ".....HHHHHH.....",
    "....HHHHHHHH....",
    "....HHHHHHHH....",
    "....HHHHHHHH....",
    "....HHHHHHHH....",
    ".....HHHHHH.....",
    "......HHHH..SS..",
    "....TTTTTTT.SS..",
    "...TTTTTTTTTT...",
    "..SSTTTTTTTT....",
    "..SSTTTTTTTT....",
    "....TTTTTTTT....",
    "....DDDDDDDD....",
    "....PPPPPPPP....",
    "....PPPPPPPP....",
    "....PPPPPPPP....",
    "....PPP..PPP....",
    "....PPP..PPP....",
    "....PPP..PPP....",
    "....PPP..PPP....",
    "....PPP..BBB....",
    "....PPP..BBBB...",
    "....BBB..BBBB...",
    "....BBBB........",
    "....BBBB........"
  ];

  const SPIKE_IDLE = [
    "................",
    "....KKKKKKKK....",
    "...KKKKKKKKKK...",
    "..KKKKKKKKKKKK..",
    "...GGGPPPPGGG...",
    "...GGGPGGGPGG...",
    "...PPPPPPPPPP...",
    "....PPGGGGPP....",
    ".....GGGGGG.....",
    "....OOOOOOOO....",
    "...OOBOOOOOOB...",
    "...OOOBOOOOOO...",
    "...OOOBOOOOOO...",
    "...WWOOBOOOOWW..",
    "...WWOOOOOOOO...",
    "....OOOOOOOO....",
    "....OOOOOOOO....",
    "....OOO..OOO....",
    "....OOO..OOO....",
    "....OOO..OOO....",
    "....OOO..OOO....",
    "....OOO..OOO....",
    "....OOO..OOO....",
    "....GGG..GGG....",
    "....GGGG.GGGG...",
    "....GGGG.GGGG..."
  ];

  const SPIKE_WALK1 = [
    "................",
    "................",
    "....KKKKKKKK....",
    "...KKKKKKKKKK...",
    "..KKKKKKKKKKKK..",
    "...GGGPPPPGGG...",
    "...GGGPGGGPGG...",
    "...PPPPPPPPPP...",
    "....PPGGGGPP....",
    ".....GGGGGG.....",
    "....OOOOOOOO....",
    "...OOBOOOOOOB...",
    "...OOOOBOOOOO...",
    "...OOOOOOBOOOWW.",
    "....OOOOOOOOOWW.",
    "....OOOOOOOO....",
    "....OOOOOOOO....",
    "....MMMOOOOOO...",
    "...MMM....OOOO..",
    "..MMM......OOO..",
    "..MM........OOO.",
    "..MM........OOO.",
    "..MM........OOO.",
    "..GG........GGG.",
    "..GGG.......GGGG",
    "..GGG.......GGGG"
  ];

  const SPIKE_WALK2 = [
    "................",
    "................",
    "....KKKKKKKK....",
    "...KKKKKKKKKK...",
    "..KKKKKKKKKKKK..",
    "...GGGPPPPGGG...",
    "...GGGPGGGPGG...",
    "...PPPPPPPPPP...",
    "....PPGGGGPP....",
    ".....GGGGGG.....",
    "....OOOOOOOO....",
    "...OOBOOOOOOB...",
    "..OOBOOOOOOO....",
    ".WWBOOOOOOOO....",
    ".WWOOOOOOOO.....",
    "....OOOOOOOO....",
    "....OOOOOOOO....",
    "...OOOOOOMMM....",
    "..OOOO....MMM...",
    "..OOO......MMM..",
    ".OOO........MM..",
    ".OOO........MM..",
    ".OOO........MM..",
    ".GGG........GG..",
    "GGGG.......GGG..",
    "GGGG.......GGG.."
  ];

  const SPIKE_CLIMB1 = [
    "................",
    "....KKKKKKKK....",
    "...KKKKKKKKKK...",
    "..KKKKKKKKKKKK..",
    "...KKKKKKKKKK...",
    "...KKKKKKKKKK...",
    "....KKKKKKKK....",
    "..WW.KKKKKK.....",
    "..WW.OOOOOOO....",
    "...OOOOOOOOOO...",
    "....OOOOOOOOWW..",
    "....OOOOOOOOWW..",
    "....OOOOOOOO....",
    "....OOBBBBBO....",
    "....OOOOOOOO....",
    "....OOOOOOOO....",
    "....OOOOOOOO....",
    "....OOO..OOO....",
    "....OOO..OOO....",
    "....OOO..OOO....",
    "....OOO..OOO....",
    "....GGG..OOO....",
    "....GGGG.OOO....",
    "....GGGG.GGG....",
    ".........GGGG...",
    ".........GGGG..."
  ];

  const SPIKE_CLIMB2 = [
    "................",
    "....KKKKKKKK....",
    "...KKKKKKKKKK...",
    "..KKKKKKKKKKKK..",
    "...KKKKKKKKKK...",
    "...KKKKKKKKKK...",
    "....KKKKKKKK....",
    ".....KKKKKK..WW.",
    "....OOOOOOO..WW.",
    "...OOOOOOOOOO...",
    "..WWOOOOOOOO....",
    "..WWOOOOOOOO....",
    "....OOOOOOOO....",
    "....OOBBBBBO....",
    "....OOOOOOOO....",
    "....OOOOOOOO....",
    "....OOOOOOOO....",
    "....OOO..OOO....",
    "....OOO..OOO....",
    "....OOO..OOO....",
    "....OOO..OOO....",
    "....OOO..GGG....",
    "....OOO..GGGG...",
    "....GGG..GGGG...",
    "....GGGG........",
    "....GGGG........"
  ];

  function bakeSprite(rows, palette, flipX) {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 26;
    const g = c.getContext("2d");
    for (let y = 0; y < 26; y++) {
      const line = rows[y] || "";
      for (let x = 0; x < 16; x++) {
        const ch = line[x];
        const color = palette[ch];
        if (!color) continue;
        g.fillStyle = color;
        g.fillRect(flipX ? 15 - x : x, y, 1, 1);
      }
    }
    return c;
  }

  function makeSpriteSet(patterns, palette) {
    const set = {};
    for (const [k, rows] of Object.entries(patterns)) {
      set[k + "_R"] = bakeSprite(rows, palette, false);
      set[k + "_L"] = bakeSprite(rows, palette, true);
    }
    return set;
  }

  class Renderer {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.ctx.imageSmoothingEnabled = false;
      this.viewHeight = options.viewHeight || 240;
      this.camY = 0;

      this.marioSprites = makeSpriteSet(
        {
          idle: PLAYER_IDLE,
          walk1: PLAYER_WALK1,
          walk2: PLAYER_WALK2,
          climb1: PLAYER_CLIMB1,
          climb2: PLAYER_CLIMB2
        },
        PALETTE_WORKER
      );
      this.spikeSprites = makeSpriteSet(
        {
          idle: SPIKE_IDLE,
          walk1: SPIKE_WALK1,
          walk2: SPIKE_WALK2,
          climb1: SPIKE_CLIMB1,
          climb2: SPIKE_CLIMB2
        },
        PALETTE_SPIKE
      );
    }

    ensureCanvasSize(world) {
      const targetW = world.worldWidth;
      const targetH = this.viewHeight;
      if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
        this.canvas.width = targetW;
        this.canvas.height = targetH;
        this.ctx.imageSmoothingEnabled = false;
      }
      this.canvas.style.aspectRatio = targetW + " / " + targetH;
    }

    getWorldHeight(world) {
      return world.rows * 32 + 12;
    }

    resetCamera(world) {
      const maxCamY = Math.max(0, this.getWorldHeight(world) - this.viewHeight);
      const targetY = world.mario.y - this.viewHeight * 0.58;
      this.camY = Math.max(0, Math.min(maxCamY, Math.round(targetY)));
    }

    updateCamera(world) {
      const maxCamY = Math.max(0, this.getWorldHeight(world) - this.viewHeight);
      if (maxCamY === 0) {
        this.camY = 0;
        return;
      }
      const targetY = Math.max(0, Math.min(maxCamY, world.mario.y - this.viewHeight * 0.58));
      const diff = targetY - this.camY;
      if (Math.abs(diff) <= 1.5) {
        this.camY = targetY;
      } else {
        this.camY += diff * 0.2;
      }
    }

    drawCracks(ctx, x, yTop, level) {
      ctx.fillStyle = "#181014";
      if (level >= 1) {
        ctx.fillRect(x + 3, yTop + 6, 2, 4);
        ctx.fillRect(x + 5, yTop + 10, 3, 2);
        ctx.fillRect(x + 8, yTop + 12, 2, 5);
        ctx.fillRect(x + 10, yTop + 17, 3, 2);
      }
      if (level >= 2) {
        ctx.fillRect(x + 11, yTop + 5, 2, 5);
        ctx.fillRect(x + 8, yTop + 9, 3, 2);
        ctx.fillRect(x + 4, yTop + 18, 2, 6);
        ctx.fillRect(x + 6, yTop + 23, 4, 2);
        ctx.fillRect(x + 2, yTop + 26, 3, 3);
      }
    }

    drawCrumblingLadder(ctx, x, yTop, stage, frame) {
      const blink = ((frame >> 1) & 1) === 0;
      const sideColor = stage <= 2 && blink ? "#ffd0e0" : "#b84468";
      const rungColor = stage <= 2 && blink ? "#ffffff" : "#ff88a8";

      if (stage >= 4) {
        ctx.fillStyle = sideColor;
        ctx.fillRect(x + 2, yTop + 2, 2, 28);
        ctx.fillRect(x + 12, yTop + 2, 2, 28);
        ctx.fillStyle = rungColor;
        for (let ry = 4; ry < 30; ry += 6) {
          ctx.fillRect(x + 2, yTop + ry, 4, 2);
          ctx.fillRect(x + 10, yTop + ry, 4, 2);
        }
      } else if (stage === 3) {
        ctx.fillStyle = sideColor;
        ctx.fillRect(x + 2, yTop + 4, 2, 10);
        ctx.fillRect(x + 2, yTop + 18, 2, 10);
        ctx.fillRect(x + 12, yTop + 6, 2, 10);
        ctx.fillRect(x + 12, yTop + 20, 2, 8);
        ctx.fillStyle = rungColor;
        for (let ry = 6; ry < 28; ry += 7) {
          ctx.fillRect(x + 3, yTop + ry, 3, 2);
          ctx.fillRect(x + 10, yTop + ry, 3, 2);
        }
      } else if (stage === 2) {
        ctx.fillStyle = sideColor;
        ctx.fillRect(x + 2, yTop + 6, 2, 7);
        ctx.fillRect(x + 12, yTop + 17, 2, 8);
        ctx.fillStyle = rungColor;
        ctx.fillRect(x + 3, yTop + 8, 4, 2);
        ctx.fillRect(x + 9, yTop + 19, 4, 2);
        ctx.fillRect(x + 6, yTop + 13, 3, 2);
      } else {
        ctx.fillStyle = rungColor;
        ctx.fillRect(x + 3, yTop + 7, 2, 3);
        ctx.fillRect(x + 11, yTop + 14, 2, 3);
        ctx.fillRect(x + 5, yTop + 22, 3, 2);
      }
    }

    drawPillar(ctx, x, yTop) {
      // 上下フランジ＋中央I字ビーム鉄柱（背景扱いで素通り可）
      ctx.fillStyle = "#526074";
      ctx.fillRect(x + 2, yTop, 12, 4);
      ctx.fillRect(x + 2, yTop + 28, 12, 4);
      ctx.fillStyle = "#98acc4";
      ctx.fillRect(x + 2, yTop + 1, 12, 1);
      ctx.fillRect(x + 2, yTop + 29, 12, 1);

      ctx.fillStyle = "#485468";
      ctx.fillRect(x + 5, yTop + 4, 6, 24);
      ctx.fillStyle = "#7a8da6";
      ctx.fillRect(x + 6, yTop + 4, 4, 24);
      ctx.fillStyle = "#b4c8e0";
      ctx.fillRect(x + 7, yTop + 4, 1, 24);

      // リベット・継手
      ctx.fillStyle = "#262e3c";
      ctx.fillRect(x + 3, yTop + 1, 2, 2);
      ctx.fillRect(x + 11, yTop + 1, 2, 2);
      ctx.fillRect(x + 3, yTop + 29, 2, 2);
      ctx.fillRect(x + 11, yTop + 29, 2, 2);
      ctx.fillRect(x + 5, yTop + 15, 6, 2);
    }

    drawPillarCrumbling(ctx, x, yTop, stage, frame) {
      const blink = ((frame >> 1) & 1) === 0;
      const h = Math.max(4, stage * 5);
      const offsetY = 32 - h;
      ctx.fillStyle = stage <= 2 && blink ? "#d8e6f8" : "#627288";
      ctx.fillRect(x + 5, yTop + offsetY, 6, h);
      ctx.fillStyle = blink ? "#ffffff" : "#98acc4";
      ctx.fillRect(x + 6, yTop + offsetY, 2, Math.max(2, h - 2));
      ctx.fillStyle = "#404c5c";
      ctx.fillRect(x + 2, yTop + 28, 12, 4);
    }

    drawBreakableWall(ctx, x, yTop, tile) {
      const hp = tile & 0x07;
      const group = tile & 0x70; // 0x40=1回壁, 0x10=2回壁, 0x20=3回壁

      if (group === 0x40) {
        // 1回壊せる壁（軟質レンガ）
        ctx.fillStyle = "#6e2e1d";
        ctx.fillRect(x + 1, yTop + 3, 14, 29);
        ctx.fillStyle = "#b85432";
        ctx.fillRect(x + 2, yTop + 4, 5, 5);
        ctx.fillRect(x + 9, yTop + 4, 5, 5);
        ctx.fillRect(x + 2, yTop + 11, 12, 5);
        ctx.fillRect(x + 2, yTop + 18, 5, 5);
        ctx.fillRect(x + 9, yTop + 18, 5, 5);
        ctx.fillRect(x + 2, yTop + 25, 12, 6);
      } else if (group === 0x10) {
        // 2回壊せる壁（硬質ブロンズ/橙パネル）
        ctx.fillStyle = "#5a4220";
        ctx.fillRect(x + 1, yTop + 3, 14, 29);
        ctx.fillStyle = "#d08c30";
        ctx.fillRect(x + 2, yTop + 4, 12, 12);
        ctx.fillRect(x + 2, yTop + 18, 12, 12);
        ctx.fillStyle = "#f0b858";
        ctx.fillRect(x + 3, yTop + 5, 10, 2);
        ctx.fillRect(x + 3, yTop + 19, 10, 2);
        if (hp === 1) {
          this.drawCracks(ctx, x, yTop, 1);
        }
      } else {
        // 3回壊せる壁（重厚グレー鉄板）
        ctx.fillStyle = "#3a4658";
        ctx.fillRect(x + 1, yTop + 3, 14, 29);
        ctx.fillStyle = "#768aa0";
        ctx.fillRect(x + 2, yTop + 4, 12, 27);
        ctx.fillStyle = "#a8bed4";
        ctx.fillRect(x + 2, yTop + 4, 12, 2);
        ctx.fillRect(x + 2, yTop + 17, 12, 1);
        ctx.fillStyle = "#2b3442";
        ctx.fillRect(x + 3, yTop + 7, 2, 2);
        ctx.fillRect(x + 11, yTop + 7, 2, 2);
        ctx.fillRect(x + 3, yTop + 27, 2, 2);
        ctx.fillRect(x + 11, yTop + 27, 2, 2);
        if (hp === 2) {
          this.drawCracks(ctx, x, yTop, 1);
        } else if (hp <= 1) {
          this.drawCracks(ctx, x, yTop, 2);
        }
      }
    }

    drawDrum(ctx, x, yTop) {
      // 天板（yTop+6..+11）+ 円筒胴体（yTop+11..+32）：天板に乗った時の足元 yTop+11 と一致
      ctx.fillStyle = "#6c1c18";
      ctx.fillRect(x + 1, yTop + 6, 14, 5);
      ctx.fillStyle = "#c84838";
      ctx.fillRect(x + 2, yTop + 7, 12, 3);
      ctx.fillStyle = "#ee8868";
      ctx.fillRect(x + 3, yTop + 7, 6, 1);

      ctx.fillStyle = "#982820";
      ctx.fillRect(x + 1, yTop + 11, 14, 21);
      ctx.fillStyle = "#d04434";
      ctx.fillRect(x + 3, yTop + 11, 8, 21);
      ctx.fillStyle = "#f07c64";
      ctx.fillRect(x + 4, yTop + 11, 2, 21);

      // ドラム缶の補強リブ2本
      ctx.fillStyle = "#4c1410";
      ctx.fillRect(x + 1, yTop + 17, 14, 2);
      ctx.fillRect(x + 1, yTop + 25, 14, 2);
      ctx.fillStyle = "#e8a858";
      ctx.fillRect(x + 3, yTop + 17, 8, 1);
      ctx.fillRect(x + 3, yTop + 25, 8, 1);
    }

    drawBomb(ctx, x, yTop, frame) {
      // 導火線と点滅火花
      ctx.fillStyle = "#c89048";
      ctx.fillRect(x + 7, yTop + 9, 2, 4);
      const sparkOn = ((frame >> 2) & 1) === 0;
      ctx.fillStyle = sparkOn ? "#ffec48" : "#ff5020";
      ctx.fillRect(x + 8, yTop + 6, 3, 3);
      ctx.fillStyle = sparkOn ? "#ffffff" : "#ffa830";
      ctx.fillRect(x + 9, yTop + 7, 1, 1);

      // 口金
      ctx.fillStyle = "#687080";
      ctx.fillRect(x + 5, yTop + 13, 6, 2);

      // 爆弾本体（丸型ドット）
      ctx.fillStyle = "#1c2234";
      ctx.fillRect(x + 3, yTop + 15, 10, 15);
      ctx.fillRect(x + 2, yTop + 17, 12, 11);
      ctx.fillStyle = "#323c58";
      ctx.fillRect(x + 4, yTop + 16, 7, 12);
      // ハイライト & 危険マーク
      ctx.fillStyle = "#8ca4d8";
      ctx.fillRect(x + 4, yTop + 18, 2, 3);
      ctx.fillStyle = "#e83828";
      ctx.fillRect(x + 7, yTop + 21, 3, 4);
    }

    drawTileAt(ctx, x, yTop, val, world) {
      if (val === TILE.EMPTY || isHoleTile(val) || val === TILE.HOLE_FALLING || val === TILE.DRUM_FALLING) {
        return;
      }

      if (val === TILE.LADDER) {
        ctx.fillStyle = "#d89040";
        ctx.fillRect(x + 2, yTop, 2, 32);
        ctx.fillRect(x + 12, yTop, 2, 32);
        ctx.fillStyle = "#f8c068";
        for (let ry = 3; ry < 32; ry += 6) {
          ctx.fillRect(x + 2, yTop + ry, 12, 2);
        }
      } else if (val === TILE.BREAK_LADDER) {
        ctx.fillStyle = "#b84468";
        ctx.fillRect(x + 2, yTop, 2, 32);
        ctx.fillRect(x + 12, yTop, 2, 32);
        ctx.fillStyle = "#ff88a8";
        for (let ry = 3; ry < 32; ry += 6) {
          ctx.fillRect(x + 2, yTop + ry, 5, 2);
          ctx.fillRect(x + 9, yTop + ry, 5, 2);
        }
      } else if (isCrumblingLadderTile(val)) {
        const info = world.getCrumblingInfo ? world.getCrumblingInfo(Math.floor(yTop / 32), Math.floor(x / 16)) : null;
        const stage = info ? info.stage : (val & 0x07);
        this.drawCrumblingLadder(ctx, x, yTop, stage, world.f);
      } else if (val === TILE.PILLAR) {
        this.drawPillar(ctx, x, yTop);
      } else if (isPillarCrumblingTile(val)) {
        const stage = val & 0x07;
        this.drawPillarCrumbling(ctx, x, yTop, stage, world.f);
      } else if (val === TILE.DRUM) {
        this.drawDrum(ctx, x, yTop);
      } else if (val === TILE.BOMB) {
        this.drawBomb(ctx, x, yTop, world.f);
      } else if ((val & 0x80) !== 0) {
        this.drawBreakableWall(ctx, x, yTop, val);
      }
    }

    drawFallingPillars(ctx, world) {
      if (!world.fallingPillars || world.fallingPillars.length === 0) return;
      for (const fp of world.fallingPillars) {
        const dropOffsetY = (fp.stage - 1) * 8;
        const x = fp.col * 16;
        const yTop = fp.row * 32 + dropOffsetY;
        const floorY = yTop + 32;

        // 滞空・落下する「白い床板」パーツ（原作の白い落下床表現）
        ctx.fillStyle = "#b8c8e8";
        ctx.fillRect(x, floorY, 16, 6);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, floorY, 16, 2);
        ctx.fillStyle = "#788cb8";
        ctx.fillRect(x + 2, floorY + 3, 12, 2);

        if (!fp.isFloorOnly) {
          this.drawTileAt(ctx, x, yTop, fp.origAboveTile, world);
        }
      }
    }

    draw(world) {
      this.ensureCanvasSize(world);
      this.updateCamera(world);

      const ctx = this.ctx;
      const w = world.worldWidth;
      const h = this.viewHeight;
      const camOffset = Math.round(this.camY);

      ctx.fillStyle = "#080b14";
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(0, -camOffset);

      // 左右端ループゾーンの目印（ごく薄いガイド線）
      ctx.fillStyle = "rgba(88, 144, 248, 0.08)";
      ctx.fillRect(0, 0, 1, world.rows * 32);
      ctx.fillRect(w - 1, 0, 1, world.rows * 32);

      // 床（穴・落下開始穴 $0C および同種連続はしごの中間以外は青い鉄骨を描画、最下段は常に足場あり）
      for (let row = 0; row < world.rows; row++) {
        const floorY = (row + 1) * 32;
        const isBottomRow = row === world.rows - 1;
        for (let col = 0; col < world.cols; col++) {
          const tile = world.getTile(row, col);
          const belowTile = !isBottomRow ? world.getTile(row + 1, col) : TILE.EMPTY;
          const isContLad = !isBottomRow && (
            isSameLadderType(tile, belowTile) ||
            (tile === TILE.BREAK_LADDER && isCrumblingLadderTile(belowTile)) ||
            (isCrumblingLadderTile(tile) && world.hasCrumblingBelowSame && world.hasCrumblingBelowSame(row, col))
          );
          const x = col * 16;

          if (!isBottomRow && (isHoleTile(tile) || tile === TILE.HOLE_FALLING || isContLad)) {
            if (isHoleTile(tile) || tile === TILE.HOLE_FALLING) {
              ctx.fillStyle = "#0d1222";
              ctx.fillRect(x, floorY, 16, 6);
            }
            continue;
          }
          ctx.fillStyle = "#2858b8";
          ctx.fillRect(x, floorY, 16, 6);
          ctx.fillStyle = "#5890f8";
          ctx.fillRect(x, floorY, 16, 2);
          ctx.fillStyle = "#183070";
          ctx.fillRect(x + 2, floorY + 2, 12, 2);
        }
      }

      // マップタイル
      for (let row = 0; row < world.rows; row++) {
        const yTop = row * 32;
        for (let col = 0; col < world.cols; col++) {
          const val = world.getTile(row, col);
          this.drawTileAt(ctx, col * 16, yTop, val, world);
        }
      }

      // 鉄柱の滞空・落下オブジェクト＋白い床板
      this.drawFallingPillars(ctx, world);

      // 破壊破片エフェクト
      if (world.breakEffects) {
        for (const ef of world.breakEffects) {
          const t = ef.maxTimer - ef.timer;
          const cx = ef.col * 16 + 8;
          const cy = ef.row * 32 + 16;
          if (ef.tile === TILE.BREAK_LADDER) {
            ctx.fillStyle = "#ff88a8";
          } else if (ef.tile === TILE.PILLAR) {
            ctx.fillStyle = "#98acc4";
          } else {
            ctx.fillStyle = "#d07850";
          }
          ctx.fillRect(cx - 4 - t * 0.5, cy - 6 + t * 0.8, 3, 3);
          ctx.fillRect(cx + 2 + t * 0.5, cy - 4 + t * 0.9, 3, 3);
          ctx.fillRect(cx - 5 - t * 0.3, cy + 2 + t * 1.1, 3, 3);
          ctx.fillRect(cx + 3 + t * 0.4, cy + 1 + t * 1.0, 3, 3);
        }
      }

      this.drawActor(world.spike, this.spikeSprites, w, world);
      this.drawActor(world.mario, this.marioSprites, w, world);

      // 爆風・崩落煙エフェクト
      if (world.explosions) {
        for (const ex of world.explosions) {
          const cx = ex.col * 16 + 8;
          const cy = ex.row * 32 + 16;
          const phase = (ex.timer >> 1) & 1;

          if (ex.kind === "spark") {
            ctx.fillStyle = phase ? "#fff080" : "#ff9840";
            ctx.fillRect(cx - 4, cy - 1, 8, 2);
            ctx.fillRect(cx - 1, cy - 4, 2, 8);
          } else if (ex.kind === "wall") {
            const r = Math.max(3, Math.round(8 * (ex.timer / ex.maxTimer)));
            ctx.fillStyle = phase ? "#e89840" : "#b86830";
            ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
            ctx.fillStyle = "#fff090";
            ctx.fillRect(cx - 2, cy - 2, 4, 4);
          } else {
            const isAllDanger = (ex.age || 0) >= 21;
            const r = isAllDanger
              ? 12
              : Math.max(5, Math.round(10 * (0.4 + 0.6 * (ex.timer / ex.maxTimer))));
            ctx.fillStyle = isAllDanger
              ? (phase ? "#ff2820" : "#ffffff")
              : (phase ? "#ff5820" : "#ffa820");
            ctx.fillRect(cx - r, cy - 4, r * 2, 8);
            ctx.fillRect(cx - 4, cy - r, 8, r * 2);
            ctx.fillStyle = isAllDanger
              ? (phase ? "#ffff80" : "#ff5020")
              : (phase ? "#fff058" : "#ffffff");
            ctx.fillRect(cx - Math.max(2, r - 4), cy - Math.max(2, r - 4), Math.max(4, (r - 4) * 2), Math.max(4, (r - 4) * 2));
          }
        }
      }

      ctx.restore();
    }

    pickFrame(slot, world) {
      const faceVal = slot.facing || slot.dir;
      const facing = (faceVal & 2) ? "L" : "R";

      if (slot.state === 15 || slot.state === 16) {
        return "idle_" + facing;
      }
      if (slot.state === 10) {
        const idx = ((world ? world.f >> 2 : 0) & 1) ? "walk1" : "walk2";
        return idx + "_" + facing;
      }
      if (slot.state === 11) {
        return "idle_" + facing;
      }
      if (slot.state === 4) {
        return "idle_" + facing;
      }
      if (slot.state === 0 && world && slot.row < world.rows - 1) {
        if (isSameLadderType(world.getTile(slot.row, slot.col), world.getTile(slot.row + 1, slot.col))) {
          return "climb1_" + facing;
        }
      }
      if (slot.state === 2) {
        const idx = ((slot.prom >> 3) & 1) ? "climb2" : "climb1";
        return idx + "_" + facing;
      }
      if (slot.state === 3) {
        if (slot.kind === "arrive" || slot.kind === "arrive_top") {
          return "idle_" + facing;
        }
        return "climb1_" + facing;
      }
      if (slot.state === 6) {
        const idx = ((slot.n >> 2) & 1) ? "climb2" : "climb1";
        return idx + "_" + facing;
      }
      if (slot.state === 5) {
        return "walk1_" + facing;
      }
      if (slot.state === 8 || slot.state === 9) {
        return "walk2_" + facing;
      }
      if (slot.state === 1) {
        const cycle = ["walk1", "idle", "walk2", "idle"];
        const idx = cycle[(slot.x >> 2) & 3];
        return idx + "_" + facing;
      }
      return "idle_" + facing;
    }

    drawHammerOverlay(slot, baseX, baseY) {
      const ctx = this.ctx;
      const faceVal = slot.facing || slot.dir;
      const isLeft = (faceVal & 2) !== 0;
      const timing = getHammerTiming(slot);
      const total = timing.totalFrames;
      const hitF = timing.hitFrame;
      const recoverStart = timing.recoverStart != null ? timing.recoverStart : total;
      const t = slot.hammerTimer;

      // 0: 後ろ振りかぶり, 1: 頭上構え, 2: 前へ振り下ろし, 3: 振り終わり戻り硬直（親方終盤）
      let phase = 0;
      if (t >= recoverStart) {
        phase = 3;
      } else if (t >= hitF) {
        phase = 2;
      } else if (t >= Math.floor(hitF * 0.55)) {
        phase = 1;
      }

      const headColor = slot.isGolden ? "#ffe848" : (slot.isMario ? "#58687c" : "#3c4252");
      const gripColor = "#c8843c";

      if (phase === 0) {
        const hx = isLeft ? baseX + 12 : baseX - 5;
        const hy = baseY + 1;
        ctx.fillStyle = gripColor;
        ctx.fillRect(isLeft ? baseX + 10 : baseX + 4, baseY + 6, 2, 7);
        ctx.fillStyle = headColor;
        ctx.fillRect(hx, hy, 9, 6);
        ctx.fillStyle = "#b0c0d4";
        ctx.fillRect(hx + 1, hy + 1, 7, 1);
      } else if (phase === 1) {
        const hx = isLeft ? baseX + 2 : baseX + 5;
        const hy = baseY - 7;
        ctx.fillStyle = gripColor;
        ctx.fillRect(isLeft ? baseX + 6 : baseX + 8, baseY - 1, 2, 10);
        ctx.fillStyle = headColor;
        ctx.fillRect(hx, hy, 9, 6);
        ctx.fillStyle = "#b0c0d4";
        ctx.fillRect(hx + 1, hy + 1, 7, 1);
      } else if (phase === 2) {
        const hx = isLeft ? baseX - 7 : baseX + 14;
        const hy = baseY + 11;
        ctx.fillStyle = gripColor;
        ctx.fillRect(isLeft ? baseX - 1 : baseX + 9, baseY + 13, 8, 2);
        ctx.fillStyle = headColor;
        ctx.fillRect(hx, hy, 9, 7);
        ctx.fillStyle = "#b0c0d4";
        ctx.fillRect(hx + 1, hy + 5, 7, 1);

        if (t <= hitF + 4 && t < total) {
          ctx.fillStyle = "#fff480";
          const sx = isLeft ? baseX - 9 : baseX + 24;
          ctx.fillRect(sx, baseY + 9, 2, 2);
          ctx.fillRect(sx, baseY + 17, 2, 2);
        }
      } else {
        const hx = isLeft ? baseX - 2 : baseX + 10;
        const hy = baseY + 14;
        ctx.fillStyle = gripColor;
        ctx.fillRect(isLeft ? baseX + 4 : baseX + 10, baseY + 11, 2, 5);
        ctx.fillStyle = headColor;
        ctx.fillRect(hx, hy, 8, 5);
        ctx.fillStyle = "#b0c0d4";
        ctx.fillRect(hx + 1, hy + 1, 6, 1);
      }
    }

    drawActorAt(slot, sprites, baseX, drawY, world) {
      const img = sprites[this.pickFrame(slot, world)];
      if (!img) return;
      const ctx = this.ctx;

      if (slot.state === 15 || slot.state === 16) {
        // ドラム缶閉じ込め状態: 天板から頭・手だけ覗かせてジタバタ点滅
        const f = world ? world.f : 0;
        const phase = (f >> 2) & 1;
        const bobY = slot.state === 15 ? 4 : (phase ? -3 : -2);
        ctx.drawImage(img, 0, 0, 16, 9, baseX, drawY + bobY, 16, 9);
        const handColor = slot.isMario ? "#f4be8c" : "#e6e6e6";
        ctx.fillStyle = handColor;
        ctx.fillRect(baseX + 1, drawY + bobY + (phase ? 5 : 7), 2, 2);
        ctx.fillRect(baseX + 13, drawY + bobY + (phase ? 7 : 5), 2, 2);
        if (slot.state === 16) {
          ctx.fillStyle = phase ? "#ffec48" : "#ffffff";
          ctx.fillRect(baseX + 7, drawY - 6, 2, 2);
        }
        return;
      }

      if (slot.state === 10) {
        ctx.save();
        ctx.translate(baseX, drawY + 26);
        ctx.scale(1, -1);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
        return;
      }

      if (slot.state === 11) {
        const shakeX = ((world ? world.f >> 1 : 0) & 1) ? 1 : -1;
        ctx.drawImage(img, baseX + shakeX, drawY + 2);
        const f = world ? world.f : 0;
        const sx1 = baseX + 7 + Math.round(Math.cos(f * 0.35) * 5);
        const sx2 = baseX + 7 + Math.round(Math.cos(f * 0.35 + Math.PI) * 5);
        ctx.fillStyle = "#ffec48";
        ctx.fillRect(sx1, drawY - 3, 2, 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(sx2, drawY - 1, 2, 2);
        return;
      }

      ctx.drawImage(img, baseX, drawY);
      if (slot.state === 4) {
        this.drawHammerOverlay(slot, baseX, drawY);
      }
    }

    getLadderVisualOffsetY(slot) {
      if (slot.state === 3) {
        if (slot.kind === "enter_top") {
          const limit = slot.isMario ? 12 : 9;
          return Math.min(10, Math.max(2, Math.round((slot.n / limit) * 10)));
        }
        if (slot.kind === "arrive_top") {
          const remain = Math.max(0, 12 - slot.n);
          return Math.min(10, Math.round((remain / 12) * 10));
        }
        return 0;
      }
      if (slot.state === 6) {
        if (slot.kind === "enter_top_cont") {
          return Math.min(10, Math.max(2, Math.round((slot.n / 16) * 10)));
        }
        if (slot.kind === "cont" && (slot.dir & DOWN)) {
          return Math.min(10, Math.max(2, Math.round((slot.n / 12) * 10)));
        }
        return 0;
      }
      if (slot.state === 2 && slot.prom === 31 && slot.y === slot.topY) {
        return 10;
      }
      return 0;
    }

    drawActor(slot, sprites, worldWidth, world) {
      const drawY = slot.y - 26 + this.getLadderVisualOffsetY(slot);
      this.drawActorAt(slot, sprites, slot.x, drawY, world);
      if (slot.x > worldWidth - 16) {
        this.drawActorAt(slot, sprites, slot.x - worldWidth, drawY, world);
      }
      if (slot.x < 16) {
        this.drawActorAt(slot, sprites, slot.x + worldWidth, drawY, world);
      }
    }
  }

  root.WreckRender = { Renderer };
})(typeof globalThis !== "undefined" ? globalThis : window);