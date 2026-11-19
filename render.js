(function (root) {
  "use strict";

  // ヘルメットなし・特徴のない一般作業員パレット
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
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.ctx.imageSmoothingEnabled = false;
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
          ctx.fillStyle = "#d89040";
          ctx.fillRect(x + 2, yTop, 2, 32);
          ctx.fillRect(x + 12, yTop, 2, 32);
          ctx.fillStyle = "#f8c068";
          for (let ry = 3; ry < 32; ry += 6) {
            ctx.fillRect(x + 2, yTop + ry, 12, 2);
          }
        } else if (val === 8) {
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
        const idx = ((slot.prom >> 3) & 1) ? "climb2" : "climb1";
        return idx + "_" + facing;
      }
      if (slot.state === 3) {
        if (slot.kind === "arrive" || slot.kind === "arrive_top") {
          return "idle_" + facing;
        }
        return "climb1_" + facing;
      }
      if (slot.state === 1) {
        const cycle = ["walk1", "idle", "walk2", "idle"];
        const idx = cycle[(slot.x >> 2) & 3];
        return idx + "_" + facing;
      }
      return "idle_" + facing;
    }

    drawActor(slot, sprites) {
      const img = sprites[this.pickFrame(slot)];
      if (!img) return;
      const drawY = slot.y - 26;
      this.ctx.drawImage(img, slot.x, drawY);
      if (slot.x > 240) {
        this.ctx.drawImage(img, slot.x - 256, drawY);
      }
    }
  }

  root.WreckRender = { Renderer };
})(typeof globalThis !== "undefined" ? globalThis : window);