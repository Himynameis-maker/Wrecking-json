(function (root) {
  "use strict";

  const RIGHT = 1;
  const LEFT = 2;
  const DOWN = 4;
  const UP = 8;

  const TILE = {
    EMPTY: 0,
    LADDER: 1,
    WALL: 8,
    HOLE: 9
  };

  // State 5 落下速度テーブル（前半=Mario用, 後半$12〜=Spike用）
  const FALL_TABLE = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 2, 1, 2, 2, 3, -1,
    0, 1, 0, 1, 1, 2, 1, 2, 2, 2, 3, 2, 3, -1
  ];

  function relYOfProm(prom) {
    if (prom <= 4) return 31;
    if (prom <= 9) return 27;
    if (prom <= 14) return 23;
    if (prom <= 19) return 19;
    if (prom <= 24) return 15;
    return 11;
  }

  class Actor {
    constructor(isMario) {
      this.isMario = isMario;
      this.state = 0;
      this.aux = 0;      // State 8 カウンタ / State 9 目標列
      this.auxRow = 0;   // State 9 目標行
      this.bits = 0;
      this.x = 80;
      this.y = 64;
      this.dir = 4;
      this.topY = 32;    // State 2/3/6:上端Y, State 5:前Y
      this.avail = 0;
      this.row = 1;
      this.col = 5;
      this.flag = 0;     // bit1 = 壁8頭上
      this.n = 0;        // 境界ステート経過F
      this.kind = null;
      this.prom = 0;
    }
  }

  class ActorStepper {
    updateCR(slot, world) {
      const wx = world.wrapX(slot.x + 8);
      slot.col = Math.floor(wx / 16);
      const rawRow = Math.floor((slot.y - 32) / 32);
      slot.row = Math.max(0, Math.min(world.rows - 1, rawRow));
    }

    snapY(slot) {
      slot.y = Math.floor((slot.y + 8) / 32) * 32;
      slot.flag &= ~0x02;
    }

    snapX(slot, world) {
      slot.x = world.wrapCol(Math.floor(world.wrapX(slot.x + 8) / 16)) * 16;
    }

    isContinuousLadder(row, col, world) {
      return row >= 0 &&
        row < world.rows - 1 &&
        world.getTile(row, col) === TILE.LADDER &&
        world.getTile(row + 1, col) === TILE.LADDER;
    }

    snapIfContLadderIdle(slot, world) {
      if (this.isContinuousLadder(slot.row, slot.col, world)) {
        this.snapX(slot, world);
      }
    }

    canPassWall(slot, b, world) {
      if ((slot.x & 0x0f) !== 0) return true;
      const targetCol = world.wrapCol(slot.col + ((b & RIGHT) ? 1 : -1));
      const tile = world.getTile(slot.row, targetCol);
      if (slot.flag & 2) {
        if (tile === TILE.LADDER) {
          return slot.row < world.rows - 1 && world.getTile(slot.row + 1, targetCol) === TILE.LADDER;
        }
        return tile === TILE.HOLE;
      }
      return tile !== TILE.WALL;
    }

    tryEnterHole(slot, world) {
      if (slot.row >= world.rows - 1) return false;
      if (slot.flag & 2) {
        if (world.getTile(slot.row + 1, slot.col) === TILE.WALL) return false;
      } else {
        if (world.getTile(slot.row, slot.col) !== TILE.HOLE) return false;
      }
      if (((slot.x + 3) & 0x0f) >= 6) return false;

      if (slot.isMario) {
        this.snapX(slot, world);
      }
      slot.prom = slot.isMario ? 0 : 0x12;
      slot.topY = slot.y;
      slot.state = 5;
      return true;
    }

    // 横飛び遷移 (State 8 / State 9)
    trySideTransition(slot, b, world) {
      this.updateCR(slot, world);
      const horiz = b & (LEFT | RIGHT);
      if (horiz === 0) return false;

      if (slot.state !== 1) {
        const curTile = world.getTile(slot.row, slot.col);
        if (curTile !== TILE.LADDER && curTile !== TILE.HOLE) return false;
        if (slot.row >= world.rows - 1) return false;
        const belowTile = world.getTile(slot.row + 1, slot.col);
        if (belowTile !== TILE.LADDER) return false;
      }

      const dirStep = (horiz === RIGHT) ? 1 : -1;
      const nextCol = world.wrapCol(slot.col + dirStep);
      const nextTile = world.getTile(slot.row, nextCol);
      let goDirectlyToApply = false;

      if (slot.state !== 1 && nextTile === TILE.HOLE) {
        if ((slot.y & 0x1f) >= 0x0b &&
            slot.row < world.rows - 1 &&
            world.getTile(slot.row + 1, nextCol) === TILE.WALL) {
          if (slot.prom < 0x0f) return false;
          slot.y = Math.floor(slot.y / 32) * 32 + 0x0b;
        }
        if (slot.row < world.rows - 1) {
          const nextBelow = world.getTile(slot.row + 1, nextCol);
          if (nextBelow === TILE.LADDER && (slot.y & 0x0f) !== 0 && slot.prom < 0x1f) {
            goDirectlyToApply = true;
          }
        }
        if (!goDirectlyToApply) {
          const prevState = slot.state;
          slot.state = 8;
          if (prevState === 2) {
            slot.aux = 0x0c;
          }
          slot.dir = horiz;
          return true;
        }
      }

      if (!goDirectlyToApply) {
        if (nextTile !== TILE.LADDER) return false;
        if (slot.row >= world.rows - 1) return false;
        const nextBelow = world.getTile(slot.row + 1, nextCol);
        if (nextBelow !== TILE.LADDER) return false;

        const onContCur = this.isContinuousLadder(slot.row, slot.col, world);
        if (!onContCur && slot.state === 1) {
          const xMod = slot.x & 0x0f;
          if (horiz & RIGHT) {
            if (xMod !== 7) return false;
          } else {
            if (xMod !== 9) return false;
          }
        }

        if (slot.state === 1) {
          slot.prom = 0;
          slot.topY = slot.y - 32;
        }
      }

      slot.aux = nextCol;
      slot.auxRow = slot.row;
      if (slot.state === 2 && slot.topY === slot.y) {
        slot.y += 8;
      }
      slot.state = 9;
      slot.dir = horiz;
      return true;
    }

    tryEnterLadder(slot, b, world) {
      const curTile = world.getTile(slot.row, slot.col);
      if (curTile === TILE.HOLE) return false;

      const canUp = curTile === TILE.LADDER;
      const canDown = slot.row < world.rows - 1 && world.getTile(slot.row + 1, slot.col) === TILE.LADDER;
      let avail = (canUp ? 2 : 0) | (canDown ? 1 : 0);
      if (avail !== 0 && ((slot.x + 6) & 0x0f) >= 12) {
        avail = 0;
      }
      slot.avail = avail;

      if (avail === 0) return false;
      if ((b & (UP | DOWN)) === 0) return false;
      const matched = ((b & (UP | DOWN)) >> 2) & avail;
      if (matched === 0) return false;
      if (matched !== 1 && slot.row === 0) return false;

      slot.dir = b & (UP | DOWN);
      this.snapX(slot, world);
      if (matched === 1) {
        slot.topY = slot.y;
        slot.prom = 31;
        slot.state = 3;
        slot.kind = "enter_top";
        slot.n = 1;
      } else {
        slot.topY = slot.y - 32;
        slot.prom = 1;
        slot.state = 3;
        slot.kind = "enter";
        slot.n = 1;
      }

      if (this.isContinuousLadder(slot.row, slot.col, world)) {
        if (slot.dir === UP) {
          slot.state = 2;
          slot.kind = null;
          slot.n = 0;
        } else {
          slot.state = 6;
          slot.kind = "enter_top_cont";
          slot.n = 1;
        }
      }
      return true;
    }

    finishLadderSegment(slot, world, arriveKind) {
      this.updateCR(slot, world);
      if (this.isContinuousLadder(slot.row, slot.col, world)) {
        if (slot.row === 0) {
          slot.state = 0;
          slot.kind = null;
          slot.n = 0;
          slot.avail = 0;
          return;
        }
        if (slot.dir & DOWN) {
          slot.topY = slot.y;
          slot.prom = 31;
        } else {
          slot.topY = slot.y - 32;
          slot.prom = 1;
        }
        slot.state = 6;
        slot.kind = "cont";
        slot.n = 1;
        slot.avail = (slot.row !== 0 ? 1 : 0) | (slot.row < world.rows - 1 ? 2 : 0);
        return;
      }
      slot.state = 3;
      slot.kind = arriveKind;
      slot.n = 1;
      slot.avail = 0;
    }

    step(slot, world) {
      this.updateCR(slot, world);
      const b = slot.bits;

      if (slot.state === 0) {
        if (this.tryEnterLadder(slot, b, world)) return;
        if (b & (LEFT | RIGHT)) {
          slot.dir = b & (LEFT | RIGHT);
          if ((slot.flag & 2) === 0) {
            this.snapY(slot);
          }
          if (!this.canPassWall(slot, b, world)) {
            this.snapIfContLadderIdle(slot, world);
            return;
          }
          slot.prom = 0;
          slot.state = 1;
          return;
        }
        this.snapIfContLadderIdle(slot, world);
      } else if (slot.state === 1) {
        if (this.tryEnterLadder(slot, b, world)) return;
        if (this.tryEnterHole(slot, world)) return;
        if (this.trySideTransition(slot, b, world)) return;
        if (!this.canPassWall(slot, b, world)) {
          slot.state = 0;
          slot.dir = (slot.dir + 1) & 0xff;
          return;
        }
        if ((b & (LEFT | RIGHT)) && (b & (LEFT | RIGHT)) === (slot.dir & (LEFT | RIGHT))) {
          const stepX = (slot.dir & LEFT) ? -1 : 1;
          slot.x = world.wrapX(slot.x + stepX);
        } else {
          slot.state = 0;
          slot.dir = (slot.dir + 1) & 0xff;
        }
      } else if (slot.state === 3) {
        slot.n += 1;
        let limit = 6;
        if (slot.kind === "arrive_top") {
          limit = 12;
        } else if (slot.kind === "enter_top") {
          limit = slot.isMario ? 12 : 9;
        }
        if (slot.n >= limit) {
          slot.state = (slot.kind === "enter" || slot.kind === "enter_top") ? 2 : 0;
          slot.kind = null;
          slot.n = 0;
        }
      } else if (slot.state === 5) {
        this.snapX(slot, world);
        slot.prom += 1;
        let spd = FALL_TABLE[slot.prom];
        if (spd < 0) {
          slot.prom -= 1;
          spd = FALL_TABLE[slot.prom];
        }
        slot.y = slot.topY + spd;
        slot.topY = slot.y;

        // 最下段の床ガード
        const maxFloorY = world.rows * 32;
        if (slot.y >= maxFloorY) {
          slot.y = maxFloorY;
          slot.topY = maxFloorY;
          slot.flag &= ~0x02;
          slot.state = 0;
          slot.prom = 0;
          return;
        }

        if (((slot.y + 2) & 0x1f) < 4) {
          this.snapY(slot);
          this.updateCR(slot, world);
          const t = world.getTile(slot.row, slot.col);
          const isHole = (t === TILE.HOLE) && (slot.row < world.rows - 1);
          const isContLad = this.isContinuousLadder(slot.row, slot.col, world);
          if (!isHole && !isContLad) {
            slot.state = 0;
            slot.prom = 0;
            return;
          }
        }

        const yMod = slot.y & 0x1f;
        if (yMod >= 0x0b &&
            yMod < 0x0f &&
            slot.row < world.rows - 1 &&
            world.getTile(slot.row + 1, slot.col) === TILE.WALL) {
          slot.flag |= 2;
          slot.y = Math.floor(slot.y / 32) * 32 + 0x0b;
          slot.topY = Math.floor(slot.y / 16) * 16;
          slot.state = 0;
          slot.prom = 0;
          return;
        }

        slot.y = slot.topY;
      } else if (slot.state === 6) {
        if (b & (LEFT | RIGHT)) {
          slot.dir = b & (LEFT | RIGHT);
          if (slot.prom < 10) {
            if ((slot.flag & 2) === 0) {
              this.snapY(slot);
            }
            if (this.canPassWall(slot, b, world)) {
              slot.prom = 0;
              slot.state = 1;
              slot.kind = null;
              slot.n = 0;
              return;
            }
          }
        }
        slot.n += 1;
        const limit = slot.kind === "enter_top_cont" ? 16 : 12;
        if (slot.n >= limit) {
          slot.state = 2;
          slot.kind = null;
          slot.n = 0;
        }
      } else if (slot.state === 8) {
        slot.x = world.wrapX(slot.x + (slot.dir === RIGHT ? 1 : -1));
        slot.aux -= 1;
        if (slot.aux === 0) {
          slot.aux = 1;
          this.tryEnterHole(slot, world);
        }
      } else if (slot.state === 9) {
        slot.x = world.wrapX(slot.x + (slot.dir === RIGHT ? 1 : -1));
        this.updateCR(slot, world);
        if (slot.row === slot.auxRow && slot.col === slot.aux && (slot.x & 0x0f) === 0) {
          if (slot.flag & 2) {
            slot.flag &= ~0x02;
            slot.prom = 0x1d;
            slot.topY = Math.floor(slot.y / 32) * 32;
          }
          slot.state = (slot.prom !== 0) ? 2 : 0;
        }
      } else if (slot.state === 2) {
        slot.flag &= ~0x02;
        if (this.trySideTransition(slot, b, world)) return;
        if (b & (UP | DOWN)) {
          slot.dir = b & (UP | DOWN);
          const d = (slot.dir & DOWN) ? -1 : 1;
          const nextProm = slot.prom + d;
          const curTile = world.getTile(slot.row, slot.col);
          if (nextProm === 0x1f && (curTile === TILE.WALL || curTile === TILE.HOLE)) {
            return;
          }
          slot.prom = nextProm;
          if (slot.prom >= 32) {
            slot.y = slot.topY;
            slot.prom = 0;
            this.finishLadderSegment(slot, world, "arrive_top");
          } else if (slot.prom <= 0) {
            slot.y = slot.topY + 32;
            slot.prom = 0;
            this.finishLadderSegment(slot, world, "arrive");
          } else {
            slot.y = slot.topY + relYOfProm(slot.prom);
          }
          return;
        }
        if (b & (LEFT | RIGHT)) {
          slot.dir = b & (LEFT | RIGHT);
          const canExit = slot.prom < 10 || (slot.prom >= 31 && this.isContinuousLadder(slot.row, slot.col, world));
          if (canExit) {
            if ((slot.flag & 2) === 0) {
              this.snapY(slot);
            }
            if (!this.canPassWall(slot, b, world)) return;
            slot.prom = 0;
            slot.state = 1;
          }
        }
      }
    }
  }

  class SpikeAI {
    constructor() {
      this.mem39 = 4;
      this.timer = 0;
    }

    update(world) {
      const sp = world.spike;
      const ma = world.mario;

      if (ma.row === sp.row && sp.y === ma.y) {
        let v = (this.timer - 1) & 0xff;
        if (v >= 0x80) {
          v = 0x20;
          if (ma.dir === this.mem39) {
            v = 0;
            sp.bits = this.horizontalVsMario(ma, sp);
          }
        }
        this.timer = v;
        this.mem39 = ma.dir;
        this.wallAvoid(world, 0, 0);
        return;
      }

      const vert = (ma.row !== sp.row)
        ? (sp.row > ma.row ? UP : DOWN)
        : (sp.y > ma.y ? UP : DOWN);
      const { horiz, bestRow, bestCol } = this.horizontalVsLadder(world, vert);
      sp.bits = vert | horiz;
      this.wallAvoid(world, bestRow, bestCol);
    }

    wallAvoid(world, bestRow, bestCol) {
      const sp = world.spike;
      const ma = world.mario;
      const horiz = sp.bits & 0x03;
      if (horiz === 0) return;

      const isRight = (horiz & RIGHT) !== 0;
      let wallCol = null;

      if (isRight) {
        for (let c = sp.col + 1; c < world.cols; c++) {
          if (world.getTile(sp.row, c) === TILE.WALL) {
            wallCol = c;
            break;
          }
        }
      } else {
        for (let c = sp.col - 1; c >= 0; c--) {
          if (world.getTile(sp.row, c) === TILE.WALL) {
            wallCol = c;
            break;
          }
        }
      }

      if (wallCol === null) return;

      const sameRow = ma.row === sp.row;
      const wallPos = sp.row * world.cols + wallCol;
      const maPos = ma.row * world.cols + ma.col;

      if (isRight) {
        if (!sameRow && wallCol >= bestCol) return;
        if (wallPos >= maPos) return;
      } else {
        if (!sameRow && wallCol < bestCol) return;
        if (wallPos < maPos) return;
      }
      sp.bits ^= 0x03;
    }

    horizontalVsLadder(world, vert) {
      const sp = world.spike;
      const searchRow = vert === UP ? sp.row : Math.min(world.rows - 1, sp.row + 1);
      let bestCol = 0;
      let bestRow = 0;
      let minDist = world.cols + 1;
      let found = false;

      for (let c = 0; c < world.cols; c++) {
        if (world.getTile(searchRow, c) === TILE.LADDER) {
          const dist = Math.abs(c - sp.col);
          if (dist < minDist) {
            minDist = dist;
            bestCol = c;
            bestRow = searchRow;
            found = true;
          }
        }
      }

      if (!found) {
        bestRow = 0;
        bestCol = 0;
      }

      const bestPos = bestRow * world.cols + bestCol;
      const spPos = searchRow * world.cols + sp.col;

      if (bestPos === spPos) {
        return { horiz: sp.dir & 0x03, bestRow, bestCol };
      }
      return { horiz: bestPos < spPos ? LEFT : RIGHT, bestRow, bestCol };
    }

    horizontalVsMario(ma, sp) {
      if (ma.col === sp.col) return 0;
      return ma.col < sp.col ? LEFT : RIGHT;
    }
  }

  class GameWorld {
    constructor(config = {}) {
      this.cols = config.cols || 16;
      this.rows = config.rows || 8;
      this.worldWidth = this.cols * 16;
      this.f = 0;
      this.tiles = new Uint8Array(this.cols * this.rows);

      const stepper = new ActorStepper();
      this.stepper = stepper;
      this.mario = new Actor(true);
      this.spike = new Actor(false);
      this.spikeAI = new SpikeAI();

      if (config.tiles) {
        this.loadTiles(config.tiles);
      }
      if (config.mario) {
        Object.assign(this.mario, config.mario);
      }
      if (config.spike) {
        Object.assign(this.spike, config.spike);
      }
      if (config.spikeAI) {
        Object.assign(this.spikeAI, config.spikeAI);
      }

      this.stepper.updateCR(this.mario, this);
      this.stepper.updateCR(this.spike, this);
    }

    wrapX(x) {
      const w = this.worldWidth;
      return ((x % w) + w) % w;
    }

    wrapCol(col) {
      const c = this.cols;
      return ((col % c) + c) % c;
    }

    loadTiles(src) {
      if (Array.isArray(src)) {
        for (const item of src) {
          this.setTile(item[0], item[1], item[2]);
        }
      } else {
        for (const [k, v] of Object.entries(src)) {
          if (k.includes(",")) {
            const [r, c] = k.split(",").map(Number);
            this.setTile(r, c, v);
          } else {
            const addr = Number(k);
            const pos = addr >= 0x500 ? addr - 0x500 : addr;
            const r = (pos >> 4) & 0x0f;
            const c = pos & 0x0f;
            this.setTile(r, c, v);
          }
        }
      }
    }

    setTile(row, col, val) {
      if (row < 0 || row >= this.rows) return;
      const wc = this.wrapCol(col);
      this.tiles[row * this.cols + wc] = val;
    }

    getTile(row, col) {
      if (row < 0 || row >= this.rows) return TILE.EMPTY;
      const wc = this.wrapCol(col);
      return this.tiles[row * this.cols + wc];
    }

    step(inputBits = 0) {
      let b = inputBits;
      if ((b & (LEFT | RIGHT)) === (LEFT | RIGHT)) {
        b &= ~(LEFT | RIGHT);
      }
      if ((b & (UP | DOWN)) === (UP | DOWN)) {
        b &= ~(UP | DOWN);
      }

      this.mario.bits = b;
      this.stepper.step(this.mario, this);

      if (this.f % 2 === 1) {
        this.spikeAI.update(this);
      }
      this.stepper.step(this.spike, this);
      this.f += 1;
    }
  }

  const api = {
    RIGHT, LEFT, DOWN, UP,
    TILE,
    Actor,
    ActorStepper,
    SpikeAI,
    GameWorld
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.WreckGame = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);