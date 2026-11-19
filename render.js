(function (root) {
  "use strict";

  const PALETTE_MARIO = {
    R: "#e52521",
    S: "#ffb878",
    H: "#6b4218",
    B: "#2050e8",
    Y: "#f8d820",
    W: "#ffffff"
  };

  const PALETTE_SPIKE = {
    K: "#3c4252",
    P: "#f09660",
    G: "#14161e",
    O: "#dc6820",
    B: "#f8d820",
    W: "#e6e6e6"
  };

  // 16x24 ドット絵パターン（各行16文字）
  const MARIO_IDLE = [
    ".....RRRRRR.....",
    "....RRRRRRRRR...",
    "....HHHSSHS.....",
    "...HSHSSSHSSS...",
    "...HSHHSSSHSSS..",
    "...HHSSSSHHHH...",
    ".....SSSSSSS....",
    "....RRBRRR......",
    "...RRRBRRBRRR...",
    "..RRRRBBBBRRRR..",
    "..WW.RBYBBYR.WW.",
    "..WW.BBBBBB..WW.",
    ".....BBBBBB.....",
    "....BBBBBBBB....",
    "....BBBBBBBB....",
    "....BBB..BBB....",
    "....BBB..BBB....",
    "...HHHH..HHHH...",
    "..HHHHH..HHHHH..",
    "................",
    "................",
    "................",
    "................",
    "................"
  ];

  const MARIO_WALK1 = [
    ".....RRRRRR.....",
    "....RRRRRRRRR...",
    "....HHHSSHS.....",
    "...HSHSSSHSSS...",
    "...HSHHSSSHSSS..",
    "...HHSSSSHHHH...",
    ".....SSSSSSS....",
    "....RRBRRR......",
    "...RRRBRRBRRR...",
    "..WW.RBBBBR.WW..",
    "..WW.RBYBBR.WW..",
    ".....BBBBBB.....",
    "....BBBBBBBB....",
    "....BBBBBBBB....",
    "....BBBB.BBBB...",
    "...BBBB...BBBB..",
    "..HHHH.....HHHH.",
    "..HHH.......HHH.",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................"
  ];

  const MARIO_WALK2 = [
    "................",
    ".....RRRRRR.....",
    "....RRRRRRRRR...",
    "....HHHSSHS.....",
    "...HSHSSSHSSS...",
    "...HSHHSSSHSSS..",
    "...HHSSSSHHHH...",
    ".....SSSSSSS....",
    "....RRBRRR......",
    "...RRRBRRBR.....",
    "...RRRBBBBRWW...",
    "....BBBBBB.WW...",
    "....BBBBBB......",
    "....BBBBBBBB....",
    ".....BBBBBBB....",
    ".....BBBBBBB....",
    "....HHHH..HHH...",
    "...HHHH....HH...",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................"
  ];

  const MARIO_CLIMB1 = [
    "..WW.RRRRRR.....",
    "..WW.RRRRRRRR...",
    "....RRRRRRRRRR..",
    "....HHHHHHHHHH..",
    "....HHHHHHHHHH..",
    ".....HHHHHHHH...",
    "....RRRRRRRR....",
    "...RRRRRRRRRR...",
    "...RRRBBBBBRR.WW",
    "....BBBBBBBB..WW",
    "....BBBBBBBB....",
    "....BBBBBBBB....",
    "....BBB..BBB....",
    "....BBB..BBBB...",
    "...HHHH...HHHH..",
    "...HHH.....HHH..",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................"
  ];

  const MARIO_CLIMB2 = [
    ".....RRRRRR..WW.",
    "...RRRRRRRR..WW.",
    "..RRRRRRRRRR....",
    "..HHHHHHHHHH....",
    "..HHHHHHHHHH....",
    "...HHHHHHHH.....",
    "....RRRRRRRR....",
    "WW.RRBBBBBRRR...",
    "WW..BBBBBBBB....",
    "....BBBBBBBB....",
    "....BBBBBBBB....",
    "....BBB..BBB....",
    "...BBBB..BBB....",
    "..HHHH...HHHH...",
    "..HHH.....HHH...",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................"
  ];

  const SPIKE_IDLE = [
    "....KKKKKKKK....",
    "...KKKKKKKKKK...",
    "..KKKKKKKKKKKK..",
    "...GGGPPPPGGG...",
    "...GGGPGGGPGG...",
    "...PPPPPPPPPP...",
    "....PPGGGGPP....",
    "....GGGGGGGG....",
    "...OOBOOOOOO....",
    "..OOOBOOBOOOO...",
    "..WW.OBOOBO..WW.",
    "..WW.OOOOOO..WW.",
    ".....OOOOOO.....",
    "....OOOOOOOO....",
    "....OOOOOOOO....",
    "....OOO..OOO....",
    "....OOO..OOO....",
    "...GGGG..GGGG...",
    "..GGGGG..GGGGG..",
    "................",
    "................",
    "................",
    "................",
    "................"
  ];

  const SPIKE_WALK1 = [
    "....KKKKKKKK....",
    "...KKKKKKKKKK...",
    "..KKKKKKKKKKKK..",
    "...GGGPPPPGGG...",
    "...GGGPGGGPGG...",
    "...PPPPPPPPPP...",
    "....PPGGGGPP....",
    "....GGGGGGGG....",
    "...OOBOOOOOO....",
    "..WW.OOOOOO.WW..",
    "..WW.OBOOBO.WW..",
    ".....OOOOOO.....",
    "....OOOOOOOO....",
    "....OOOOOOOO....",
    "....OOOO.OOOO...",
    "...OOOO...OOOO..",
    "..GGGG.....GGGG.",
    "..GGG.......GGG.",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................"
  ];

  const SPIKE_WALK2 = [
    "................",
    "....KKKKKKKK....",
    "...KKKKKKKKKK...",
    "..KKKKKKKKKKKK..",
    "...GGGPPPPGGG...",
    "...GGGPGGGPGG...",
    "...PPPPPPPPPP...",
    "....PPGGGGPP....",
    "....GGGGGGGG....",
    "...OOBOOOOOO....",
    "...OOOBOOOOWW...",
    "....OOOOOO.WW...",
    "....OOOOOO......",
    "....OOOOOOOO....",
    ".....OOOOOOO....",
    ".....OOOOOOO....",
    "....GGGG..GGG...",
    "...GGGG....GG...",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................"
  ];

  const SPIKE_CLIMB1 = [
    "..WW.KKKKKKKK...",
    "..WWKKKKKKKKKK..",
    "...KKKKKKKKKKKK.",
    "....KKKKKKKKKK..",
    "....KKKKKKKKKK..",
    ".....OOOOOOOO...",
    "....OOOOOOOOOO..",
    "...OOOOOOOOOO.WW",
    "...OOBBBBBBOO.WW",
    "....OOOOOOOO....",
    "....OOOOOOOO....",
    "....OOO..OOO....",
    "....OOO..OOOO...",
    "...GGGG...GGGG..",
    "...GGG.....GGG..",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................"
  ];

  const SPIKE_CLIMB2 = [
    "...KKKKKKKK..WW.",
    "..KKKKKKKKKK.WW.",
    ".KKKKKKKKKKKK...",
    "..KKKKKKKKKK....",
    "..KKKKKKKKKK....",
    "...OOOOOOOO.....",
    "..OOOOOOOOOO....",
    "WW.OOOOOOOOOO...",
    "WW.OOBBBBBBOO...",
    "....OOOOOOOO....",
    "....OOOOOOOO....",
    "....OOO..OOO....",
    "...OOOO..OOO....",
    "..GGGG...GGGG...",
    "..GGG.....GGG...",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................"
  ];

  function bakeSprite(rows, palette, flipX) {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 24;
    const g = c.getContext("2d");
    for (let y = 0; y < 24; y++) {
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
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.ctx.imageSmoothingEnabled = false;
      this.marioSprites = makeSpriteSet(
        {
          idle: MARIO_IDLE,
          walk1: MARIO_WALK1,
          walk2: MARIO_WALK2,
          climb1: MARIO_CLIMB1,
          climb2: MARIO_CLIMB2
        },
        PALETTE_MARIO
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

    draw(sim) {
      const ctx = this.ctx;
      ctx.fillStyle = "#080b14";
      ctx.fillRect(0, 0, 256, 240);

      // 床6段（Y = 32, 64, 96, 128, 160, 192）
      for (let row = 0; row < 6; row++) {
        const floorY = (row + 1) * 32;
        ctx.fillStyle = "#2858b8";
        ctx.fillRect(0, floorY, 256, 6);
        ctx.fillStyle = "#5890f8";
        ctx.fillRect(0, floorY, 256, 2);
        ctx.fillStyle = "#183070";
        for (let x = 0; x < 256; x += 16) {
          ctx.fillRect(x + 2, floorY + 2, 12, 2);
        }
      }

      // マップタイル（はしご=1、壁=8）
      for (const [addr, val] of sim.ladders.entries()) {
        const pos = addr - 0x500;
        const row = (pos >> 4) & 0x0f;
        const col = pos & 0x0f;
        const x = col * 16;
        const yTop = row * 32;

        if (val === 1) {
          // はしご（上段床との接続）
          ctx.fillStyle = "#d89040";
          ctx.fillRect(x + 2, yTop, 2, 32);
          ctx.fillRect(x + 12, yTop, 2, 32);
          ctx.fillStyle = "#f8c068";
          for (let ry = 3; ry < 32; ry += 6) {
            ctx.fillRect(x + 2, yTop + ry, 12, 2);
          }
        } else if (val === 8) {
          // 壁8（床の上に立つ破壊不可壁イメージ）
          ctx.fillStyle = "#883828";
          ctx.fillRect(x, yTop + 6, 16, 26);
          ctx.fillStyle = "#c05838";
          ctx.fillRect(x + 1, yTop + 7, 6, 7);
          ctx.fillRect(x + 9, yTop + 7, 6, 7);
          ctx.fillRect(x + 1, yTop + 16, 14, 7);
          ctx.fillRect(x + 1, yTop + 25, 6, 6);
          ctx.fillRect(x + 9, yTop + 25, 6, 6);
        }
      }

      this.drawActor(sim.spike, this.spikeSprites);
      this.drawActor(sim.mario, this.marioSprites);
    }

    pickFrame(slot) {
      const facing = (slot.dir & 2) ? "L" : "R";
      if (slot.state === 2) {
        const idx = ((slot.prom >> 2) & 1) ? "climb2" : "climb1";
        return idx + "_" + facing;
      }
      if (slot.state === 3) {
        const idx = ((slot.n >> 1) & 1) ? "climb2" : "climb1";
        return idx + "_" + facing;
      }
      if (slot.state === 1) {
        const idx = ((slot.x >> 2) & 1) ? "walk2" : "walk1";
        return idx + "_" + facing;
      }
      return "idle_" + facing;
    }

    drawActor(slot, sprites) {
      const img = sprites[this.pickFrame(slot)];
      if (!img) return;
      // スロットの y は足元基準として (y - 20) 付近に配置（16x24の下余白4pxを考慮）
      const drawY = slot.y - 19;
      this.ctx.drawImage(img, slot.x, drawY);
      // 画面右端ループ時（x > 240）は左端にもはみ出し描画
      if (slot.x > 240) {
        this.ctx.drawImage(img, slot.x - 256, drawY);
      }
    }
  }

  root.WreckRender = { Renderer };
})(typeof globalThis !== "undefined" ? globalThis : window);